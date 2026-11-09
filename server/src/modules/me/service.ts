import { Me, Voucher, tierOf, type Me as MeT } from '@fig/shared';
import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';

import { newUserDoc, userRef } from '../../lib/users';
import type { AuthUser } from '../../plugins/auth';

export { userRef };

const identity = (u: AuthUser) => ({ uid: u.uid, name: u.name, email: u.email, picture: u.picture, provider: u.provider });

/** users/{uid} → the API's Me. */
export function toMe(user: AuthUser, data: Record<string, unknown> | undefined): MeT {
  const d = data ?? {};
  const points = typeof d.points === 'number' ? d.points : 0;
  return Me.parse({
    uid: user.uid,
    name: typeof d.name === 'string' && d.name ? d.name : user.name,
    email: user.email || (typeof d.email === 'string' ? d.email : ''),
    phone: typeof d.phone === 'string' ? d.phone : null,
    photo: typeof d.photo === 'string' ? d.photo : user.picture,
    provider: user.provider,
    role: user.role,
    admin: user.admin,
    points,
    tier: tierOf(points),
    credit: typeof d.credit === 'number' ? Math.round(d.credit * 100) / 100 : 0,
    redeemed: Array.isArray(d.redeemed) ? d.redeemed : [],
    vouchers: (Array.isArray(d.vouchers) ? d.vouchers : []).filter((v: unknown) => Voucher.safeParse(v).success),
    liked: Array.isArray(d.liked) ? d.liked : [],
  });
}

/** The user's document (the auth plugin creates it on the first request; this covers a race with a delete). */
export async function ensureUser(db: Firestore, user: AuthUser): Promise<DocumentSnapshot> {
  const ref = userRef(db, user.uid);
  const snap = await ref.get();
  if (snap.exists) return snap;
  await ref.create(newUserDoc(identity(user), user.role)).catch((e: { code?: number }) => {
    if (e.code !== 6) throw e; // ALREADY_EXISTS
  });
  return ref.get();
}

/**
 * Reads the user inside a transaction. Transactions need every read before any write, so a missing
 * document is created by `create()`, which the caller runs at the start of its write phase.
 */
export async function readUserTx(tx: Transaction, db: Firestore, user: AuthUser) {
  const ref = userRef(db, user.uid);
  const snap = await tx.get(ref);
  const fresh = newUserDoc(identity(user), user.role);
  const data = snap.exists ? snap.data()! : fresh;
  return {
    me: toMe(user, data),
    name: (typeof data.name === 'string' && data.name) || user.name,
    create: () => {
      if (!snap.exists) tx.set(ref, fresh);
    },
  };
}

/** Adds points and/or Fig credit inside a transaction or batch. */
export function award(tx: Transaction, db: Firestore, uid: string, points: number, credit = 0) {
  if (!points && !credit) return;
  tx.set(
    userRef(db, uid),
    {
      ...(points ? { points: FieldValue.increment(points) } : {}),
      ...(credit ? { credit: FieldValue.increment(Math.round(credit * 100) / 100) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
