import { deleteApp, initializeApp } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { firestoreFor, type Uploader } from '../../src/lib/deps';
import { verifyKashierWebhook } from '../../src/modules/payments/kashier';
import { createHmac } from 'node:crypto';

/*
 * The HTTP layer without Firebase: auth, validation, error envelopes, the guards that run before any
 * database call, and uploads with ImageKit faked. Routes that touch Firestore are covered by
 * test/integration against the emulators.
 */

const TOKENS: Record<string, { uid: string; email: string; name: string; admin?: boolean }> = {
  diner: { uid: 'u1', email: 'diner@fig.test', name: 'Alex Morgan' },
  newbie: { uid: 'n1', email: 'new@fig.test', name: 'New Guest' },
  admin: { uid: 'a1', email: 'admin@fig.test', name: 'Fig Admin' },
  legacy: { uid: 'a0', email: 'owner@fig.test', name: 'Old Admin', admin: true },
  packer: { uid: 'p1', email: 'kitchen@fig.test', name: 'Leo Park' },
  gone: { uid: 'x1', email: 'gone@fig.test', name: 'Former Staff' },
};

/** users/{uid} documents, for the role lookup on every request. */
const USERS: Record<string, Record<string, unknown>> = {
  u1: { role: 'user', name: 'Alex Morgan' },
  a1: { role: 'admin', name: 'Fig Admin' },
  p1: { role: 'packer', name: 'Leo Park' },
  x1: { role: 'callcenter', disabled: true },
};

const fakeAuth = {
  verifyIdToken: async (token: string) => {
    const t = TOKENS[token];
    if (!t) throw new Error('bad token');
    return { ...t, firebase: { sign_in_provider: 'password' } };
  },
} as unknown as Auth;

/** Answers (and creates) users/{uid}; anything else fails, so routes that need Firestore stay in test/integration. */
const noDb = {
  collection: (name: string) => ({
    doc: (id: string) => {
      if (name !== 'users') throw new Error('no database in unit tests');
      return {
        get: async () => {
          const data = USERS[id];
          return { exists: !!data, get: (field: string) => data?.[field], data: () => data };
        },
        create: async (data: Record<string, unknown>) => {
          if (USERS[id]) throw Object.assign(new Error('exists'), { code: 6 });
          USERS[id] = data;
        },
      };
    },
  }),
} as unknown as Firestore;

const uploads: { fileName: string; folder: string; type: string; size: number }[] = [];
const fakeImageKit = {
  files: {
    upload: async (p: { file: File; fileName: string; folder: string }) => {
      uploads.push({ fileName: p.fileName, folder: p.folder, type: p.file.type, size: p.file.size });
      return { url: `https://ik.imagekit.io/fig${p.folder}/${p.fileName}`, fileId: 'file_123' };
    },
  },
} as unknown as Uploader;

let app: Awaited<ReturnType<typeof buildApp>>;
let withUploads: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  const config = loadConfig({ NODE_ENV: 'test', API_DOCS: 'true', FIREBASE_PROJECT_ID: 'demo-unit', DEMO_KITCHEN_SECONDS: '0' });
  app = await buildApp({ config, db: noDb, auth: fakeAuth, imagekit: null, now: () => Date.now() }, { logger: false });
  withUploads = await buildApp({ config: { ...config, API_DOCS: false }, db: noDb, auth: fakeAuth, imagekit: fakeImageKit, now: () => 1_700_000_000_000 }, { logger: false });
  await Promise.all([app.ready(), withUploads.ready()]);
});
afterAll(async () => {
  await Promise.all([app.close(), withUploads.close()]);
});

const as = (who: string) => ({ authorization: `Bearer ${who}` });

const ORDER = {
  items: [{ id: 'pep', s: 1, ex: [], q: 1 }],
  mode: 'delivery',
  speed: 0,
  address: { tag: 'Home', l1: '221 Mercer St', l2: 'New York', note: '' },
  note: '',
  promo: null,
  method: 'card',
  expectedTotal: 17.49,
};

