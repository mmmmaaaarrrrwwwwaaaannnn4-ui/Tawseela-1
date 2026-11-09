import { FieldValue } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { COL, catalogMetaRef, homeRef, orderCounterRef, storeRef } from '../../src/lib/collections';
import { createDeps, type Deps } from '../../src/lib/deps';
import { advanceLiveOrders } from '../../src/modules/orders/service';

/*
 * The API end to end against the Firebase emulators, in its own `demo-fig-test` project so it never
 * touches the data `npm run seed` loads for the app. With `npm run emulators` running:
 *   npm run test:integration
 * When server/.env has a Kashier TEST key, card orders run against Kashier test mode too (never live).
 */

const PROJECT = 'demo-fig-test';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
/** per-run suffix, so Kashier test-mode objects from earlier runs never collide */
const RUN = Date.now().toString(36);

let deps: Deps;
let app: Awaited<ReturnType<typeof buildApp>>;
let clock = Date.now();

/**
 * An ID token the Auth emulator accepts: firebase-admin skips the signature check against the emulator
 * but still checks the project, issuer, expiry and that the user exists.
 */
function token(uid: string, claims: { email: string; name: string; admin?: boolean }) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return [
    b64({ alg: 'none', typ: 'JWT' }),
    b64({
      iss: `https://securetoken.google.com/${PROJECT}`,
      aud: PROJECT,
      sub: uid,
      user_id: uid,
      auth_time: now,
      iat: now,
      exp: now + 3600,
      email_verified: true,
      firebase: { sign_in_provider: 'password', identities: {} },
      ...claims,
    }),
    '',
  ].join('.');
}

const U = {
  diner: `diner-${RUN}`,
  other: `other-${RUN}`,
  admin: `admin-${RUN}`,
  cc: `cc-${RUN}`,
  pk: `pk-${RUN}`,
  wh: `wh-${RUN}`,
  rd1: `rd1-${RUN}`,
  rd2: `rd2-${RUN}`,
};
const DINER = token(U.diner, { email: 'diner@fig.test', name: 'Alex Morgan' });
const OTHER = token(U.other, { email: 'other@fig.test', name: 'Priya Nair' });
const ADMIN = token(U.admin, { email: 'admin@fig.test', name: 'Fig Admin', admin: true });
const CALL = token(U.cc, { email: 'host@fig.test', name: 'Nadia Rahman' });
const PACK = token(U.pk, { email: 'kitchen@fig.test', name: 'Leo Park' });
const WARE = token(U.wh, { email: 'dispatch@fig.test', name: 'Sam Okafor' });
const RIDER = token(U.rd1, { email: 'courier@fig.test', name: 'Marco Rossi' });
const RIDER2 = token(U.rd2, { email: 'courier2@fig.test', name: 'Aisha Khan' });

/** Staff accounts: a login plus users/{uid} with the role, as the console's Users & roles creates them. */
const STAFF: [string, string, string, string][] = [
  [U.cc, 'host@fig.test', 'Nadia Rahman', 'callcenter'],
  [U.pk, 'kitchen@fig.test', 'Leo Park', 'packer'],
  [U.wh, 'dispatch@fig.test', 'Sam Okafor', 'warehouse'],
  [U.rd1, 'courier@fig.test', 'Marco Rossi', 'delivery'],
  [U.rd2, 'courier2@fig.test', 'Aisha Khan', 'delivery'],
];

