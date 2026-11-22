# Cloudflare Workers migration — Tawseela API

## Decision and safety rules

- Target runtime: Cloudflare Workers.
- Repository: `mmmmaaaarrrrwwwwaaaannnn4-ui/Tawseela-1`.
- Working branch: `fix/saved-card-persistence-2026-11-14`.
- Keep Firebase Authentication, the existing Firestore project/database and documents, FCM, Kashier, ImageKit, and all existing API paths/response contracts.
- Do not change `main`, mobile API base URLs, production secrets, Kashier live credentials, or production traffic during the migration.
- Keep the current API deployment available for rollback until the Worker passes smoke, integration, and load tests.

## Repository facts verified before implementation

- The API is a Fastify 5 / TypeScript ESM service in the `server` workspace.
- Production entry point is `server/src/server.ts`; the current process calls `app.listen()`.
- Health endpoint: `GET /health`.
- API routes are registered below `/v1`, including customer, orders, booking, Kashier webhook, admin, POS webhook, and operations routes.
- `server/src/lib/deps.ts` initializes `firebase-admin/app`, `firebase-admin/auth`, and `firebase-admin/firestore`.
- Authentication middleware calls `verifyIdToken()`; routes use Firestore transactions, queries, timestamps, and server-side auth.
- POS webhook code imports `node:crypto` for HMAC, timing-safe comparison, and AES-256-GCM.
- ImageKit uses the official Node SDK.
- Configuration currently includes Firebase service-account JSON / ADC, Kashier credentials, POS encryption key, ImageKit private key, and public API URL.

## Runtime strategy

Use a dedicated Worker entry point and preserve the Fastify route tree where practical. Cloudflare's Node HTTP server compatibility and `cloudflare:node` `httpServerHandler` may allow Fastify's HTTP server to run, but this must be proven with a minimal Worker smoke test before porting the whole application. Do not assume Node compatibility means every Node package or native dependency works.

The Firebase Admin SDK is the main compatibility gate. Do not ship it in the Worker until a compatibility test proves the required Auth and Firestore operations work in the Workers runtime. If it does not, introduce a tested adapter layer:
- Firebase ID token verification using a Workers-compatible JWT/JWK implementation and Google's published signing keys, with issuer/audience/expiry checks and key caching.
- Firestore REST API access using OAuth2 service-account JWT exchange and the Firestore REST API, preserving document paths, queries, transactions, preconditions, timestamps, and database ID semantics.
- FCM HTTP v1 REST calls for push delivery, if used by backend routes.
- Web Crypto APIs for HMAC-SHA256, constant-time signature comparison, and AES-GCM POS secret encryption/decryption.
- ImageKit REST upload signing with Web Crypto, or a proven Workers-compatible client.

Any adapter must preserve current authorization checks, idempotency, webhook signature verification, transaction boundaries, error codes, and data shape. No Firestore schema migration is in scope.

## Implementation phases

1. **Compatibility spike:** create a tiny Worker entry that boots the Fastify app using the Cloudflare HTTP bridge; run `/health` locally and on a preview deployment. Verify multipart, redirects, request raw-body/signature handling, and response behavior.
2. **Firebase adapters:** prove Auth token verification and Firestore read/write/query/transaction behavior against a non-production Firebase project/emulator first. Do not point tests at live customer data.
3. **Service adapters:** port POS cryptography, ImageKit uploads, FCM delivery, and Kashier webhook processing. Keep all external URLs and signatures identical.
4. **Route parity:** test every existing API route and compare status codes, response payloads, and side effects with the current backend.
5. **CI:** add Worker typecheck/build and automated tests; keep existing server tests.
6. **Preview and rollout:** deploy a separate preview Worker URL, run smoke and integration tests, then realistic peak-concurrency/load tests for the 1,000-DAU target.
7. **Cutover:** only after explicit verification, update the production API URL and Kashier webhook URL as required. Keep rollback instructions and the old backend intact.

## Capacity and cost gate

The Workers Free plan currently documents 100,000 requests/day and 10 ms CPU per request; paid has no daily request cap and a higher CPU allowance. 1,000 daily active users does not tell us peak concurrency or API requests/day. Measure real request volume and CPU before promising the free tier is sufficient. Configure a spending limit/budget controls before production rollout.

## Acceptance criteria

- Existing mobile app works without code changes to API paths or data contracts.
- Firebase Auth tokens are verified correctly; admin/staff authorization remains enforced.
- Firestore reads, writes, transactions, queries, and server timestamps behave correctly.
- Kashier callbacks/webhooks validate signatures and preserve payment state handling; no live charge is performed during tests.
- FCM, ImageKit, POS HMAC/replay/idempotency, and notifications pass tests.
- `GET /health` returns `200 { "ok": true }`.
- No production cutover until integration and load tests pass.