/** A multipart body with one file field (and optional plain fields). */
function multipart(file: { name: string; type: string; bytes: Buffer }, fields: Record<string, string> = {}) {
  const boundary = '----figtest' + Math.random().toString(16).slice(2);
  const parts = [
    ...Object.entries(fields).map(([k, v]) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`),
    file.bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('http', () => {
  it('answers health checks', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('wraps unknown routes in the error envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nope?x=1' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'No route for GET /v1/nope.' } });
  });

  it('sends security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('protects POS connection management with the admin role', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/pos/connections', headers: as('diner') });
    expect(res.statusCode).toBe(403);
  });

  it('rejects POS webhook events without a fresh signature timestamp', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/pos/connection-1/events',
      payload: { eventId: 'event-12345678', type: 'inventory.snapshot', storeId: 'kitchen-1', items: [{ sku: 'sku-1', quantity: 4 }] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('pos_timestamp_invalid');
  });

  it('publishes the OpenAPI document behind /docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.info.title).toBe('Tawseela API');
    for (const path of ['/v1/catalog', '/v1/orders', '/v1/ops/orders/{id}/advance', '/v1/admin/orders/{id}/fire', '/v1/admin/users/{uid}', '/v1/posts/{id}/like']) {
      expect(spec.paths).toHaveProperty([path]);
    }
  });
});

describe('auth', () => {
  it('needs a token for the account', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
  });

  it('tells an expired session apart from a missing one', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: as('expired') });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/session expired/i);
  });

  it('creates a customer profile on the first signed-in request, keeping name and email', async () => {
    expect(USERS.n1).toBeUndefined();
    await app.inject({ method: 'GET', url: '/v1/ops/orders', headers: as('newbie') });
    expect(USERS.n1).toMatchObject({ role: 'user', name: 'New Guest', email: 'new@fig.test', points: 500, disabled: false });
  });

  it('keeps customers out of the console', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/orders', headers: as('diner') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('checks the admin role before validating console input', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/dishes', headers: as('diner'), payload: { name: '' } });
    expect(res.statusCode).toBe(403);
  });

  it('keeps customers out of the team’s queues', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/ops/orders', headers: as('diner') });
    expect(res.statusCode).toBe(403);
  });

  it('keeps staff without the admin role out of the console', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/users', headers: as('packer') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/admin/i);
  });

  it('only lets dispatch and admins list couriers', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/ops/riders', headers: as('packer') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/Dispatch/);
  });

  it('refuses disabled accounts', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: as('gone') });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('account_disabled');
  });

  it('treats an old admin claim as admin when the account has no profile yet', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/users', headers: as('legacy'), payload: { name: '', email: 'nope', password: 'x', role: 'chef' } });
    expect(res.statusCode).toBe(400);
    expect(USERS.a0).toMatchObject({ role: 'admin' });
  });
});

describe('validation', () => {
  it('rejects a malformed order with the problems listed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: as('diner'),
      payload: { ...ORDER, items: [], method: 'bitcoin', expectedTotal: -1 },
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe('invalid_request');
    expect(error.details.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an invalid dish from an admin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/admin/dishes',
      headers: as('admin'),
      payload: { name: 'X', cat: 'Pizza', price: -1, img: 'not a url', tag: 'Hot', avail: true, brand: 'fire' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_request');
  });

  it('rejects an unknown booking area and a bad promo code shape', async () => {
    const booking = await app.inject({
      method: 'POST',
      url: '/v1/bookings',
      headers: as('diner'),
      payload: { party: 2, time: '7:30', seat: 'Rooftop', date: '2026-11-05' },
    });
    expect(booking.statusCode).toBe(400);
    const promo = await app.inject({ method: 'POST', url: '/v1/admin/promos', headers: as('admin'), payload: { code: 'no spaces!', pct: 10 } });
    expect(promo.statusCode).toBe(400);
  });

  it('rejects malformed promo codes before looking them up', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/promos/validate', payload: { code: '' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('payments without Kashier', () => {
  it('refuses card orders clearly', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/orders', headers: as('diner'), payload: ORDER });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('payments_unavailable');
  });

  it('refuses Apple Pay and Google Pay the same way', async () => {
    for (const method of ['apple_pay', 'google_pay']) {
      const res = await app.inject({ method: 'POST', url: '/v1/orders', headers: as('diner'), payload: { ...ORDER, method } });
      expect(res.json().error.code).toBe('payments_unavailable');
    }
  });

  it('refuses webhooks', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/webhooks/kashier', headers: { 'content-type': 'application/json' }, payload: '{}' });
    expect(res.statusCode).toBe(400);
  });
});

describe('photo uploads', () => {
  it('refuses uploads without ImageKit', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/admin/uploads', headers: as('admin') });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('uploads_unavailable');
  });

  it('uploads a photo into the configured folder and returns its URL', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5d6f5e60000000049454e44ae426082', 'hex');
    const body = multipart({ name: 'Dish Photo.PNG', type: 'image/png', bytes: png }, { folder: 'dishes' });
    const res = await withUploads.inject({ method: 'POST', url: '/v1/admin/uploads', headers: { ...as('admin'), ...body.headers }, payload: body.payload });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ url: expect.stringContaining('/fig-fennel/dishes/dishes-'), fileId: 'file_123' });
    expect(uploads.at(-1)).toMatchObject({ folder: '/fig-fennel/dishes', type: 'image/png', size: png.length });
    expect(uploads.at(-1)!.fileName).toMatch(/^dishes-[a-z0-9]+\.png$/);
  });

  it('refuses files that aren’t photos, and non-admins', async () => {
    const text = multipart({ name: 'notes.txt', type: 'text/plain', bytes: Buffer.from('hello') });
    const res = await withUploads.inject({ method: 'POST', url: '/v1/admin/uploads', headers: { ...as('admin'), ...text.headers }, payload: text.payload });
    expect(res.statusCode).toBe(400);
    const png = multipart({ name: 'a.png', type: 'image/png', bytes: Buffer.from([1, 2, 3]) });
    const staff = await withUploads.inject({ method: 'POST', url: '/v1/admin/uploads', headers: { ...as('packer'), ...png.headers }, payload: png.payload });
    expect(staff.statusCode).toBe(403);
  });
});

describe('config', () => {
  it('uses a named Firestore database when FIRESTORE_DATABASE_ID is set', async () => {
    const fb = initializeApp({ projectId: 'demo-unit' }, 'unit-db-test');
    try {
      const named = firestoreFor(fb, loadConfig({ FIRESTORE_DATABASE_ID: 'fig-fennel' }));
      expect(named.databaseId).toBe('fig-fennel');
      expect(firestoreFor(fb, loadConfig({ FIRESTORE_DATABASE_ID: '' })).databaseId).toBe('(default)');
    } finally {
      await deleteApp(fb);
    }
  });

  it('defaults payment configuration to EGP and test mode', () => {
    const config = loadConfig({});
    expect(config.CURRENCY).toBe('EGP');
    expect(config.KASHIER_MODE).toBe('test');
  });
});


describe('Kashier webhook signature verification', () => {
  it('verifies the sorted signatureKeys payload and rejects tampering', () => {
    const key = 'unit-test-payment-api-key';
    const data = { amount: '25.00', currency: 'EGP', status: 'SUCCESS', transactionId: 'TX-123', signatureKeys: ['transactionId', 'status', 'currency', 'amount'] };
    const canonical = ['amount', 'currency', 'status', 'transactionId'].map((k) => `${k}=${encodeURIComponent((data as any)[k])}`).join('&');
    const signature = createHmac('sha256', key).update(canonical).digest('hex');
    expect(verifyKashierWebhook({ data }, signature, key)).toBe(true);
    expect(verifyKashierWebhook({ data: { ...data, amount: '250.00' } }, signature, key)).toBe(false);
  });
});