type Res = { status: number; body: any; headers: Record<string, unknown> };
async function call(method: string, url: string, opts: { as?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const res = await app.inject({
    method: method as 'GET',
    url,
    headers: { ...(opts.as ? { authorization: `Bearer ${opts.as}` } : {}), ...opts.headers },
    ...(opts.body !== undefined ? { payload: opts.body as object } : {}),
  });
  return { status: res.statusCode, body: res.body ? res.json() : null, headers: res.headers };
}
const version = async () => (await call('GET', '/v1/catalog')).body.version as number;

const IMG = 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80';
const dish = (name: string, cat: string, price: number, brand: string, order: number) => ({
  name, cat, price, rating: 4.8, reviews: 10, time: 15, kcal: 700, img: IMG, tag: '', desc: name, avail: true, brand, order,
});

async function seed() {
  const wiped = await Promise.all([
    fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }),
    fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' }),
  ]);
  expect(wiped.every((r) => r.ok)).toBe(true);
  // the emulator checks that a token's user exists
  for (const [uid, email, displayName] of [
    [U.diner, 'diner@fig.test', 'Alex Morgan'],
    [U.other, 'other@fig.test', 'Priya Nair'],
    [U.admin, 'admin@fig.test', 'Fig Admin'],
  ]) {
    await deps.auth.createUser({ uid, email, displayName });
  }
  await deps.auth.setCustomUserClaims(U.admin, { admin: true });
  const { db } = deps;
  for (const [uid, email, name, role] of STAFF) {
    await deps.auth.createUser({ uid, email, displayName: name });
    await db.collection(COL.users).doc(uid).set({ name, email, phone: '+1 212 555 0100', role, disabled: false, provider: 'password' });
  }
  const batch = db.batch();
  batch.set(db.collection(COL.dishes).doc('pep'), dish('Hot Honey Pepperoni', 'Pizza', 14.5, 'fire', 0));
  batch.set(db.collection(COL.dishes).doc('smash'), dish('Double Smash', 'Burgers', 13.5, 'smash', 1));
  batch.set(db.collection(COL.dishes).doc('fries'), dish('Truffle Parmesan Fries', 'Sides', 6.5, 'smash', 2));
  batch.set(db.collection(COL.dishes).doc('cheesecake'), dish('Blueberry Cheesecake', 'Desserts', 7.5, 'sugar', 3));
  ['Pizza', 'Burgers', 'Sides', 'Desserts'].forEach((name, order) => batch.set(db.collection(COL.categories).doc(name.toLowerCase()), { name, on: true, order }));
  batch.set(db.collection(COL.brands).doc('fire'), { name: 'Fig Pizza Co.', tag: 'Wood-fired', icon: 'local_pizza', img: IMG, on: true, order: 0 });
  batch.set(db.collection(COL.brands).doc('smash'), { name: 'Smash Lab', tag: 'Burgers', icon: 'lunch_dining', img: IMG, on: true, order: 1 });
  batch.set(db.collection(COL.brands).doc('sugar'), { name: 'Sugar & Smoke', tag: 'Cakes', icon: 'cake', img: IMG, on: true, order: 2 });
  batch.set(db.collection(COL.banners).doc('h0'), { eb: 'Fresh', title: 'Fired at 480°C', cta: 'Order pizza', cat: 'Pizza', img: IMG, on: true, order: 0 });
  batch.set(db.collection(COL.banners).doc('h1'), { eb: 'New', title: 'Truffle Funghi', cta: 'Try it', dish: 'pep', img: IMG, on: false, order: 1 });
  batch.set(db.collection(COL.posts).doc('p1'), {
    title: 'The 48-hour dough', cat: 'Behind the pass', img: IMG, author: 'Chef Lena Ortiz', date: 'Oct 10', mins: 4, featured: true, on: true, dish: 'pep', likes: 214, excerpt: '', body: 'Fire.', publishedAt: 2,
  });
  batch.set(db.collection(COL.posts).doc('p2'), {
    title: 'Draft', cat: 'Recipes', img: IMG, author: 'Arjun Mehta', date: 'Sep 21', mins: 1, featured: false, on: false, dish: null, likes: 0, excerpt: '', body: '', publishedAt: 1,
  });
  batch.set(db.collection(COL.promos).doc('FIG10'), { pct: 10, used: 342, on: true });
  batch.set(db.collection(COL.promos).doc('LUNCH20'), { pct: 20, used: 500, on: false });
  batch.set(homeRef(db), {
    sections: [
      { k: 'hero', l: 'Promo banners', icon: 'view_carousel', on: true },
      { k: 'cats', l: 'Categories', icon: 'category', on: true },
      { k: 'deal', l: 'Deal of the day', icon: 'bolt', on: true },
    ],
    deal: { id: 'smash', pct: 25, on: true },
  });
  batch.set(storeRef(db), { open: true, prep: 18, fee: 2.99, freeAt: 40, sound: true });
  batch.set(catalogMetaRef(db), { version: FieldValue.increment(1) }, { merge: true });
  batch.set(orderCounterRef(db), { next: 4822 });
  await batch.commit();
}

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    API_DOCS: 'false',
    FIREBASE_PROJECT_ID: PROJECT,
    FIRESTORE_EMULATOR_HOST: FIRESTORE,
    FIREBASE_AUTH_EMULATOR_HOST: AUTH,
    DEMO_KITCHEN_SECONDS: '0',
  });
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
  const base = createDeps(config);
  deps = { ...base, imagekit: null, now: () => clock };
  app = await buildApp(deps, { logger: false });
  await app.ready();
  await seed();
}, 60_000);
afterAll(() => app?.close());

const ADDRESS = { tag: 'Home', l1: '221 Mercer St, Apt 4B', l2: 'New York, NY 10012', note: '' };
// 1 × Hot Honey Pepperoni 12" + extra cheese, delivered: 14.50 + 1.50 + 2.99 = 18.99
const BASE = { items: [{ id: 'pep', s: 1, ex: ['cheese'], q: 1 }], mode: 'delivery', speed: 0, address: ADDRESS, note: '', promo: null, method: 'cash' };

describe('catalog', () => {
  it('serves the menu with a version ETag and revalidates to 304', async () => {
    const first = await call('GET', '/v1/catalog');
    expect(first.status).toBe(200);
    expect(first.body.dishes.map((p: { id: string }) => p.id)).toEqual(['pep', 'smash', 'fries', 'cheesecake']);
    expect(first.body.posts.map((p: { id: string }) => p.id)).toEqual(['p1']);
    expect(first.body).not.toHaveProperty('promos');
    expect(first.body.deal).toEqual({ id: 'smash', pct: 25, on: true });
    expect(first.body.store).toEqual({ open: true, prep: 18, fee: 2.99, freeAt: 40, sound: true });
    expect(first.body.sections.map((s: { k: string }) => s.k)).toEqual(['hero', 'cats', 'deal']);
    // category tiles fall back to their first dish's photo
    expect(first.body.categories[0]).toMatchObject({ name: 'Pizza', img: IMG });
    const etag = first.headers.etag as string;
    expect(etag).toBe(`W/"catalog-${first.body.version}"`);
    const again = await call('GET', '/v1/catalog', { headers: { 'if-none-match': etag } });
    expect(again.status).toBe(304);
    // no body, so clients that trust content-length (Android's OkHttp) don't wait for one
    expect(again.headers['content-length'] ?? '0').toBe('0');
  });

  it('validates promo codes', async () => {
    expect((await call('POST', '/v1/promos/validate', { body: { code: 'fig10' } })).body).toEqual({ code: 'FIG10', pct: 10 });
    const off = await call('POST', '/v1/promos/validate', { body: { code: 'LUNCH20' } });
    expect(off.status).toBe(404);
    expect(off.body.error).toEqual({ code: 'promo_invalid', message: 'That code isn’t active. Try FIG10.' });
  });
});

let cashOrder: { id: string; no: string };

