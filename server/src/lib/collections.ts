import type { DocumentReference, Firestore, Transaction, WriteBatch } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

/** Firestore layout. Clients never read or write these directly — only this server does. */
export const COL = {
  dishes: 'dishes',
  categories: 'categories',
  brands: 'brands',
  banners: 'banners',
  posts: 'posts',
  promos: 'promos',
  /** order documents are keyed by their number ("EK-4822") */
  orders: 'orders',
  bookings: 'bookings',
  reviews: 'reviews',
  users: 'users',
  issues: 'issues',
  config: 'config',
  meta: 'meta',
  idempotency: 'idempotency',
  paymentAttempts: 'paymentAttempts',
} as const;

/** `{ sections: HomeSection[], deal: Deal }` — the Home layout and the deal of the day. */
export const homeRef = (db: Firestore) => db.collection(COL.config).doc('home');
/** Store settings (open, prep, fee, freeAt, sound). */
export const storeRef = (db: Firestore) => db.collection(COL.config).doc('store');
/** `{ version }` — bumped with every catalog write, so clients can revalidate cheaply (ETag). */
export const catalogMetaRef = (db: Firestore) => db.collection(COL.meta).doc('catalog');
/** `{ next }` — the next order number. */
export const orderCounterRef = (db: Firestore) => db.collection(COL.meta).doc('orders');

/** Adds the catalog version bump to a batch or transaction, so the change and the bump land together. */
export function bumpCatalog(db: Firestore, w: WriteBatch | Transaction) {
  const ref: DocumentReference = catalogMetaRef(db);
  // WriteBatch and Transaction share this set() signature; TypeScript can't unify the overloads
  (w as WriteBatch).set(ref, { version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** URL-safe id from a name ("Nonna’s Table" → "nonnas-table"). */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40) || 'item';
