/**
 * Seeds Firestore with the Fig & Fennel catalog (the local edition's menu, kitchens, banners, Home
 * layout, deal of the day, journal, promo codes and store settings) and demo restaurant activity
 * (customers, orders across the team's queues, reviews and tonight's bookings).
 *
 *   npm run seed                      # local emulators (FIRESTORE_EMULATOR_HOST set in server/.env)
 *   npm run seed -- --yes             # the real project in FIREBASE_PROJECT_ID — asks for --yes
 *
 * Flags: --reset (clear the catalog collections first; in the emulators also orders, reviews, bookings,
 * issues and the order counter) · --no-demo (catalog only).
 *
 * In the emulators only, it also creates one login per role (see the README): admin@fig.test,
 * diner@fig.test (Alex Morgan, the local edition's demo customer, who owns her past orders),
 * host@, kitchen@, dispatch@, courier@ and courier2@fig.test.
 */
import {
  POINTS,
  computeTotals,
  lineMeta,
  lineUnit,
  restaurantDate,
  round2,
  stepOfStage,
  type CartLine,
  type OrderStage,
  type PayMethod,
  type Role,
} from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';

import { loadConfig, databaseLabel, usingEmulators } from '../src/config';
import { COL, catalogMetaRef, homeRef, orderCounterRef, slug, storeRef } from '../src/lib/collections';
import { createDeps } from '../src/lib/deps';
import { DEMO_RIDER, FIRST_ORDER_NO } from '../src/modules/orders/service';
import * as S from '../src/seed/data';

const args = new Set(process.argv.slice(2));
const config = loadConfig();
const emulator = usingEmulators(config);

if (!emulator && !args.has('--yes')) {
  console.error(
    `This would write to the real Firebase project "${config.FIREBASE_PROJECT_ID}" (database ${databaseLabel(config)}).\n` +
      'Run it against the emulators (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 in server/.env), or add --yes to confirm.',
  );
  process.exit(1);
}

const { db, auth } = createDeps(config);
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = Date.now();

/* ---------- helpers ---------- */

async function writeAll(rows: { col: string; id: string; data: Record<string, unknown> }[]) {
  for (let i = 0; i < rows.length; i += 400) {
    const batch = db.batch();
    rows.slice(i, i + 400).forEach((r) => batch.set(db.collection(r.col).doc(r.id), r.data));
    await batch.commit();
  }
}

