import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { ProviderService } from '../providers/providerService.js';
import type { ConversationRepository } from '../chat/conversationRepository.js';
import type { MediaRepository, MediaArtifactRecord } from './mediaRepository.js';
import type { AppLogger } from '../observability/logger.js';
import { notFound } from '../http/errors.js';
import type { ChatMessage, ImageGenerationOptions, ProviderConfigView } from '@cogentrex/shared';
import type { LanguageModelClient } from '../chat/languageModel.js';

const MEDIA_DIR = resolve(process.cwd(), 'data', 'media');
if (!existsSync(MEDIA_DIR)) {
  mkdirSync(MEDIA_DIR, { recursive: true });
}

export interface MediaGenerationResult {
  messages: ChatMessage[];
  conversationId: string;
  artifact: MediaArtifactRecord;
}

const IMAGE_PROVIDER_TIMEOUT_MS = 220_000; // Keep below ingress/client timeouts so failures return cleanly.

export class MediaService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly providers: ProviderService,
    private readonly media: MediaRepository,
    private readonly llm: LanguageModelClient,
    private readonly logger: AppLogger,
    private readonly apiBaseUrl: string,
  ) {}

  async generate(input: {
    userId: string;
    type: 'image' | 'video';
    prompt: string;
    conversationId?: string | undefined;
    providerId?: string | undefined;
    options?: ImageGenerationOptions | undefined;
  }): Promise<MediaGenerationResult> {
    const now = nowIso();
    const { userId, type, prompt, conversationId, providerId, options } = input;

    // Extract inputImages from options for editing workflows
    const inputImages = options?.inputImages;

    // Resolve provider
    let provider: Awaited<ReturnType<ProviderService['resolve']>>;
    if (providerId) {
      provider = await this.providers.resolve(userId, providerId);
    } else {
      const mode = type === 'image' ? 'IMAGE_GENERATION' : 'VIDEO_GENERATION';
      const all = await this.providers.list(userId);

      // 1. Prefer per-mode default
      let candidate = all.find((p) => p.defaultForMode === mode);

      // 2. Fall back to first provider that supports this media type
      const isSuitable = (p: ProviderConfigView) =>
        type === 'image'
          ? p.kind === 'IMAGE_GENERATION' || p.supportsImage
          : p.kind === 'VIDEO_GENERATION' || p.supportsVideo;

      if (!candidate || !isSuitable(candidate)) {
        candidate = all.find(isSuitable);
      }

      // 3. Last resort: global default (might fail, but gives a clear error)
      if (!candidate) {
        candidate = all.find((p) => p.isDefault);
      }

      if (!candidate) throw notFound('No suitable media provider found');
      provider = await this.providers.resolve(userId, candidate.id);
    }

    this.logger.info({ userId, type, providerId: provider.id, model: provider.model, promptLength: prompt.length, options, hasInputImages: inputImages && inputImages.length > 0 }, 'media_generation_started');

    // Resolve or create conversation
    let conversation: Awaited<ReturnType<ConversationRepository['create']>>;
    if (conversationId) {
      const existing = await this.conversations.findForUser(userId, conversationId);
      if (!existing) {
        this.logger.warn({ userId, conversationId }, 'media_generation_conversation_not_found');
        throw notFound('Conversation not found');
      }
      conversation = existing;
    } else {
      conversation = await this.conversations.create({
        id: createId('cnv'),
        userId,
        title: prompt.slice(0, 80),
        mode: type === 'image' ? 'IMAGE_GENERATION' : 'VIDEO_GENERATION',
        now,
      });
    }

    // Add user message with options metadata
    const userMsgPayload: Parameters<ConversationRepository['addMessage']>[0] = {
      id: createId('msg'),
      conversationId: conversation.id,
      role: 'user',
      content: prompt,
      now,
    };
    if (options) {
      userMsgPayload.metadata = { imageOptions: options };
    }
    await this.conversations.addMessage(userMsgPayload);

    // Create pending artifact
    const artifact = await this.media.create({
      userId,
      conversationId: conversation.id,
      prompt,
      type,
      providerId: provider.id,
      status: 'pending',
    });

    // Attempt generation
    const startedAt = performance.now();
    try {
      const imageUrl = await this.callProvider(provider, type, prompt, options, inputImages);

      // Extract localPath if the returned URL is a locally-served file
      const localPath = imageUrl.includes('/api/media/files/')
        ? imageUrl.split('/api/media/files/').pop()!
        : undefined;

      await this.media.updateStatus(artifact.id, 'completed', { blobUrl: imageUrl, ...(localPath ? { localPath } : {}) });
      const completedArtifact = (await this.media.findById(userId, artifact.id))!;

      // Add assistant message with image URL
      const artifactContent = type === 'image'
        ? `![Generated Image](${imageUrl})`
        : `[Generated Video](${imageUrl})`;
      await this.conversations.addMessage({
        id: createId('msg'),
        conversationId: conversation.id,
        role: 'assistant',
        content: artifactContent,
        now: nowIso(),
      });

      this.logger.info({ userId, artifactId: artifact.id, providerId: provider.id, durationMs: Math.round(performance.now() - startedAt) }, 'media_generation_completed');
      const messages = await this.conversations.listMessages(conversation.id);
      return { messages, conversationId: conversation.id, artifact: completedArtifact };
    } catch (error) {
      await this.media.updateStatus(artifact.id, 'failed');
      const message = error instanceof Error ? error.message : 'Media generation failed';
      this.logger.error({ userId, artifactId: artifact.id, providerId: provider.id, errorMessage: message }, 'media_generation_failed');

      // Store error as assistant message for inline display
      await this.conversations.addMessage({
        id: createId('msg'),
        conversationId: conversation.id,
        role: 'assistant',
        content: `❌ **Generation failed:** ${message}`,
        now: nowIso(),
      });

      const messages = await this.conversations.listMessages(conversation.id);
      return { messages, conversationId: conversation.id, artifact };
    }
  }

  private async callProvider(provider: Awaited<ReturnType<ProviderService['resolve']>>, type: 'image' | 'video', prompt: string, options?: ImageGenerationOptions, inputImages?: string[]): Promise<string> {
    if (type === 'image') {
      return await this.generateImage(provider, prompt, options, inputImages);
    }
    // Video generation: attempt endpoint; if unavailable return placeholder for now
    try {
      const response = await fetch(`${provider.baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({ model: provider.model, prompt }),
      });
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ url?: string }> };
        const url = data.data?.[0]?.url;
        if (url) return url;
      }
    } catch {
      // fallthrough
    }
    // Placeholder for video until real API is available
    return `https://placehold.co/640x360/1a1a2e/FFF?text=Video+Placeholder`;
  }

  private async generateImage(provider: Awaited<ReturnType<ProviderService['resolve']>>, prompt: string, options?: ImageGenerationOptions, inputImages?: string[]): Promise<string> {
    const isFlux = provider.model.toLowerCase().includes('flux') || provider.model.toLowerCase().includes('blackforest');
    const isAzure = provider.baseUrl.includes('azure.com') || provider.baseUrl.includes('services.ai.azure.com');
    const isGptImage = provider.model.toLowerCase().includes('gpt-image');

    // Editing workflow: inputImages provided
    if (inputImages && inputImages.length > 0) {
      if (isFlux && isAzure) {
        return await this.editWithFlux(provider, prompt, inputImages, options);
      }
      if (isGptImage && isAzure) {
        return await this.editWithGptImage(provider, prompt, inputImages, options);
      }
      // Fallback: try passing input_images as base64 to standard endpoint (unlikely to work but safe)
      this.logger.warn({ providerId: provider.id, model: provider.model }, 'editing_not_supported_for_provider');
      throw new Error('Image editing is not supported for this provider. Use FLUX or gpt-image models.');
    }

    // Standard generation (no input images)
    // Determine endpoint and payload format
    let endpointUrl: string;
    let buildBody: () => Record<string, unknown>;
    let parseResponse: (data: unknown) => string;

    if (isFlux && isAzure) {
      // FLUX uses a different Azure endpoint: /providers/blackforestlabs/v1/{model-slug}?api-version=preview
      // Extract domain from baseUrl (e.g., https://opencodelv-resource.services.ai.azure.com/openai/v1)
      const domainMatch = provider.baseUrl.match(/^(https?:\/\/[^\/]+)/);
      const domain = domainMatch ? domainMatch[1] : provider.baseUrl;
      const modelSlug = provider.model.toLowerCase().replace(/\./g, '-'); // FLUX.2-pro -> flux-2-pro
      endpointUrl = `${domain}/providers/blackforestlabs/v1/${modelSlug}?api-version=preview`;

      buildBody = () => {
        const sizeMatch = (options?.size ?? '1024x1024').match(/^(\d+)x(\d+)$/);
        const width = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 1024;
        const height = sizeMatch && sizeMatch[2] ? parseInt(sizeMatch[2], 10) : 1024;
        return {
          model: provider.model,
          prompt,
          width,
          height,
          n: options?.n ?? 1,
        };
      };

      parseResponse = (data) => {
        const d = data as { data?: Array<{ b64_json?: string }> };
        const b64 = d.data?.[0]?.b64_json;
        if (!b64) throw new Error('FLUX provider did not return base64 image data');
        return this.saveBase64Image(b64);
      };
    } else {
      // Standard OpenAI-compatible /images/generations endpoint
      endpointUrl = `${provider.baseUrl}/images/generations`;

      // Provider-specific quality whitelist
      const isAzureOrGptImage = isAzure || isGptImage;
      const sanitizedQuality = (() => {
        if (!options?.quality || options.quality === 'auto') return undefined;
        // Azure gpt-image-2 only supports low, medium, high
        if (isAzureOrGptImage) {
          const allowed = ['low', 'medium', 'high'];
          if (allowed.includes(options.quality)) return options.quality;
          this.logger.warn({ providerId: provider.id, model: provider.model, requestedQuality: options.quality }, 'image_quality_unsupported_for_provider');
          return undefined;
        }
        // OpenAI DALL-E and others typically support standard, hd
        const allowed = ['standard', 'hd'];
        if (allowed.includes(options.quality)) return options.quality;
        this.logger.warn({ providerId: provider.id, model: provider.model, requestedQuality: options.quality }, 'image_quality_unsupported_for_provider');
        return undefined;
      })();

      buildBody = () => {
        const body: Record<string, unknown> = { model: provider.model, prompt };
        if (options?.n !== undefined && options.n > 0) body.n = options.n;
        if (options?.size) body.size = options.size;
        if (sanitizedQuality) body.quality = sanitizedQuality;
        if (options?.style) body.style = options.style;
        if (options?.responseFormat) body.response_format = options.responseFormat;
        return body;
      };

      parseResponse = (data) => {
        const d = data as { data?: Array<{ url?: string; b64_json?: string }> };
        const first = d.data?.[0];
        if (!first) throw new Error('Provider did not return image data');
        if (first.url) return first.url;
        if (first.b64_json) return this.saveBase64Image(first.b64_json);
        throw new Error('Provider did not return an image URL or base64 data');
      };
    }

    // Full request with timeout
    const startedAt = performance.now();
    const requestBody = buildBody();
    this.logger.info({
      providerId: provider.id,
      model: provider.model,
      endpoint: endpointUrl,
      isFlux,
      timeoutMs: IMAGE_PROVIDER_TIMEOUT_MS,
    }, 'image_provider_request_started');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const durationMs = Math.round(performance.now() - startedAt);
      this.logger.info({ providerId: provider.id, model: provider.model, statusCode: response.status, durationMs }, 'image_provider_response_received');

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Provider returned ${response.status}: ${text}`);
      }

      const data = await response.json();
      return parseResponse(data);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Provider timed out after ${Math.round(IMAGE_PROVIDER_TIMEOUT_MS / 1000)} seconds`);
      }
      this.logger.error({ providerId: provider.id, model: provider.model, endpoint: endpointUrl, errorMessage: error instanceof Error ? error.message : 'Provider request failed' }, 'image_provider_request_failed');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async editWithFlux(provider: Awaited<ReturnType<ProviderService['resolve']>>, prompt: string, inputImages: string[], options?: ImageGenerationOptions): Promise<string> {
    const domainMatch = provider.baseUrl.match(/^(https?:\/\/[^\/]+)/);
    const domain = domainMatch ? domainMatch[1] : provider.baseUrl;
    const modelSlug = provider.model.toLowerCase().replace(/\./g, '-');
    const endpointUrl = `${domain}/providers/blackforestlabs/v1/${modelSlug}?api-version=preview`;

    // Read uploaded images from disk and convert to base64
    const base64Images = inputImages.map((filename) => {
      const filepath = resolve(MEDIA_DIR, filename);
      if (!filepath.startsWith(MEDIA_DIR)) throw new Error('Invalid image path');
      if (!existsSync(filepath)) throw new Error(`Image file not found: ${filename}`);
      return readFileSync(filepath).toString('base64');
    });

    const sizeMatch = (options?.size ?? '1024x1024').match(/^(\d+)x(\d+)$/);
    const width = sizeMatch && sizeMatch[1] ? parseInt(sizeMatch[1], 10) : 1024;
    const height = sizeMatch && sizeMatch[2] ? parseInt(sizeMatch[2], 10) : 1024;

    const body: Record<string, unknown> = {
      model: provider.model,
      prompt,
      width,
      height,
      n: options?.n ?? 1,
      input_image: base64Images[0],
    };
    if (base64Images[1]) body.input_image_2 = base64Images[1];
    if (base64Images[2]) body.input_image_3 = base64Images[2];
    if (base64Images[3]) body.input_image_4 = base64Images[3];
    if (base64Images[4]) body.input_image_5 = base64Images[4];
    if (base64Images[5]) body.input_image_6 = base64Images[5];
    if (base64Images[6]) body.input_image_7 = base64Images[6];
    if (base64Images[7]) body.input_image_8 = base64Images[7];

    this.logger.info({ providerId: provider.id, model: provider.model, endpoint: endpointUrl, refCount: base64Images.length }, 'flux_image_edit_started');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Provider returned ${response.status}: ${text}`);
      }

      const data = await response.json() as { data?: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('FLUX editing provider did not return base64 image data');
      return this.saveBase64Image(b64);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Provider timed out after ${Math.round(IMAGE_PROVIDER_TIMEOUT_MS / 1000)} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async editWithGptImage(provider: Awaited<ReturnType<ProviderService['resolve']>>, prompt: string, inputImages: string[], options?: ImageGenerationOptions): Promise<string> {
    const endpointUrl = `${provider.baseUrl}/openai/deployments/${provider.model}/images/edits?api-version=2025-04-01-preview`;

    if (inputImages.length === 0) throw new Error('No input images provided for editing');

    const sourceImage = inputImages[0]!;
    const filepath = resolve(MEDIA_DIR, sourceImage);
    if (!filepath.startsWith(MEDIA_DIR)) throw new Error('Invalid image path');
    if (!existsSync(filepath)) throw new Error(`Image file not found: ${sourceImage}`);

    const buffer = readFileSync(filepath);
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: 'image/png' }), sourceImage);
    formData.append('prompt', prompt);
    if (options?.n !== undefined && options.n > 0) formData.append('n', String(options.n));
    if (options?.size) formData.append('size', options.size);
    if (options?.responseFormat) formData.append('response_format', options.responseFormat);

    this.logger.info({ providerId: provider.id, model: provider.model, endpoint: endpointUrl }, 'gpt_image_edit_started');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_PROVIDER_TIMEOUT_MS);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(`Provider returned ${response.status}: ${text}`);
      }

      const data = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> };
      const first = data.data?.[0];
      if (!first) throw new Error('Provider did not return image data');
      if (first.url) return first.url;
      if (first.b64_json) return this.saveBase64Image(first.b64_json);
      throw new Error('Provider did not return an image URL or base64 data');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Provider timed out after ${Math.round(IMAGE_PROVIDER_TIMEOUT_MS / 1000)} seconds`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private saveBase64Image(base64Data: string): string {
    const id = createId('img');
    const filename = `${id}.png`;
    const filepath = resolve(MEDIA_DIR, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    writeFileSync(filepath, buffer);
    this.logger.info({ fileId: id, sizeBytes: buffer.length }, 'image_saved_to_disk');
    return `${this.apiBaseUrl}/api/media/files/${filename}`;
  }

  async analyzeImages(userId: string, filenames: string[]): Promise<string> {
    // Find first vision-capable provider
    const allProviders = await this.providers.list(userId);
    const visionProviderRecord = allProviders.find((p) => p.supportsVision);
    if (!visionProviderRecord) {
      this.logger.warn({ userId }, 'vision_analysis_no_vision_provider');
      return '';
    }
    const visionProvider = await this.providers.resolve(userId, visionProviderRecord.id);

    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = [];
    for (const filename of filenames) {
      const filepath = resolve(MEDIA_DIR, filename);
      if (!filepath.startsWith(MEDIA_DIR)) continue;
      try {
        const data = readFileSync(filepath);
        const base64 = Buffer.from(data).toString('base64');
        imageParts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } });
      } catch {
        this.logger.warn({ userId, filename }, 'vision_image_read_failed');
      }
    }

    if (!imageParts.length) return '';

    const messages = [
      {
        role: 'system' as const,
        content: 'You are a visual analyst. Describe the key visual elements, themes, and any text visible in the image(s). Summarize in 2-4 sentences what these images convey. Be concise and factual.',
      },
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: 'Describe what these images show:' },
          ...imageParts,
        ],
      },
    ];

    try {
      const analysis = await this.llm.complete(visionProvider, messages);
      this.logger.info({ userId, durationMs: Math.round(performance.now()) }, 'vision_analysis_finished');
      return analysis.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vision analysis failed';
      this.logger.error({ userId, errorMessage: message }, 'vision_analysis_failed');
      return '';
    }
  }

  async enhancePrompt(
    userId: string,
    prompt: string,
    style?: string,
    context?: string,
    providerId?: string,
    imageType?: string,
    targetProviderId?: string,
  ): Promise<string> {
    let chatProvider: Awaited<ReturnType<ProviderService['resolve']>> | undefined;

    // If a specific provider is requested, try it first
    if (providerId) {
      try {
        const resolved = await this.providers.resolve(userId, providerId);
        // Validate it's a text provider
        if (resolved.kind !== 'IMAGE_GENERATION' && resolved.kind !== 'VIDEO_GENERATION') {
          chatProvider = resolved;
        }
      } catch {
        // Fall through to auto-resolve below
      }
    }

    // Auto-resolve if no valid provider was explicitly selected
    if (!chatProvider) {
      try {
        const resolved = await this.providers.resolveForMode(userId, 'CHAT');
        if (resolved.kind === 'IMAGE_GENERATION' || resolved.kind === 'VIDEO_GENERATION') {
          throw new Error('Chat default is an image/video provider');
        }
        chatProvider = resolved;
      } catch {
        const all = await this.providers.list(userId);
        const fallback = all.find(
          (p) =>
            !p.kind.includes('IMAGE') &&
            !p.kind.includes('VIDEO') &&
            (p.supportsStreaming || p.kind === 'AZURE_FOUNDRY' || p.kind === 'OPENAI_COMPATIBLE' || p.kind === 'ANTHROPIC' || p.kind === 'GOOGLE'),
        );
        if (!fallback) {
          this.logger.warn({ userId }, 'enhance_prompt_no_text_provider');
          return prompt;
        }
        chatProvider = await this.providers.resolve(userId, fallback.id);
      }
    }

    // Determine if the target image provider is FLUX
    let isFluxTarget = false;
    const providerToCheck = targetProviderId ?? providerId;
    if (providerToCheck) {
      try {
        const targetProvider = await this.providers.resolve(userId, providerToCheck);
        isFluxTarget = targetProvider.kind === 'IMAGE_GENERATION' && targetProvider.model.toLowerCase().includes('flux');
      } catch {
        // Ignore resolve errors
      }
    }

    const styleHint = style ? `Make it ${style}. ` : '';
    const contextBlock = context ? `\n\nAdditional context to incorporate:\n${context}` : '';

    let systemContent: string;
    if (isFluxTarget) {
      const baseFluxRules = `You are an expert FLUX image prompt engineer. FLUX models excel with natural language descriptions.

CRITICAL FLUX RULES:
- Use natural language (clear descriptions, not keyword lists)
- Be specific and detailed about every visual element
- For TEXT IN IMAGES (three-step approach):
  1. Enclose exact text in quotation marks: "COFFEE SHOP"
  2. Describe placement: "The text 'OPEN' appears in red neon letters above the door"
  3. Specify font style: "elegant serif typography" or "bold industrial sans-serif lettering"
- Typography guidance: specify font size ("large headline text", "small body copy"), color (use hex codes for brand text: "The logo text 'ACME' in color #FF5733")
- Include rich details: subject, location, style, camera settings, lighting, colors, effects, additional elements
- Start with a clear description and add detail progressively`;

      const typeSpecific = (() => {
        switch (imageType) {
          case 'infographic':
            return `\n\nINFOGRAPHIC-SPECIFIC GUIDANCE:\n- Explicit layout structure: steps, sections, columns, or flow\n- Content hierarchy: main title, sections, callouts\n- Use simple icons and minimal text labels\n- Specify visual style: minimalist, colorful, corporate, educational\n- Describe color palette explicitly\n- For any text: apply the three-step text approach above\n- Include numbered or bulleted lists with clear visual separation`;
          case 'diagram':
            return `\n\nDIAGRAM-SPECIFIC GUIDANCE:\n- Explicit layout: nodes, connections, arrows, labels\n- Describe node shapes: circles, rounded squares, rectangles, pills\n- Specify connection styles: arrows, lines, dotted lines\n- For labeled elements: apply the three-step text approach\n- Describe color coding for different categories\n- Specify background: white, dark, gradient\n- Include clear visual hierarchy from input to output`;
          case 'photo':
            return `\n\nPHOTO-SPECIFIC GUIDANCE:\n- Follow the prompt formula: [SUBJECT], [LOCATION], [STYLE], [CAMERA SETTINGS], [LIGHTING], [COLORS], [EFFECT], [ADDITIONAL ELEMENTS]\n- Specify camera perspective: close-up, wide shot, aerial, macro\n- Describe lighting: natural golden hour, studio lighting, moody shadows\n- Include depth of field and atmosphere details`;
          case 'meme':
            return `\n\nMEME-SPECIFIC GUIDANCE:\n- Text is the primary focus: apply three-step text approach for all captions\n- Describe text placement: top text, bottom text, speech bubbles\n- Specify visual style: reaction image format, infographic meme, comic panel\n- Include character expressions or visual context\n- Use bold, readable fonts\n- Describe background context clearly`;
          case 'illustration':
            return `\n\nILLUSTRATION-SPECIFIC GUIDANCE:\n- Specify artistic style: anime, watercolor, vector art, sketch, oil painting, digital art\n- Describe color palette and mood\n- Include medium-specific details: brush strokes, linework, textures\n- Specify subject with clear poses, expressions, and context\n- Include environmental details and atmosphere`;
          default:
            return '';
        }
      })();

      systemContent = `${baseFluxRules}${typeSpecific}\n\n${styleHint}Incorporate any provided context organically into the prompt. Return ONLY the enhanced prompt with no extra commentary.`;
    } else {
      systemContent = `You are an expert AI image prompt engineer. Rewrite the user's image prompt to be highly detailed, vivid, and optimized for image generation models. ${styleHint}Incorporate any provided context organically into the prompt. Return ONLY the enhanced prompt with no extra commentary.`;
    }

    const messages = [
      {
        role: 'system' as const,
        content: systemContent,
      },
      {
        role: 'user' as const,
        content: `Enhance this image prompt:${contextBlock}\n\n"${prompt}"`,
      },
    ];
    try {
      const enhanced = await this.llm.complete(chatProvider, messages);
      this.logger.info({ userId, style, imageType, isFlux: isFluxTarget, originalLength: prompt.length, enhancedLength: enhanced.length }, 'prompt_enhanced');
      return enhanced.trim() || prompt;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt enhancement failed';
      this.logger.warn({ userId, errorMessage: message }, 'prompt_enhancement_failed');
      return prompt;
    }
  }
}
