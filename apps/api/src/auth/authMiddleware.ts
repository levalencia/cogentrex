import type { NextFunction, Request, Response } from 'express';
import type { PublicUser } from '@cogentrex/shared';
import { unauthorized, forbidden } from '../http/errors.js';
import type { AuthService } from './authService.js';

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export function requireAuth(auth: AuthService) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.session as string | undefined;
      if (!token) throw unauthorized();
      const payload = auth.verifyToken(token);
      const user = auth.findPublicUser(payload.sub);
      if (!user) throw unauthorized();
      req.user = user;
      next();
    } catch {
      next(unauthorized());
    }
  };
}

export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = currentUser(req);
      if (user.role !== 'ADMIN') throw forbidden('Admin access required');
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function currentUser(req: Request): PublicUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
