import { Role } from '@fig/shared';
import type { Firestore } from 'firebase-admin/firestore';

import { newUserDoc, userRef, type Identity } from './users';

/**
 * Roles live on users/{uid} in Firestore (set from the console's Users & roles screen, `npm run
 * role:set` or `npm run team:create`). Each request looks the caller up, cached for a few seconds, so a
 * role change or a disabled account takes effect almost at once without signing in again. The first
 * request from a new account creates its document as a customer, keeping the name and email.
 */
export type Access = { role: Role; disabled: boolean; name: string | null };

const TTL_MS = 10_000;
const cache = new Map<string, Access & { at: number }>();

export async function accessOf(db: Firestore, who: Identity, claims: Record<string, unknown>): Promise<Access> {
  const hit = cache.get(who.uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const ref = userRef(db, who.uid);
  let snap = await ref.get();
  if (!snap.exists) {
    // accounts made admin before roles existed carry an `admin` custom claim instead
    const role: Role = claims.admin === true ? 'admin' : 'user';
    await ref.create(newUserDoc(who, role)).catch((e: { code?: number }) => {
      if (e.code !== 6) throw e; // ALREADY_EXISTS: a parallel request created it first
    });
    snap = await ref.get();
  }
  const stored = Role.safeParse(snap.get('role'));
  const role: Role = stored.success ? stored.data : claims.admin === true ? 'admin' : 'user';
  const name = snap.get('name');
  const access = { role, disabled: snap.get('disabled') === true, name: typeof name === 'string' && name ? name : null, at: Date.now() };
  cache.set(who.uid, access);
  return access;
}

/** Forget a user's cached role (after an admin changes it, or they rename themselves). */
export const forgetAccess = (uid: string) => cache.delete(uid);