describe('sign-in and ordering', () => {
  it('keeps the account and orders behind sign-in', async () => {
    for (const [method, url] of [['GET', '/v1/me'], ['GET', '/v1/orders'], ['POST', '/v1/orders'], ['GET', '/v1/bookings'], ['POST', '/v1/posts/p1/like']]) {
      const res = await call(method, url, { body: method === 'POST' ? {} : undefined });
      expect(res.status, `${method} ${url}`).toBe(401);
      expect(res.body.error.code).toBe('unauthenticated');
    }
  });

  it('creates the customer with welcome points on first contact', async () => {
    const me = await call('GET', '/v1/me', { as: DINER });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ uid: U.diner, name: 'Alex Morgan', role: 'user', admin: false, points: 500, tier: 'Bronze', credit: 0, vouchers: [], liked: [] });
  });

  it('refuses a total the menu doesn’t add up to, and says the real one', async () => {
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 10 } });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'price_changed', details: { total: 18.99 } });
  });

  it('places a cash order numbered after the seed, and a retry with the same Idempotency-Key returns it', async () => {
    const headers = { 'idempotency-key': `cash-${RUN}-0001` };
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 }, headers });
    expect(res.status).toBe(201);
    expect(res.body.payment).toBeNull();
    expect(res.body.order).toMatchObject({
      id: 'EK-4822',
      no: 'EK-4822',
      total: 18.99,
      subtotal: 16,
      fee: 2.99,
      step: 0,
      stage: 'placed',
      pay: 'Cash',
      payment: { method: 'cash', status: 'due' },
      kitchen: { fired: false, firedAt: null, done: [] },
      items: [{ id: 'pep', name: 'Hot Honey Pepperoni', meta: '12" · Extra cheese', unit: 16, q: 1 }],
      customer: { name: 'Alex Morgan', email: 'diner@fig.test' },
    });
    cashOrder = res.body.order;
    const retry = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 }, headers });
    expect(retry.status).toBe(201);
    expect(retry.body.order.id).toBe(cashOrder.id);
    // a different key is a different order
    const fresh = await call('GET', '/v1/orders', { as: DINER });
    expect(fresh.body).toHaveLength(1);
  });

  it('takes promo codes off the subtotal and counts their use', async () => {
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, promo: 'fig10', expectedTotal: 17.39 } });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ discount: 1.6, promo: 'FIG10', total: 17.39 });
    const admin = await call('GET', '/v1/admin/catalog', { as: ADMIN });
    expect(admin.body.promos.find((p: { code: string }) => p.code === 'FIG10').used).toBe(343);
  });

  it('refuses a promo code that was switched off', async () => {
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, promo: 'LUNCH20', expectedTotal: 15.79 } });
    expect(res.body.error.code).toBe('promo_invalid');
  });

  it('prices the deal of the day at today’s percentage, and pickup without fees', async () => {
    // the app's line still says 10%; the server applies the live 25%
    const stale = await call('POST', '/v1/orders', {
      as: DINER,
      body: { ...BASE, items: [{ id: 'smash', s: 0, ex: [], q: 2, deal: true, dealPct: 10 }], mode: 'pickup', address: null, speed: 1, expectedTotal: 24.3 },
    });
    expect(stale.body.error).toMatchObject({ code: 'price_changed', details: { total: 20.25 } });
    const res = await call('POST', '/v1/orders', {
      as: DINER,
      body: { ...BASE, items: [{ id: 'smash', s: 0, ex: [], q: 2, deal: true, dealPct: 25 }], mode: 'pickup', address: null, speed: 1, expectedTotal: 20.25 },
    });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ fee: 0, speedFee: 0, speed: 0, total: 20.25, address: null, mode: 'pickup' });
    expect(res.body.order.items[0]).toMatchObject({ deal: true, dealPct: 25, unit: 10.125 });
  });

  it('needs an address for delivery', async () => {
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, address: null, expectedTotal: 18.99 } });
    expect(res.status).toBe(400);
  });

  it('awards 10 points per whole dollar of subtotal for cash orders', async () => {
    const me = await call('GET', '/v1/me', { as: DINER });
    // 500 welcome + 16 + 16 + 20.25
    expect(me.body.points).toBe(500 + 160 + 160 + 200);
    expect(me.body.tier).toBe('Silver');
  });

  it('shows customers only their own orders, by number', async () => {
    const mine = await call('GET', '/v1/orders', { as: DINER });
    expect(mine.body.map((o: { no: string }) => o.no)).toEqual(['EK-4824', 'EK-4823', 'EK-4822']);
    expect((await call('GET', '/v1/orders', { as: OTHER })).body).toEqual([]);
    expect((await call('GET', `/v1/orders/${cashOrder.id}`, { as: OTHER })).status).toBe(404);
    expect((await call('GET', `/v1/orders/${cashOrder.id}`, { as: DINER })).body.no).toBe('EK-4822');
  });

  it('leaves a cash order as it is when asked to check its payment', async () => {
    const res = await call('POST', `/v1/orders/${cashOrder.id}/payment/sync`, { as: DINER });
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('due');
  });

  it('won’t let a customer cancel an order the kitchen has', async () => {
    const res = await call('POST', `/v1/orders/${cashOrder.id}/cancel`, { as: DINER });
    expect(res.body.error.code).toBe('order_in_kitchen');
  });
});

describe('rewards, credit and help', () => {
  it('credits $5 once per order for a reported problem, and logs general ones without credit', async () => {
    const first = await call('POST', `/v1/orders/${cashOrder.id}/issues`, { as: DINER, body: { type: 0, text: 'Missing dip' } });
    expect(first.body).toEqual({ credited: true, credit: 5 });
    const again = await call('POST', '/v1/issues', { as: DINER, body: { orderId: cashOrder.id, type: 2 } });
    expect(again.body).toEqual({ credited: false, credit: 5 });
    const general = await call('POST', '/v1/issues', { as: DINER, body: { type: 4, text: 'App question' } });
    expect(general.body).toEqual({ credited: false, credit: 5 });
    expect((await call('POST', `/v1/orders/${cashOrder.id}/issues`, { as: OTHER, body: { type: 0 } })).status).toBe(404);
  });

  it('spends Fig credit at checkout when asked', async () => {
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, useCredit: true, expectedTotal: 13.99 } });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ credit: 5, total: 13.99, subtotal: 16 });
    expect((await call('GET', '/v1/me', { as: DINER })).body.credit).toBe(0);
  });

  it('redeems a dish reward into a voucher that pays for one dish, once', async () => {
    // a regular's balance: enough for the fries (500) and the $5 credit (800), not the pizza (2000)
    await deps.db.collection(COL.users).doc(U.diner).update({ points: FieldValue.increment(1000) });
    const me = await call('POST', '/v1/me/rewards/r1/redeem', { as: DINER });
    expect(me.status).toBe(200);
    const v = me.body.vouchers[0];
    expect(v).toMatchObject({ reward: 'r1', dish: 'fries', s: 0 });
    expect(me.body.redeemed).toEqual(['r1']);
    expect((await call('POST', '/v1/me/rewards/r1/redeem', { as: DINER })).body.error.code).toBe('already_redeemed');
    const line = { id: 'fries', s: 0, ex: [], q: 1, deal: true, dealPct: 100, voucher: v.id };
    const free = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, items: [line], mode: 'pickup', address: null, expectedTotal: 0 } });
    expect(free.status).toBe(201);
    expect(free.body.order).toMatchObject({ total: 0, pay: 'Fig Rewards', payment: { status: 'paid' } });
    const again = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, items: [line], mode: 'pickup', address: null, expectedTotal: 0 } });
    expect(again.body.error.code).toBe('voucher_invalid');
  });

  it('turns money-off rewards into credit and refuses when points run short', async () => {
    const me = await call('POST', '/v1/me/rewards/r2/redeem', { as: DINER });
    expect(me.body.credit).toBe(5);
    expect((await call('POST', '/v1/me/rewards/r4/redeem', { as: DINER })).body.error.code).toBe('not_enough_points');
  });
});

