import * as Crypto from 'expo-crypto';

import { isApiErrorBody } from './contract';
import { auth } from './firebase';

/**
 * Base URL of the Tawseela API (fullstack/server). Set EXPO_PUBLIC_API_URL for phones and store
 * builds; left empty in development, simulators use this computer — the iOS simulator reaches it as
 * 127.0.0.1 and the Android emulator as 10.0.2.2.
 */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? (process.env.EXPO_OS === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000') : '')
).replace(/\/+$/, '');

/** A failed API call, with the server's `{ error: { code, message } }` when it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  /** no response at all — offline, server down, or timed out */
  get offline() {
    return this.status === 0;
  }
}

export const errorMessage = (e: unknown, fallback = 'Something went wrong. Try again in a moment.') => (e instanceof ApiError ? e.message : fallback);

/** A fresh Idempotency-Key. Reuse one key for every retry of the same request. */
export const newIdempotencyKey = () => Crypto.randomUUID();

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON body */
  body?: unknown;
  /** multipart upload instead of JSON */
  form?: FormData;
  headers?: Record<string, string>;
  /** attach the Firebase ID token (default: whenever someone is signed in) */
  auth?: boolean;
  /** abort after this long (default 15 s) */
  timeoutMs?: number;
  /** `Idempotency-Key` header: the server replays the first response for a repeated key */
  idempotencyKey?: string;
  /** the ETag of the copy we hold: a `304` comes back as `notModified` with no data */
  etag?: string | null;
}

export interface ApiResponse<T> {
  /** parsed JSON; null for 204 and 304 */
  data: T | null;
  status: number;
  /** the response's ETag, for the next conditional request */
  etag: string | null;
  notModified: boolean;
}

/** Told whenever a call does or doesn't reach the server, so the app can say it's offline. */
let reachability: ((reachable: boolean) => void) | null = null;
export const onReachability = (cb: (reachable: boolean) => void) => {
  reachability = cb;
};

/** The signed-in user's Firebase ID token (refreshed by the SDK when it's about to expire). */
async function idToken(force = false): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken(force);
  } catch {
    return null;
  }
}

const AUTH_ERRORS = new Set(['unauthenticated', 'invalid_token', 'token_expired', 'id_token_expired']);

async function send<T>(path: string, opts: RequestOptions, forceToken: boolean): Promise<ApiResponse<T>> {
  if (!API_URL) throw new ApiError(0, 'not_configured', 'The app isn’t connected to a server yet (EXPO_PUBLIC_API_URL).');
  // the app keeps its own copies (and revalidates the catalog itself): keep the HTTP stack's cache out of it
  const headers: Record<string, string> = { accept: 'application/json', 'cache-control': 'no-cache, no-store', ...opts.headers };
  const token = opts.auth === false ? null : await idToken(forceToken);
  if (token) headers.authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  if (opts.etag) headers['if-none-match'] = opts.etag;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await fetch(API_URL + path, { method: opts.method ?? 'GET', headers, body, signal: ctrl.signal });
  } catch (e) {
    if (__DEV__) console.warn(`[api] ${opts.method ?? 'GET'} ${path}: no response (${timedOut ? 'timed out' : String(e)})`);
    reachability?.(false);
    const where = __DEV__ ? ` (${API_URL})` : '';
    throw new ApiError(
      0,
      timedOut ? 'timeout' : 'offline',
      timedOut
        ? `Tawseela is taking too long to answer. Try again in a moment.${where}`
        : `Can’t reach Tawseela right now. Check your connection and try again.${where}`,
    );
  } finally {
    clearTimeout(timer);
  }
  reachability?.(true);

  const etag = res.headers.get('etag');
  if (res.status === 304) return { data: null, status: 304, etag: etag ?? opts.etag ?? null, notModified: true };
  if (res.status === 204) return { data: null, status: 204, etag, notModified: false };
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    if (isApiErrorBody(json)) throw new ApiError(res.status, json.error.code, json.error.message, json.error.details);
    throw new ApiError(
      res.status,
      `http_${res.status}`,
      res.status >= 500 ? 'Tawseela is having trouble right now. Try again in a moment.' : 'That didn’t work.',
    );
  }
  return { data: json as T, status: res.status, etag, notModified: false };
}

/**
 * One request. Returns the parsed body, `notModified` for a 304, and throws `ApiError` otherwise.
 * A 401 for a stale token is retried once with a freshly minted one (e.g. right after a role change).
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  try {
    return await send<T>(path, opts, false);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && opts.auth !== false && auth?.currentUser && (AUTH_ERRORS.has(e.code) || e.code === 'http_401')) {
      return send<T>(path, opts, true);
    }
    throw e;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET with one quiet retry for flaky connections and a restarting server. */
export async function get<T>(path: string, opts: Omit<RequestOptions, 'method' | 'body' | 'form'> = {}): Promise<ApiResponse<T>> {
  try {
    return await request<T>(path, opts);
  } catch (e) {
    if (e instanceof ApiError && (e.offline || e.status >= 502)) {
      await new Promise((r) => setTimeout(r, 800));
      return request<T>(path, opts);
    }
    throw e;
  }
}

export const api = {
  get: async <T>(path: string) => (await get<T>(path)).data as T,
  post: async <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, 'idempotencyKey' | 'timeoutMs' | 'headers'>) =>
    (await request<T>(path, { method: 'POST', body: body ?? {}, ...opts })).data as T,
  patch: async <T>(path: string, body: unknown) => (await request<T>(path, { method: 'PATCH', body })).data as T,
  put: async <T>(path: string, body: unknown) => (await request<T>(path, { method: 'PUT', body })).data as T,
  delete: async (path: string) => {
    await request(path, { method: 'DELETE' });
  },
  upload: async <T>(path: string, form: FormData) => (await request<T>(path, { method: 'POST', form, timeoutMs: 60_000 })).data as T,
};
