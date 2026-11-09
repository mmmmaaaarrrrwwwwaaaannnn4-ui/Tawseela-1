import { POINTS, type Role } from '@fig/shared';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { COL } from './collections';

export const userRef = (db: Firestore, uid: string) => db.collection(COL.users).doc(uid);

/** Who signed in, from their ID token. */
export type Identity = { uid: string; name: string; email: string; picture: string | null; provider: string };

/** A new account's users/{uid} document: a customer with the welcome points. */
export const newUserDoc = (who: Identity, role: Role = 'user') => ({
  name: who.name,
  email: who.email,
  phone: null,
  photo: who.picture,
  provider: who.provider,
  role,
  disabled: false,
  points: POINTS.welcome,
  credit: 0,
  redeemed: [],
  vouchers: [],
  liked: [],
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