describe('the console', () => {
  it('sees drafts and promo codes', async () => {
    const res = await call('GET', '/v1/admin/catalog', { as: ADMIN });
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(2);
    expect(res.body.promos.map((p: { code: string }) => p.code)).toEqual(['FIG10', 'LUNCH20']);
  });

  it('changes a price, bumps the catalog version and refuses the old total', async () => {
    const before = await version();
    const patch = await call('PATCH', '/v1/admin/dishes/pep', { as: ADMIN, body: { price: 15 } });
    expect(patch.body.price).toBe(15);
    const after = await call('GET', '/v1/catalog', { headers: { 'if-none-match': `W/"catalog-${before}"` } });
    expect(after.status).toBe(200);
    expect(after.body.version).toBeGreaterThan(before);
    const stale = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 } });
    expect(stale.body.error).toMatchObject({ code: 'price_changed', details: { total: 19.49 } });
    await call('PATCH', '/v1/admin/dishes/pep', { as: ADMIN, body: { price: 14.5 } });
  });

  it('bumps the catalog version with every kind of console write', async () => {
    const writes: [string, string, unknown][] = [
      ['PATCH', '/v1/admin/dishes/fries', { avail: false }],
      ['PATCH', '/v1/admin/dishes/fries', { avail: true, tag: 'None' }],
      ['POST', '/v1/admin/categories', { name: 'Bowls' }],
      ['PATCH', '/v1/admin/categories/bowls', { on: false }],
      ['PUT', '/v1/admin/categories/order', { ids: ['burgers', 'pizza', 'sides', 'desserts', 'bowls'] }],
      ['PATCH', '/v1/admin/brands/sugar', { tag: 'Cakes baked every morning' }],
      ['PATCH', '/v1/admin/banners/h1', { on: true }],
      ['PUT', '/v1/admin/banners/order', { ids: ['h1', 'h0'] }],
      ['PATCH', '/v1/admin/sections/deal', { on: false }],
      ['PUT', '/v1/admin/sections/order', { ids: ['deal', 'hero', 'cats'] }],
      ['PATCH', '/v1/admin/deal', { pct: 30 }],
      ['PATCH', '/v1/admin/store', { prep: 20, sound: false }],
    ];
    for (const [method, url, body] of writes) {
      const before = await version();
      const res = await call(method, url, { as: ADMIN, body });
      expect(res.status, `${method} ${url}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
      expect(await version(), `${method} ${url}`).toBeGreaterThan(before);
    }
    const cat = (await call('GET', '/v1/catalog')).body;
    expect(cat.categories.map((c: { id: string }) => c.id)).toEqual(['burgers', 'pizza', 'sides', 'desserts', 'bowls']);
    expect(cat.categories.at(-1)).toMatchObject({ name: 'Bowls', on: false });
    expect(cat.banners.map((b: { id: string; on: boolean }) => [b.id, b.on])).toEqual([['h1', true], ['h0', true]]);
    expect(cat.sections.map((s: { k: string; on: boolean }) => [s.k, s.on])).toEqual([['deal', false], ['hero', true], ['cats', true]]);
    expect(cat.deal).toEqual({ id: 'smash', pct: 30, on: true });
    expect(cat.store).toMatchObject({ prep: 20, sound: false });
    expect(cat.brands.find((b: { id: string }) => b.id === 'sugar').tag).toBe('Cakes baked every morning');
    expect(cat.dishes.find((d: { id: string }) => d.id === 'fries')).toMatchObject({ avail: true, tag: '' });
    // put the deal back for the tests below
    await call('PATCH', '/v1/admin/deal', { as: ADMIN, body: { pct: 25 } });
  });

  it('validates reorders and deals', async () => {
    expect((await call('PUT', '/v1/admin/sections/order', { as: ADMIN, body: { ids: ['hero', 'cats'] } })).status).toBe(400);
    expect((await call('PUT', '/v1/admin/categories/order', { as: ADMIN, body: { ids: ['nope'] } })).status).toBe(400);
    expect((await call('PATCH', '/v1/admin/deal', { as: ADMIN, body: { id: 'nope' } })).status).toBe(400);
  });

  it('adds, edits and removes a dish, and refuses duplicate categories', async () => {
    const created = await call('POST', '/v1/admin/dishes', {
      as: ADMIN,
      body: { name: 'Smoky Nduja Pizza', cat: 'Pizza', price: 16, img: IMG, tag: 'New', brand: 'fire' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 'smoky-nduja-pizza', time: 20, kcal: 600, avail: true, rating: 5, reviews: 0, order: 4 });
    expect((await call('POST', '/v1/admin/dishes', { as: ADMIN, body: { name: 'X', cat: 'Soups', price: 9, img: IMG, brand: 'fire' } })).status).toBe(400);
    expect((await call('PATCH', '/v1/admin/dishes/smoky-nduja-pizza', { as: ADMIN, body: { name: 'Nduja Pizza', tag: 'Spicy' } })).body).toMatchObject({ name: 'Nduja Pizza', tag: 'Spicy' });
    expect((await call('DELETE', '/v1/admin/dishes/smoky-nduja-pizza', { as: ADMIN })).status).toBe(204);
    expect((await call('POST', '/v1/admin/categories', { as: ADMIN, body: { name: 'pizza' } })).body.error.code).toBe('duplicate');
  });

  it('won’t delete the deal of the day', async () => {
    const res = await call('DELETE', '/v1/admin/dishes/smash', { as: ADMIN });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('in_use');
  });

  it('refuses orders for a sold-out dish or a switched-off kitchen', async () => {
    await call('PATCH', '/v1/admin/dishes/pep', { as: ADMIN, body: { avail: false } });
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 } });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'item_unavailable', details: { id: 'pep' } });
    await call('PATCH', '/v1/admin/dishes/pep', { as: ADMIN, body: { avail: true } });
    await call('PATCH', '/v1/admin/brands/fire', { as: ADMIN, body: { on: false } });
    expect((await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 } })).body.error.code).toBe('item_unavailable');
    await call('PATCH', '/v1/admin/brands/fire', { as: ADMIN, body: { on: true } });
  });

  it('closes the kitchen to new orders', async () => {
    await call('PATCH', '/v1/admin/store', { as: ADMIN, body: { open: false } });
    const res = await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, expectedTotal: 18.99 } });
    expect(res.body.error.code).toBe('store_closed');
    await call('PATCH', '/v1/admin/store', { as: ADMIN, body: { open: true } });
  });

  it('creates and toggles promo codes', async () => {
    const created = await call('POST', '/v1/admin/promos', { as: ADMIN, body: { code: 'spring25', pct: 25 } });
    expect(created.body).toEqual({ code: 'SPRING25', pct: 25, used: 0, on: true });
    expect((await call('POST', '/v1/admin/promos', { as: ADMIN, body: { code: 'SPRING25', pct: 10 } })).body.error.code).toBe('duplicate');
    expect((await call('PATCH', '/v1/admin/promos/spring25', { as: ADMIN, body: { on: false } })).body.on).toBe(false);
    expect((await call('POST', '/v1/promos/validate', { body: { code: 'SPRING25' } })).status).toBe(404);
  });

  it('writes, features, publishes and deletes journal stories', async () => {
    const created = await call('POST', '/v1/admin/posts', {
      as: ADMIN,
      body: { title: 'Patio season', cat: 'News', img: IMG, author: 'Fig & Fennel Team', featured: true, on: false, body: 'word '.repeat(450) },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ featured: true, on: false, mins: 2, likes: 0, dish: null });
    const id = created.body.id;
    // drafts stay out of the app; only one story is featured
    expect((await call('GET', '/v1/catalog')).body.posts.map((p: { id: string }) => p.id)).toEqual(['p1']);
    const admin = (await call('GET', '/v1/admin/catalog', { as: ADMIN })).body;
    expect(admin.posts.filter((p: { featured: boolean }) => p.featured).map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await call('PATCH', `/v1/admin/posts/${id}`, { as: ADMIN, body: { on: true } })).body.on).toBe(true);
    expect((await call('GET', '/v1/catalog')).body.posts.map((p: { id: string }) => p.id)).toEqual([id, 'p1']);
    expect((await call('DELETE', `/v1/admin/posts/${id}`, { as: ADMIN })).status).toBe(204);
  });
});

describe('journal likes', () => {
  it('toggles a like per account and keeps the count in the catalog', async () => {
    const before = await version();
    const liked = await call('POST', '/v1/posts/p1/like', { as: DINER, body: {} });
    expect(liked.body).toEqual({ id: 'p1', liked: true, likes: 215 });
    expect((await call('POST', '/v1/posts/p1/like', { as: DINER, body: { liked: true } })).body.likes).toBe(215);
    expect((await call('GET', '/v1/me', { as: DINER })).body.liked).toEqual(['p1']);
    expect((await call('GET', '/v1/catalog')).body.posts[0].likes).toBe(215);
    expect(await version()).toBeGreaterThan(before);
    expect((await call('POST', '/v1/posts/p1/like', { as: DINER })).body).toEqual({ id: 'p1', liked: false, likes: 214 });
    expect((await call('POST', '/v1/posts/p2/like', { as: DINER })).status).toBe(404);
  });
});

describe('the team', () => {
  let id: string;
  const move = (as: string, body: object) => call('POST', `/v1/ops/orders/${id}/advance`, { as, body });
  const queue = async (as: string) => ((await call('GET', '/v1/ops/orders', { as })).body as { id: string }[]).map((o) => o.id);

  it('gives everyone who signs up the customer role', async () => {
    expect((await call('GET', '/v1/me', { as: OTHER })).body).toMatchObject({ role: 'user', admin: false });
    expect((await call('GET', '/v1/me', { as: ADMIN })).body).toMatchObject({ role: 'admin', admin: true });
    expect((await call('GET', '/v1/me', { as: CALL })).body).toMatchObject({ role: 'callcenter', name: 'Nadia Rahman' });
    expect((await call('GET', '/v1/ops/orders', { as: OTHER })).status).toBe(403);
  });

  it('passes a new order from the call center to the packer to the warehouse', async () => {
    id = (await call('POST', '/v1/orders', { as: OTHER, body: { ...BASE, expectedTotal: 18.99 } })).body.order.id;
    expect(await queue(CALL)).toContain(id);
    expect(await queue(PACK)).not.toContain(id);
    // a packer can't skip the call center
    expect((await move(PACK, { to: 'packed' })).body.error.code).toBe('move_not_allowed');

    const fixed = await call('PATCH', `/v1/ops/orders/${id}/contact`, {
      as: CALL,
      body: { phone: '+1 917 555 0100', address: { ...ADDRESS, l1: '225 Mercer St' } },
    });
    expect(fixed.body).toMatchObject({ customer: { phone: '+1 917 555 0100' }, address: { l1: '225 Mercer St' } });
    expect((await move(CALL, { to: 'confirmed' })).body).toMatchObject({ stage: 'confirmed', step: 1 });
    expect(await queue(PACK)).toContain(id);

    // the packer ticks the items off, then packs (which fires a ticket the kitchen display never fired)
    expect((await call('POST', `/v1/ops/orders/${id}/items/0/done`, { as: PACK, body: {} })).body.kitchen.done).toEqual([0]);
    expect((await call('POST', `/v1/ops/orders/${id}/items/5/done`, { as: PACK, body: {} })).status).toBe(400);
    expect((await call('POST', `/v1/ops/orders/${id}/items/0/done`, { as: WARE, body: {} })).status).toBe(403);
    const packed = await move(PACK, { to: 'packed' });
    expect(packed.body).toMatchObject({ stage: 'packed', step: 1, kitchen: { fired: true } });
    expect((await call('PATCH', `/v1/ops/orders/${id}/contact`, { as: CALL, body: { phone: '1' } })).body.error.code).toBe('order_packed');
    expect(await queue(WARE)).toContain(id);
  });

  it('lets the warehouse pick an active rider, least busy first', async () => {
    const riders = (await call('GET', '/v1/ops/riders', { as: WARE })).body as { uid: string; active: number }[];
    expect(riders.map((r) => r.uid).sort()).toEqual([U.rd1, U.rd2].sort());
    expect((await move(WARE, { to: 'assigned' })).status).toBe(400);
    expect((await move(WARE, { to: 'assigned', riderUid: U.pk })).body.error.code).toBe('rider_unavailable');
    const assigned = await move(WARE, { to: 'assigned', riderUid: U.rd2 });
    expect(assigned.body).toMatchObject({ stage: 'assigned', step: 2, rider: { uid: U.rd2, name: 'Aisha Khan' } });
    expect(await queue(RIDER2)).toContain(id);
    expect(await queue(RIDER)).not.toContain(id);
    const after = (await call('GET', '/v1/ops/riders', { as: WARE })).body as { uid: string; active: number }[];
    expect(after.map((r) => [r.uid, r.active])).toEqual([[U.rd1, 0], [U.rd2, 1]]);
  });

  it('lets only the assigned rider deliver, collecting the cash', async () => {
    expect((await move(RIDER, { to: 'out_for_delivery' })).body.error.code).toBe('move_not_allowed');
    expect((await move(RIDER2, { to: 'out_for_delivery' })).body).toMatchObject({ stage: 'out_for_delivery', step: 2 });
    const done = await move(RIDER2, { to: 'delivered' });
    expect(done.body).toMatchObject({ stage: 'delivered', step: 3, payment: { method: 'cash', status: 'paid' } });
    expect(done.body.timeline.map((e: { stage: string }) => e.stage)).toEqual(['placed', 'placed', 'confirmed', 'packed', 'assigned', 'out_for_delivery', 'delivered']);
    expect(done.body.timeline.at(-1).by).toMatchObject({ uid: U.rd2, role: 'delivery' });
    // still in the rider's list, as done today; and never back from delivered
    expect(await queue(RIDER2)).toContain(id);
    expect((await move(RIDER2, { to: 'out_for_delivery' })).status).toBe(409);
    expect((await call('GET', `/v1/orders/${id}`, { as: OTHER })).body.step).toBe(3);
  });

  it('hands a packed pickup order over at the counter, showing it ready first', async () => {
    const pickup = (await call('POST', '/v1/orders', { as: OTHER, body: { ...BASE, mode: 'pickup', address: null, expectedTotal: 16 } })).body.order.id;
    await call('POST', `/v1/ops/orders/${pickup}/advance`, { as: CALL, body: { to: 'confirmed' } });
    const packed = await call('POST', `/v1/ops/orders/${pickup}/advance`, { as: PACK, body: { to: 'packed' } });
    expect(packed.body).toMatchObject({ stage: 'packed', step: 2 });
    expect((await call('POST', `/v1/ops/orders/${pickup}/advance`, { as: WARE, body: { to: 'assigned', riderUid: U.rd1 } })).body.error.code).toBe('move_not_allowed');
    expect((await call('POST', `/v1/ops/orders/${pickup}/advance`, { as: WARE, body: { to: 'delivered' } })).body).toMatchObject({ stage: 'delivered', step: 3 });
  });
});

describe('the kitchen display and one-tap console moves', () => {
  let id: string;

  it('fires a new ticket, ticks items off, then sends it out ready', async () => {
    id = (await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, items: [...BASE.items, { id: 'fries', s: 1, ex: [], q: 2 }], expectedTotal: 37.99 } })).body.order.id;
    clock += 60_000;
    const fired = await call('POST', `/v1/admin/orders/${id}/fire`, { as: ADMIN });
    expect(fired.body).toMatchObject({ stage: 'confirmed', step: 1, kitchen: { fired: true, firedAt: clock, done: [] } });
    expect(fired.body.timeline.at(-1)).toMatchObject({ stage: 'confirmed', note: 'Ticket fired', by: { role: 'admin' } });
    expect((await call('POST', `/v1/admin/orders/${id}/items/1/done`, { as: ADMIN, body: {} })).body.kitchen.done).toEqual([1]);
    expect((await call('POST', `/v1/admin/orders/${id}/items/0/done`, { as: ADMIN, body: { done: true } })).body.kitchen.done).toEqual([0, 1]);
    expect((await call('POST', `/v1/admin/orders/${id}/items/1/done`, { as: ADMIN, body: {} })).body.kitchen.done).toEqual([0]);
    const ready = await call('POST', `/v1/admin/orders/${id}/fire`, { as: ADMIN });
    expect(ready.body).toMatchObject({ stage: 'packed', step: 1 });
    expect((await call('POST', `/v1/admin/orders/${id}/fire`, { as: ADMIN })).body.error.code).toBe('not_in_kitchen');
    expect((await call('POST', `/v1/admin/orders/${id}/fire`, { as: PACK })).status).toBe(403);
  });

  it('advances with one tap, picking the least busy rider', async () => {
    const assigned = await call('POST', `/v1/admin/orders/${id}/advance`, { as: ADMIN, body: {} });
    // both riders are free, so the tie goes by name
    expect(assigned.body).toMatchObject({ stage: 'assigned', rider: { uid: U.rd2, name: 'Aisha Khan' } });
    expect((await call('POST', `/v1/admin/orders/${id}/advance`, { as: ADMIN })).body.stage).toBe('out_for_delivery');
    expect((await call('POST', `/v1/admin/orders/${id}/advance`, { as: ADMIN })).body).toMatchObject({ stage: 'delivered', step: 3 });
    expect((await call('POST', `/v1/admin/orders/${id}/advance`, { as: ADMIN })).body.error.code).toBe('order_closed');
  });

  it('cancels from the console and gives back what the order spent', async () => {
    const before = (await call('GET', '/v1/me', { as: DINER })).body.credit;
    const o = (await call('POST', '/v1/orders', { as: DINER, body: { ...BASE, useCredit: true, expectedTotal: 18.99 - before } })).body.order;
    expect(o.credit).toBe(before);
    const res = await call('POST', `/v1/admin/orders/${o.id}/cancel`, { as: ADMIN, body: {} });
    expect(res.body).toMatchObject({ stage: 'cancelled', step: 4, payment: { status: 'due' } });
    expect((await call('GET', '/v1/me', { as: DINER })).body.credit).toBe(before);
    expect((await call('POST', `/v1/admin/orders/${o.id}/advance`, { as: ADMIN })).body.error.code).toBe('order_closed');
  });

  it('lists every order for the console, filterable by stage', async () => {
    const all = (await call('GET', '/v1/admin/orders', { as: ADMIN })).body as { no: string; stage: string }[];
    // every order in the database, however many the tests above made (online-payment integration tests require a configured Kashier test merchant)
    const inDb = (await deps.db.collection(COL.orders).count().get()).data().count;
    expect(all.length).toBe(inDb);
    expect(all.length).toBeGreaterThan(5);
    const cancelled = (await call('GET', '/v1/admin/orders?stage=cancelled', { as: ADMIN })).body as { stage: string }[];
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((o) => o.stage === 'cancelled')).toBe(true);
  });
});

describe('demo kitchen', () => {
  it('moves live orders on a step at a time, firing the ticket', async () => {
    const res = await call('POST', '/v1/orders', { as: OTHER, body: { ...BASE, expectedTotal: 18.99 } });
    const id = res.body.order.id;
    await deps.db.collection(COL.orders).doc(id).update({ live: true });
    clock += 60_000;
    await advanceLiveOrders(deps.db, clock, 8000);
    expect((await call('GET', `/v1/orders/${id}`, { as: OTHER })).body).toMatchObject({ stage: 'confirmed', step: 1, live: true, kitchen: { fired: true } });
    clock += 60_000;
    await advanceLiveOrders(deps.db, clock, 8000);
    expect((await call('GET', `/v1/orders/${id}`, { as: OTHER })).body.stage).toBe('packed');
  });
});

describe('after the meal', () => {
  it('rates an order once for points, and the review reaches the console for a reply', async () => {
    const before = (await call('GET', '/v1/me', { as: DINER })).body.points;
    const rated = await call('POST', `/v1/orders/${cashOrder.id}/rating`, { as: DINER, body: { stars: 5, tags: ['Hot & fresh'], text: 'Great', tip: 2 } });
    expect(rated.body).toMatchObject({ rated: 5, tip: 2 });
    await call('POST', `/v1/orders/${cashOrder.id}/rating`, { as: DINER, body: { stars: 4, tags: ['Fast delivery'] } });
    expect((await call('GET', '/v1/me', { as: DINER })).body.points).toBe(before + 50);
    const reviews = (await call('GET', '/v1/admin/reviews', { as: ADMIN })).body as { id: string; name: string; stars: number; text: string; replied: boolean }[];
    const mine = reviews.find((r) => r.name === 'Alex Morgan')!;
    expect(mine).toMatchObject({ stars: 4, text: 'Fast delivery', dish: 'Hot Honey Pepperoni', replied: false });
    const replied = await call('POST', `/v1/admin/reviews/${mine.id}/reply`, { as: ADMIN, body: { text: 'Thanks, Alex!' } });
    expect(replied.body).toMatchObject({ replied: true, reply: 'Thanks, Alex!' });
  });

  it('lists customers with their orders and spend', async () => {
    const res = await call('GET', '/v1/admin/customers', { as: ADMIN });
    expect(res.body.find((c: { id: string }) => c.id === U.diner)).toMatchObject({ name: 'Alex Morgan', email: 'diner@fig.test' });
    expect(res.body.find((c: { id: string }) => c.id === U.diner).orders).toBeGreaterThanOrEqual(5);
    expect(res.body.some((c: { id: string }) => c.id === U.cc)).toBe(false);
  });
});

describe('reservations', () => {
  const today = () => new Date(clock).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  it('books a table for points, lets the guest cancel it, and refuses past days', async () => {
    const before = (await call('GET', '/v1/me', { as: OTHER })).body.points;
    const booked = await call('POST', '/v1/bookings', { as: OTHER, body: { party: 2, time: '7:30', seat: 'Patio', date: today(), occ: 'Date night', req: 'Window please' } });
    expect(booked.status).toBe(201);
    expect(booked.body).toMatchObject({ name: 'Priya Nair', status: 0, uid: U.other, occ: 'Date night', code: expect.stringMatching(/^R-\d{4}$/) });
    expect((await call('GET', '/v1/me', { as: OTHER })).body.points).toBe(before + 100);
    expect((await call('GET', '/v1/bookings', { as: OTHER })).body.map((b: { id: string }) => b.id)).toEqual([booked.body.id]);
    expect((await call('POST', `/v1/bookings/${booked.body.id}/cancel`, { as: DINER })).status).toBe(404);
    expect((await call('POST', `/v1/bookings/${booked.body.id}/cancel`, { as: OTHER })).body.status).toBe(2);
    expect((await call('POST', '/v1/bookings', { as: OTHER, body: { party: 2, time: '7:30', seat: 'Patio', date: '2020-01-01' } })).status).toBe(400);
  });

  it('shows tonight’s reservations in the console and seats a guest', async () => {
    const b = (await call('POST', '/v1/bookings', { as: DINER, body: { party: 4, time: '10:00', seat: 'Dining room', date: today() } })).body;
    await call('POST', '/v1/bookings', { as: DINER, body: { party: 2, time: '5:30', seat: 'Chef’s counter', date: today() } });
    const list = (await call('GET', '/v1/admin/bookings', { as: ADMIN })).body as { id: string; time: string }[];
    // evening times sort as times: 5:30 before 7:30 before 10:00
    expect(list.map((x) => x.time)).toEqual(['5:30', '7:30', '10:00']);
    expect((await call('PATCH', `/v1/admin/bookings/${b.id}`, { as: ADMIN, body: { status: 1 } })).body.status).toBe(1);
    expect((await call('POST', `/v1/bookings/${b.id}/cancel`, { as: DINER })).body.error.code).toBe('booking_closed');
  });
});

describe('users and roles', () => {
  it('lets the admin add accounts, change roles and disable them', async () => {
    const created = await call('POST', '/v1/admin/users', {
      as: ADMIN,
      body: { name: 'Priya Desai', email: 'Priya@Fig.test', password: 'FigStaff2026', role: 'packer' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'priya@fig.test', role: 'packer', disabled: false, provider: 'password' });
    const uid = created.body.uid;
    expect((await call('POST', '/v1/admin/users', { as: ADMIN, body: { name: 'Again', email: 'priya@fig.test', password: 'FigStaff2026', role: 'user' } })).body.error.code).toBe('email_taken');

    expect((await call('PATCH', `/v1/admin/users/${uid}`, { as: ADMIN, body: { role: 'delivery', name: 'Priya D.' } })).body).toMatchObject({ role: 'delivery', name: 'Priya D.' });
    expect(((await call('GET', '/v1/ops/riders', { as: WARE })).body as { uid: string }[]).map((r) => r.uid)).toContain(uid);
    expect((await call('PATCH', `/v1/admin/users/${uid}`, { as: ADMIN, body: { disabled: true } })).body.disabled).toBe(true);
    expect(((await call('GET', '/v1/ops/riders', { as: WARE })).body as { uid: string }[]).map((r) => r.uid)).not.toContain(uid);
    expect((await deps.auth.getUser(uid)).disabled).toBe(true);

    const all = (await call('GET', '/v1/admin/users', { as: ADMIN })).body as { uid: string; role: string }[];
    expect(all.find((u) => u.uid === U.cc)?.role).toBe('callcenter');
    // staff first, then customers
    expect(all.findIndex((u) => u.role === 'user')).toBeGreaterThan(all.findLastIndex((u) => u.role !== 'user'));
    expect((await call('GET', '/v1/admin/users?role=delivery', { as: ADMIN })).body.every((u: { role: string }) => u.role === 'delivery')).toBe(true);
    expect((await call('GET', '/v1/admin/users', { as: CALL })).status).toBe(403);
  });

  it('protects admins from locking themselves out', async () => {
    expect((await call('PATCH', `/v1/admin/users/${U.admin}`, { as: ADMIN, body: { role: 'user' } })).body.error.code).toBe('self_lockout');
    expect((await call('PATCH', `/v1/admin/users/${U.admin}`, { as: ADMIN, body: { disabled: true } })).body.error.code).toBe('self_lockout');
  });

  it('lets a second admin demote the first, and applies a role change straight away', async () => {
    const second = await call('POST', '/v1/admin/users', { as: ADMIN, body: { name: 'Second Admin', email: 'admin2@fig.test', password: 'FigAdmin2026', role: 'admin' } });
    const ADMIN2 = token(second.body.uid, { email: 'admin2@fig.test', name: 'Second Admin' });
    expect((await call('PATCH', `/v1/admin/users/${U.admin}`, { as: ADMIN2, body: { role: 'user' } })).body.role).toBe('user');
    expect((await call('GET', '/v1/admin/catalog', { as: ADMIN })).status).toBe(403);
    expect((await call('PATCH', `/v1/admin/users/${U.admin}`, { as: ADMIN2, body: { role: 'admin' } })).body.role).toBe('admin');
    expect((await call('GET', '/v1/admin/catalog', { as: ADMIN })).status).toBe(200);

    expect((await call('PATCH', `/v1/admin/users/${U.cc}`, { as: ADMIN, body: { role: 'user' } })).body.role).toBe('user');
    expect((await call('GET', '/v1/ops/orders', { as: CALL })).status).toBe(403);
    await call('PATCH', `/v1/admin/users/${U.cc}`, { as: ADMIN, body: { role: 'callcenter' } });
    expect((await call('GET', '/v1/ops/orders', { as: CALL })).status).toBe(200);
  });

  it('signs a disabled account out of the API at once', async () => {
    await call('PATCH', `/v1/admin/users/${U.rd1}`, { as: ADMIN, body: { disabled: true } });
    // the Auth emulator rejects a disabled user's token itself (401); a real project's token still
    // verifies until it expires, and the role lookup refuses it (403 account_disabled)
    const refused = await call('GET', '/v1/me', { as: RIDER });
    expect([401, 403]).toContain(refused.status);
    expect(['unauthenticated', 'account_disabled']).toContain(refused.body.error.code);
    await call('PATCH', `/v1/admin/users/${U.rd1}`, { as: ADMIN, body: { disabled: false } });
    // disabling revoked the old session; a fresh sign-in works again
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = token(U.rd1, { email: 'courier@fig.test', name: 'Marco Rossi' });
    expect((await call('GET', '/v1/me', { as: fresh })).body).toMatchObject({ role: 'delivery', name: 'Marco Rossi' });
  });
});
