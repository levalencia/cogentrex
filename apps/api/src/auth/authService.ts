import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PublicUser, RegisterInput, LoginInput } from '@cogentrex/shared';
import { conflict, unauthorized } from '../http/errors.js';
import { createId } from '../utils/id.js';
import { nowIso } from '../utils/time.js';
import type { AppLogger } from '../observability/logger.js';
import { hashForLog } from '../observability/logger.js';
import { AuthRepository, toPublicUser } from './authRepository.js';

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
    const existing = this.users.findByEmail(input.email);
    if (existing) {
      this.logger.warn({ emailHash: hashForLog(input.email) }, 'auth_register_duplicate');
      throw conflict('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = this.users.create({
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
    const user = this.users.findByEmail(input.email);
    if (!user) {
      this.logger.warn({ emailHash: hashForLog(input.email) }, 'auth_login_unknown_email');
      throw unauthorized('Invalid email or password');
    }

    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      this.logger.warn({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_login_bad_password');
      throw unauthorized('Invalid email or password');
    }

    this.logger.info({ userId: user.id, emailHash: hashForLog(user.email) }, 'auth_login_success');
    return { user: toPublicUser(user), token: this.sign(user) };
  }

  verifyToken(token: string): AuthTokenPayload {
    const payload = jwt.verify(token, this.jwtSecret) as AuthTokenPayload;
    return payload;
  }

  findPublicUser(id: string): PublicUser | null {
    const user = this.users.findById(id);
    return user ? toPublicUser(user) : null;
  }

  private sign(user: { id: string; email: string; role: 'USER' | 'ADMIN' }): string {
    return jwt.sign({ sub: user.id, email: user.email, role: user.role }, this.jwtSecret, {
      expiresIn: '7d',
    });
  }
}
