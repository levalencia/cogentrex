import type { EncryptionService } from '../security/encryption.js';
import type { LinkedInTokenRepository } from './linkedInTokenRepository.js';
import type { AppLogger } from '../observability/logger.js';
import { readFileSync } from 'fs';

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

interface PersonProfile {
  id: string;
}

interface RegisterUploadResponse {
  value: {
    uploadMechanism: {
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
        uploadUrl: string;
      };
    };
    asset: string;
  };
}

export class LinkedInPostService {
  constructor(
    private readonly tokens: LinkedInTokenRepository,
    private readonly encryption: EncryptionService,
    private readonly config: LinkedInConfig,
    private readonly logger: AppLogger,
  ) {}

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state,
      scope: 'openid profile w_member_social',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LinkedIn token exchange failed: ${response.status} ${text}`);
    }
    const data = await response.json() as AccessTokenResponse;
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  async fetchPersonUrn(accessToken: string): Promise<string | null> {
    // Try OpenID Connect userinfo first (works with "Sign In with LinkedIn using OpenID Connect" product)
    try {
      const oidcResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (oidcResponse.ok) {
        const data = await oidcResponse.json() as { sub?: string };
        if (data.sub) {
          const id = data.sub.startsWith('urn:li:person:') ? data.sub : `urn:li:person:${data.sub}`;
          this.logger.info({ endpoint: 'userinfo', id }, 'linkedin_person_urn_fetched_oidc');
          return id;
        }
      } else {
        const text = await oidcResponse.text();
        this.logger.warn({ status: oidcResponse.status, response: text }, 'linkedin_userinfo_failed');
      }
    } catch (error) {
      this.logger.warn({ error }, 'linkedin_userinfo_exception');
    }

    // Fallback to legacy /v2/me
    const response = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });
    if (!response.ok) {
      const text = await response.text();
      this.logger.warn({ status: response.status, response: text }, 'linkedin_profile_fetch_failed');
      return null;
    }
    const data = await response.json() as PersonProfile;
    return `urn:li:person:${data.id}`;
  }

  async connect(userId: string, code: string): Promise<void> {
    const { accessToken, expiresIn } = await this.exchangeCode(code);
    const personUrn = await this.fetchPersonUrn(accessToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresIn * 1000).toISOString();
    this.tokens.upsert(
      userId,
      this.encryption.encrypt(accessToken),
      personUrn,
      expiresAt,
      now.toISOString(),
    );
    this.logger.info({ userId, personUrn }, 'linkedin_connected');
  }

  disconnect(userId: string): void {
    this.tokens.delete(userId);
    this.logger.info({ userId }, 'linkedin_disconnected');
  }

  getStatus(userId: string): { connected: boolean; personUrn?: string | undefined; needsPersonUrn?: boolean | undefined } {
    const token = this.tokens.findByUser(userId);
    if (!token) return { connected: false };
    return { connected: true, personUrn: token.personUrn ?? undefined, needsPersonUrn: !token.personUrn };
  }

  setPersonUrn(userId: string, personUrn: string): void {
    const normalized = personUrn.startsWith('urn:li:person:') ? personUrn : `urn:li:person:${personUrn}`;
    this.tokens.updatePersonUrn(userId, normalized, new Date().toISOString());
    this.logger.info({ userId }, 'linkedin_person_urn_updated');
  }

  private async getAccessToken(userId: string): Promise<string> {
    const token = this.tokens.findByUser(userId);
    if (!token) throw new Error('LinkedIn not connected');
    return this.encryption.decrypt(token.encryptedAccessToken);
  }

  async postText(userId: string, content: string, visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC'): Promise<string> {
    const accessToken = await this.getAccessToken(userId);
    const token = this.tokens.findByUser(userId)!;
    const personUrn = token.personUrn;
    if (!personUrn) {
      throw new Error('LinkedIn is connected, but the Person URN is missing. Add the Sign In with LinkedIn/OpenID product or enter your LinkedIn Person URN in Social Settings.');
    }

    const body = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LinkedIn post failed: ${response.status} ${text}`);
    }

    const postId = response.headers.get('x-restli-id') ?? 'unknown';
    this.logger.info({ userId, postId, visibility }, 'linkedin_posted_text');
    return postId;
  }

  async postWithImage(
    userId: string,
    content: string,
    imageFilePath: string,
    visibility: 'PUBLIC' | 'CONNECTIONS' = 'PUBLIC',
  ): Promise<string> {
    const accessToken = await this.getAccessToken(userId);
    const token = this.tokens.findByUser(userId)!;
    const personUrn = token.personUrn;
    if (!personUrn) {
      throw new Error('LinkedIn is connected, but the Person URN is missing. Add the Sign In with LinkedIn/OpenID product or enter your LinkedIn Person URN in Social Settings.');
    }

    // Step 1: Register upload
    const registerBody = {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    };

    const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(registerBody),
    });

    if (!registerResponse.ok) {
      const text = await registerResponse.text();
      throw new Error(`LinkedIn register upload failed: ${registerResponse.status} ${text}`);
    }

    const registerData = await registerResponse.json() as RegisterUploadResponse;
    const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const assetUrn = registerData.value.asset;

    // Step 2: Upload binary
    const imageBuffer = readFileSync(imageFilePath);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/png',
      },
      body: imageBuffer,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text();
      throw new Error(`LinkedIn image upload failed: ${uploadResponse.status} ${text}`);
    }

    // Step 3: Create share with image
    const postBody = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              media: assetUrn,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(postBody),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LinkedIn image post failed: ${response.status} ${text}`);
    }

    const postId = response.headers.get('x-restli-id') ?? 'unknown';
    this.logger.info({ userId, postId, assetUrn, visibility }, 'linkedin_posted_image');
    return postId;
  }
}
