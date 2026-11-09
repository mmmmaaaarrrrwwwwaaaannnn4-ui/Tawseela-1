import { ApiError, api, request } from '@/lib/api';

const mockGetIdToken = jest.fn(async (force?: boolean) => (force ? 'fresh-token' : 'stale-token'));

jest.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: (force?: boolean) => mockGetIdToken(force) } } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));

type Call = { url: string; init: RequestInit & { headers: Record<string, string> } };
const calls: Call[] = [];

const respond = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function mockFetch(...responses: (Response | Error)[]) {
  globalThis.fetch = jest.fn(async (url: string, init: Call['init']) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next || next instanceof Error) throw next ?? new Error('no response');
    return next;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  calls.length = 0;
  mockGetIdToken.mockClear();
});

describe('api client', () => {
  it('sends the ID token and parses JSON', async () => {
    mockFetch(respond(200, { ok: 1 }));
    await expect(api.get('/v1/me')).resolves.toEqual({ ok: 1 });
    expect(calls[0].url).toBe('http://127.0.0.1:3000/v1/me');
    expect(calls[0].init.headers.authorization).toBe('Bearer stale-token');
  });

  it("turns { error: { code, message } } into an ApiError with the server's words", async () => {
    mockFetch(respond(409, { error: { code: 'price_changed', message: 'The menu changed.' } }));
    const e = await api.post('/v1/orders', {}).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: 'price_changed', message: 'The menu changed.' });
  });

  it('sends If-None-Match and reports a 304 as not modified', async () => {
    mockFetch(respond(304, undefined, { etag: 'W/"catalog-7"' }));
    const res = await request('/v1/catalog', { etag: 'W/"catalog-7"' });
    expect(calls[0].init.headers['if-none-match']).toBe('W/"catalog-7"');
    expect(res).toMatchObject({ notModified: true, data: null, etag: 'W/"catalog-7"' });
  });

  it('sends the Idempotency-Key it was given', async () => {
    mockFetch(respond(201, { id: 'o1' }));
    await api.post('/v1/orders', { lines: [] }, { idempotencyKey: 'key-1' });
    expect(calls[0].init.headers['idempotency-key']).toBe('key-1');
    expect(calls[0].init.headers['content-type']).toBe('application/json');
  });

  it('retries a 401 once with a freshly minted token', async () => {
    mockFetch(respond(401, { error: { code: 'unauthenticated', message: 'Sign in again.' } }), respond(200, { role: 'admin' }));
    await expect(api.get('/v1/me')).resolves.toEqual({ role: 'admin' });
    expect(calls.map((c) => c.init.headers.authorization)).toEqual(['Bearer stale-token', 'Bearer fresh-token']);
  });

  it('reports an unreachable server as offline', async () => {
    mockFetch(new TypeError('Network request failed'));
    const e = await request('/v1/me').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.offline).toBe(true);
    expect(e.code).toBe('offline');
  });
});
