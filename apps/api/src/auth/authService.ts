import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PublicUser, RegisterInput, LoginInput } from '@cogentrex/shared';
import { conflict, unauthorized } from '../http/errors.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import { AuthRepository, toPublicUser } from './authRepository.js';
import type { GoogleProfile } from './googleOAuthClient.js';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

export class AuthService {
  constructor(
    private readonly users: AuthRepository,
    private readonly jwtSecret: string,
    private readonly logger: AppLogger,
  ) {}

  async register(input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      this.logger.warn({ emailHash: hashForLog(input.email) }, 'auth_register_duplicate');
      throw conflict('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.users.create({
      id: createId('usr'),
      email: input.email,
      passwordHash,
      role: 'USER',
      createdAt: nowIso(),
    });

    this.logger.info({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_register_success');
    return { user: toPublicUser(user), token: this.sign(user) };
  }

  async login(input: LoginInput): Promise<{ user: PublicUser; token: string }> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      this.logger.warn({ emailHash: hashForLog(input.email) }, 'auth_login_unknown_email');
      throw unauthorized('Invalid email or password');
    }

    if (!user.passwordHash) {
      this.logger.warn({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_login_password_not_available');
      throw unauthorized('Use Google sign-in for this account');
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      this.logger.warn({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_login_bad_password');
      throw unauthorized('Invalid email or password');
    }

    this.logger.info({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_login_success');
    return { user: toPublicUser(user), token: this.sign(user) };
  }

  async loginWithGoogleProfile(profile: GoogleProfile): Promise<{ user: PublicUser; token: string }> {
    if (!profile.emailVerified) {
      this.logger.warn({ providerUserId: profile.sub, emailHash: hashForLog(profile.email) }, 'auth_google_email_unverified');
      throw unauthorized('Google email must be verified');
    }

    const email = profile.email.toLowerCase();
    const existingAccount = await this.users.findOAuthAccount('google', profile.sub);
    if (existingAccount) {
      const existingUser = await this.users.findById(existingAccount.userId);
      if (!existingUser) throw unauthorized('OAuth account is not linked to a valid user');
      this.logger.info({ userId: existingUser.id, emailHash: hashForLog(existingUser.email) }, 'auth_google_login_success');
      return { user: toPublicUser(existingUser), token: this.sign(existingUser) };
    }

    let user = await this.users.findByEmail(email);
    if (!user) {
      user = await this.users.create({
        id: createId('usr'),
        email,
        passwordHash: null,
        role: 'USER',
        createdAt: nowIso(),
      });
    }

    const now = nowIso();
    await this.users.createOAuthAccount({
      id: createId('oauth'),
      userId: user.id,
      provider: 'google',
      providerUserId: profile.sub,
      email,
      createdAt: now,
      updatedAt: now,
    });

    this.logger.info({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_google_login_success');
    return { user: toPublicUser(user), token: this.sign(user) };
  }

  verifyToken(token: string): AuthTokenPayload {
    const payload = jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
    return payload;
  }

  async findPublicUser(id: string): Promise<PublicUser | null> {
    const user = await this.users.findById(id);
    return user ? toPublicUser(user) : null;
  }

  private sign(user: { id: string; email: string; role: 'USER' | 'ADMIN' }): string {
    return jwt.sign({ sub: user.id, email: user.email, role: user.role }, this.jwtSecret, {
      expiresIn: '7d',
    });
  }
}
