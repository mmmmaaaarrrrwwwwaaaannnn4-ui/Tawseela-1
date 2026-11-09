import { CreateUser, POINTS, Role, UserPatch, UserRow, ApiError } from '@fig/shared';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { forgetAccess } from '../../lib/roles';
import { requireAdmin } from '../../plugins/auth';
import { listOrders } from '../orders/service';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };
const uidParam = z.object({ uid: z.string().min(1).max(128) });

const millis = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : null);

function toRow(d: DocumentSnapshot, stats?: { orders: number; spent: number }): UserRow {
  return UserRow.parse({
    uid: d.id,
    name: (d.get('name') as string) || 'Guest',
    email: (d.get('email') as string) ?? '',
    phone: (d.get('phone') as string | null) ?? null,
    role: Role.safeParse(d.get('role')).data ?? 'user',
    disabled: d.get('disabled') === true,
    provider: (d.get('provider') as string) || 'password',
    createdAt: millis(d.get('createdAt')),
    orders: stats?.orders ?? 0,
    spent: Math.round((stats?.spent ?? 0) * 100) / 100,
  });
}

/** /v1/admin/users — accounts and their roles. Everyone who signs in is a customer until changed here. */
const adminUserRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, auth } = app.deps;
  const users = db.collection(COL.users);

  app.get(
    '/users',
    {
      schema: {
        summary: 'Accounts with their role, orders and spend',
        querystring: z.object({ role: Role.optional() }),
        response: { 200: z.array(UserRow), ...errors },
      },
    },
    async (req) => {
      const [snap, orders] = await Promise.all([
        req.query.role ? users.where('role', '==', req.query.role).limit(1000).get() : users.limit(1000).get(),
        listOrders(db, { limit: 500 }),
      ]);
      const stats = new Map<string, { orders: number; spent: number }>();
      for (const o of orders) {
        if (o.stage === 'cancelled' || o.payment.status === 'awaiting_payment') continue;
        const s = stats.get(o.uid) ?? { orders: 0, spent: 0 };
        s.orders += 1;
        s.spent += o.total;
        stats.set(o.uid, s);
      }
      return snap.docs
        .map((d) => toRow(d, stats.get(d.id)))
        .sort((a, b) => Number(a.role === 'user') - Number(b.role === 'user') || a.name.localeCompare(b.name));
    },
  );

  app.post(
    '/users',
    {
      schema: {
        summary: 'Add an account (staff or customer)',
        description: 'Creates the Firebase Auth login with the given password and the users/{uid} profile with the role.',
        body: CreateUser,
        response: { 201: UserRow, ...errors },
      },
    },
    async (req, reply) => {
      const { name, email, password, role, phone } = req.body;
      const created = await auth.createUser({ email, password, displayName: name }).catch((e: { code?: string }) => {
        if (e.code === 'auth/email-already-exists') {
          throw conflict('email_taken', 'There’s already an account with this email — find it in the list and change its role.');
        }
        if (e.code === 'auth/invalid-password') throw badRequest('Choose a password with at least 8 characters.');
        if (e.code === 'auth/invalid-email') throw badRequest('That email address doesn’t look right.');
        throw e;
      });
      await auth.setCustomUserClaims(created.uid, { admin: role === 'admin' });
      await users.doc(created.uid).set({
        name,
        email,
        phone: phone ?? null,
        photo: null,
        provider: 'password',
        role,
        disabled: false,
        points: POINTS.welcome,
        credit: 0,
        redeemed: [],
        vouchers: [],
        liked: [],
        createdBy: requireAdmin(req).uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return reply.code(201).send(toRow(await users.doc(created.uid).get()));
    },
  );

  app.patch(
    '/users/:uid',
    {
      schema: {
        summary: 'Change a role, rename, or disable an account',
        description: 'Disabling signs the account out everywhere. Admins can’t demote or disable themselves, and there is always at least one admin.',
        params: uidParam,
        body: UserPatch,
        response: { 200: UserRow, ...errors },
      },
    },
    async (req) => {
      const me = requireAdmin(req);
      const { uid } = req.params;
      const patch = req.body;
      const ref = users.doc(uid);

      // checked and written in one transaction, so two admins demoting each other can't leave none
      const current = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw notFound('That account');
        const row = toRow(snap);
        const losesAdmin = row.role === 'admin' && !row.disabled && ((patch.role && patch.role !== 'admin') || patch.disabled === true);
        if (uid === me.uid && (losesAdmin || patch.disabled)) throw conflict('self_lockout', 'You can’t remove your own admin access. Ask another admin.');
        if (losesAdmin) {
          const admins = await tx.get(users.where('role', '==', 'admin'));
          if (admins.docs.filter((d) => d.get('disabled') !== true).length <= 1) throw conflict('last_admin', 'The restaurant needs at least one admin.');
        }
        tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
        return row;
      });

      // seeded demo customers have no login to update
      if (current.provider !== 'demo') {
        const login = await auth.getUser(uid).catch(() => null);
        if (login) {
          await auth.updateUser(uid, {
            ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
            ...(patch.name ? { displayName: patch.name } : {}),
          });
          if (patch.role) await auth.setCustomUserClaims(uid, { ...(login.customClaims ?? {}), admin: patch.role === 'admin' });
          if (patch.disabled) await auth.revokeRefreshTokens(uid);
        }
      }
      forgetAccess(uid);
      return toRow(await ref.get());
    },
  );
};

export default adminUserRoutes;