async function wipe(cols: string[]) {
  for (const c of cols) {
    const snap = await db.collection(c).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

/* ---------- the catalog ---------- */

const dishes = S.ROWS.map((a, order) => ({
  id: a[0],
  data: {
    name: a[1], cat: a[2], price: a[3], rating: a[4], reviews: a[5], time: a[6], kcal: a[7],
    img: S.unsplash(a[8]), tag: a[9], desc: a[10], avail: true, brand: S.BRAND_OF[a[0]], order,
  },
}));
const dishOf = (id: string) => dishes.find((d) => d.id === id)!.data;

function catalogRows() {
  const categories = S.CATS.map((name, order) => ({ col: COL.categories, id: slug(name), data: { name, on: true, order } }));
  const brands = S.BRANDS.map((b, order) => {
    const { id, ...rest } = b;
    return { col: COL.brands, id, data: { ...rest, order } };
  });
  const banners = S.HERO.map((h, order) => {
    const { id, ...rest } = h;
    return { col: COL.banners, id, data: { ...rest, order } };
  });
  const posts = S.POSTS.map((p, i) => {
    const { id, ...rest } = p;
    return { col: COL.posts, id, data: { ...rest, publishedAt: now - i * DAY } };
  });
  const promos = S.SEED_PROMOS.map((p) => ({ col: COL.promos, id: p.code, data: { pct: p.pct, used: p.used, on: p.on } }));
  return [...dishes.map((d) => ({ col: COL.dishes, ...d })), ...categories, ...brands, ...banners, ...posts, ...promos];
}

/* ---------- emulator accounts ---------- */

type Account = { email: string; password: string; name: string; role: Role; phone: string | null; wallet?: { points: number; credit: number } };

const ADMIN_PASSWORD = 'FigAdmin2026';
const DINER_PASSWORD = 'FigTest2026';
const STAFF_PASSWORD = 'FigStaff2026';
const ME = S.CUSTOMERS[0]; // Alex Morgan

const ACCOUNTS: Account[] = [
  { email: 'admin@fig.test', password: ADMIN_PASSWORD, name: 'Fig Admin', role: 'admin', phone: '+1 (212) 555-0100' },
  { email: 'diner@fig.test', password: DINER_PASSWORD, name: ME.name, role: 'user', phone: ME.phone, wallet: S.DEMO_WALLET },
  { email: 'host@fig.test', password: STAFF_PASSWORD, name: 'Nadia Rahman', role: 'callcenter', phone: '+1 (212) 555-0161' },
  { email: 'kitchen@fig.test', password: STAFF_PASSWORD, name: 'Leo Park', role: 'packer', phone: '+1 (212) 555-0162' },
  { email: 'dispatch@fig.test', password: STAFF_PASSWORD, name: 'Sam Okafor', role: 'warehouse', phone: '+1 (212) 555-0163' },
  { email: 'courier@fig.test', password: STAFF_PASSWORD, name: 'Marco Rossi', role: 'delivery', phone: '+1 (917) 555-0164' },
  { email: 'courier2@fig.test', password: STAFF_PASSWORD, name: 'Aisha Khan', role: 'delivery', phone: '+1 (917) 555-0165' },
];

/**
 * Emulator-only logins, one per role; never created in a real project. Returns the diner's uid (who
 * owns Alex Morgan's orders) and the first rider (whom the orders on the road are assigned to).
 */
async function seedAccounts(reset: boolean) {
  const out = { diner: null as string | null, rider: DEMO_RIDER as { uid: string; name: string; phone: string | null } };
  if (!config.FIREBASE_AUTH_EMULATOR_HOST) return out;
  for (const a of ACCOUNTS) {
    let user = await auth.getUserByEmail(a.email).catch(() => null);
    if (!user) user = await auth.createUser({ email: a.email, password: a.password, displayName: a.name, emailVerified: true });
    else await auth.updateUser(user.uid, { password: a.password, displayName: a.name, disabled: false });
    await auth.setCustomUserClaims(user.uid, { admin: a.role === 'admin' });
    const ref = db.collection(COL.users).doc(user.uid);
    const exists = (await ref.get()).exists;
    const wallet = a.wallet ?? { points: POINTS.welcome, credit: 0 };
    await ref.set(
      {
        name: a.name, email: a.email, phone: a.phone, role: a.role, disabled: false, provider: 'password',
        ...(a.role === 'user' ? { addr: ME.addr, tier: ME.tier } : {}),
        ...(!exists || reset ? { photo: null, ...wallet, redeemed: [], vouchers: [], liked: [], createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (a.role === 'user') out.diner = user.uid;
    if (a.role === 'delivery' && out.rider === DEMO_RIDER) out.rider = { uid: user.uid, name: a.name, phone: a.phone };
    console.log(`  ${a.email.padEnd(22)} ${a.role}`);
  }
  return out;
}

/* ---------- demo activity ---------- */

/** Where each of the local edition's seed orders sits, so every team queue has work. */
const DEMO_STAGE: Record<string, OrderStage> = {
  'EK-4821': 'placed',
  'EK-4819': 'placed',
  'EK-4816': 'confirmed',
  'EK-4812': 'packed',
  'EK-4807': 'out_for_delivery',
  'EK-4799': 'delivered',
  'EK-4790': 'delivered',
  'EK-4781': 'cancelled',
};
const PATH: OrderStage[] = ['placed', 'confirmed', 'packed', 'assigned', 'out_for_delivery', 'delivered'];

const methodOf = (label: string): PayMethod => (label === 'Cash' ? 'cash' : label === 'Apple Pay' ? 'apple_pay' : label === 'Google Pay' ? 'google_pay' : 'card');
const agoOf = (time: string, mins: number) => (time === 'Yesterday' ? DAY + 40 * MIN : time === 'Mon' ? 3 * DAY : Math.max(mins, 1) * MIN + 3 * MIN);
const reviewAgo = (t: string) => (t.endsWith('h ago') ? Number(t.split('h')[0]) * 60 * MIN : t === 'Yesterday' ? DAY : t.endsWith('d ago') ? Number(t.split('d')[0]) * DAY : 0);

function demoRows(diner: string | null, rider: { uid: string; name: string; phone: string | null }) {
  const uidOf = (cid: string) => (cid === 'c1' && diner ? diner : cid);
  const customers = S.CUSTOMERS.filter((c) => !(c.id === 'c1' && diner)).map((c) => ({
    col: COL.users,
    id: c.id,
    data: {
      name: c.name, email: c.email, phone: c.phone, addr: c.addr, tier: c.tier, role: 'user', disabled: false, provider: 'demo', demo: true,
      photo: null, points: POINTS.welcome, credit: 0, redeemed: [], vouchers: [], liked: [],
    },
  }));

  const orders = S.SEED_ORDER_ROWS.map(([no, cid, time, , rows, pay], i) => {
    const cust = S.CUSTOMERS.find((c) => c.id === cid)!;
    const stage = DEMO_STAGE[no];
    const cart: CartLine[] = rows.map(([id, s, q]) => ({ id, s, ex: [], q }));
    const items = cart.map((l) => ({ ...l, name: dishOf(l.id).name, meta: lineMeta(l, dishOf(l.id)), unit: lineUnit(l, dishOf(l.id)) }));
    const t = computeTotals({ cart, dishOf, mode: 'delivery', speed: 0, fee: S.STORE.fee, freeAt: S.STORE.freeAt, promo: null });
    const method = methodOf(pay);
    const mins = S.SEED_MINS[i];
    const placedAt = now - agoOf(time, mins);
    const reached = stage === 'cancelled' ? (['placed', 'cancelled'] as OrderStage[]) : PATH.slice(0, PATH.indexOf(stage) + 1);
    // ticket clock: the kitchen fired it `mins` ago (the local edition's ticket age)
    const fired = stage !== 'placed' && stage !== 'cancelled';
    const firedAt = fired ? (mins ? now - mins * MIN : placedAt + 2 * MIN) : null;
    const span = (fired ? firedAt! : now) - placedAt;
    const timeline = reached.map((st, k) => ({
      stage: st,
      at: Math.round(placedAt + (k / Math.max(1, reached.length)) * span),
      by: st === 'placed' ? { uid: uidOf(cid), name: cust.name, role: 'user' } : null,
      ...(st === 'assigned' ? { note: `Rider: ${rider.name}` } : {}),
    }));
    const onRoad = stage === 'assigned' || stage === 'out_for_delivery' || stage === 'delivered';
    const status = stage === 'cancelled' ? (method === 'cash' ? 'due' : 'refunded') : method === 'cash' && stage !== 'delivered' ? 'due' : 'paid';
    return {
      col: COL.orders,
      id: no,
      data: {
        no, uid: uidOf(cid), customer: { name: cust.name, email: cust.email, phone: cust.phone }, placedAt,
        stage, step: stepOfStage(stage, 'delivery'), timeline, rider: onRoad ? rider : null, items,
        subtotal: round2(t.sub), fee: t.fee, speedFee: 0, discount: 0, credit: 0, total: round2(t.total),
        mode: 'delivery', speed: 0, address: { tag: 'Home', l1: cust.addr, l2: 'New York, NY', note: '' }, note: '', promo: null,
        pay, payment: { method, status },
        kitchen: { fired, firedAt, done: stage === 'confirmed' ? [0] : fired ? items.map((_, k) => k) : [] },
        ...(stage === 'delivered' && no === 'EK-4790' ? { rated: 5 } : {}),
        live: false, pointsAwarded: true, vouchersUsed: [], demo: true, kitchenAt: placedAt,
      },
    };
  });

  const reviews = S.SEED_REVIEWS.map((r, i) => {
    const cust = S.CUSTOMERS.find((c) => c.name === r.name);
    return {
      col: COL.reviews,
      id: `seed-review-${i + 1}`,
      data: { name: r.name, stars: r.stars, text: r.text, dish: r.dish, at: now - reviewAgo(r.time), replied: r.replied, reply: r.replied ? 'Thank you!' : null, uid: cust ? uidOf(cust.id) : null, demo: true },
    };
  });

  const bookings = S.SEED_BOOKINGS.map((b, i) => ({
    col: COL.bookings,
    id: `seed-${b.id}`,
    data: { name: b.name, party: b.party, time: b.time, seat: b.seat, status: b.status, date: restaurantDate(now, b.day), code: `R-${2801 + i}`, uid: null, occ: null, req: '', demo: true },
  }));
  return { rows: [...customers, ...orders, ...reviews, ...bookings], counts: { customers: customers.length, orders: orders.length, reviews: reviews.length, bookings: bookings.length } };
}

/* ---------- run ---------- */

async function main() {
  console.log(`Seeding ${emulator ? 'the Firebase emulators' : `project ${config.FIREBASE_PROJECT_ID}`} (Firestore ${databaseLabel(config)})…`);
  const demo = !args.has('--no-demo');
  const reset = args.has('--reset');
  if (reset) {
    await wipe([COL.dishes, COL.categories, COL.brands, COL.banners, COL.posts, COL.promos]);
    // live activity is only ever wiped in the emulators
    if (emulator && demo) {
      await wipe([COL.orders, COL.reviews, COL.bookings, COL.issues, COL.idempotency]);
      await orderCounterRef(db).delete();
    }
    console.log('Cleared the seeded collections');
  }

  await writeAll(catalogRows());
  const batch = db.batch();
  batch.set(homeRef(db), { sections: S.SECTIONS, deal: S.DEAL });
  batch.set(storeRef(db), S.STORE);
  batch.set(catalogMetaRef(db), { version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  console.log(
    `Catalog: ${dishes.length} dishes, ${S.CATS.length} categories, ${S.BRANDS.length} kitchens, ${S.HERO.length} banners, ` +
      `${S.SECTIONS.length} Home sections, ${S.POSTS.length} stories, ${S.SEED_PROMOS.length} promo codes, deal ${S.DEAL.id} ${S.DEAL.pct}%`,
  );

  if (emulator) console.log('Emulator accounts:');
  const { diner, rider } = await seedAccounts(reset);

  if (demo) {
    const { rows, counts } = demoRows(diner, rider);
    await writeAll(rows);
    const counter = await orderCounterRef(db).get();
    const next = Math.max((counter.get('next') as number | undefined) ?? 0, FIRST_ORDER_NO);
    await orderCounterRef(db).set({ next }, { merge: true });
    console.log(`Demo: ${counts.customers} customers, ${counts.orders} orders (EK-4781 … EK-4821), ${counts.reviews} reviews, ${counts.bookings} bookings tonight; next order EK-${next}`);
  }
  console.log('Done.');
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
