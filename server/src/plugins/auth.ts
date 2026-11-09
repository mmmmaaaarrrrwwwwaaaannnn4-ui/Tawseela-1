import { ROLE_INFO, isStaff, type Role, type StaffRole } from '@fig/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { AppError, forbidden, unauthorized } from '../lib/errors';
import { accessOf } from '../lib/roles';

export type AuthUser = {
  uid: string;
  email: string;
  /** the account's name (users/{uid}.name), else the token's */
  name: string;
  picture: string | null;
  /** sign-in provider ("password", "google.com", "apple.com") */
  provider: string;
  /** from users/{uid}.role — `user` for customers */
  role: Role;
  /** role === 'admin' */
  admin: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    /** the signed-in caller, from the Firebase ID token in `Authorization: Bearer …` */
    user: AuthUser | null;
    /** set when a token was sent but couldn't be verified */
    authFailure: string | null;
  }
}

/** Route guard: the caller must be signed in. */
export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized(req.authFailure ?? undefined);
  return req.user;
}

/** Route guard: the caller must be a restaurant admin. */
export function requireAdmin(req: FastifyRequest): AuthUser {
  const user = requireUser(req);
  if (!user.admin) throw forbidden('Only an admin can do this.');
  return user;
}

/** Route guard: the caller must have one of these staff roles (admins always pass; none listed = any staff). */
export function requireStaff(req: FastifyRequest, roles: readonly StaffRole[] = []): AuthUser & { role: StaffRole } {
  const user = requireUser(req);
  if (!isStaff(user.role) || (user.role !== 'admin' && roles.length && !roles.includes(user.role))) {
    throw forbidden(roles.length ? `Only ${roles.map((r) => ROLE_INFO[r].label).join(' or ')} staff can do this.` : 'Only restaurant staff can do this.');
  }
  return user as AuthUser & { role: StaffRole };
}

/** Verifies the Firebase ID token on every request that sends one. Public routes ignore failures. */
const auth: FastifyPluginAsync = async (app) => {
  app.decorateRequest('user', null);
  app.decorateRequest('authFailure', null);

  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    let t;
    try {
      t = await app.deps.auth.verifyIdToken(header.slice(7));
    } catch (e) {
      req.log.debug({ err: e }, 'rejected ID token');
      req.authFailure = 'Your session expired. Sign in again.';
      return;
    }
    const who = {
      uid: t.uid,
      email: t.email ?? '',
      name: (t.name as string | undefined) || t.email?.split('@')[0] || 'Fig guest',
      picture: (t.picture as string | undefined) ?? null,
      provider: t.firebase?.sign_in_provider ?? 'password',
    };
    const access = await accessOf(app.deps.db, who, t);
    if (access.disabled) throw new AppError(403, 'account_disabled', 'This account has been disabled. Contact the restaurant.');
    req.user = { ...who, name: access.name ?? who.name, role: access.role, admin: access.role === 'admin' };
  });
};

export default fp(auth, { name: 'auth' });
