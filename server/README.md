# Tawseela API

The server behind Tawseela: catalog, customer accounts, orders and Kashier payments, table bookings, team queues, restaurant administration and the Smart POS gateway. Fastify 5 with Zod-validated requests and
responses, Firebase Admin (Auth + Firestore), Kashier and ImageKit.

The contract (Zod schemas, pricing, roles and the order workflow) lives in **`@fig/shared`** (`../shared/src`), which
the app imports too, so both sides price a cart the same way and agree on who may move an order where.

```
server/
  src/app.ts             Fastify app: helmet, CORS, rate limits, Swagger at /docs, error envelope, /v1 routes
  src/server.ts          entry point (+ the demo kitchen timer)
  src/config.ts          every setting, validated at startup
  src/lib/               Firebase/Kashier/ImageKit clients (deps.ts), Firestore layout, errors, role lookup
  src/plugins/auth.ts    Firebase ID token → req.user with the role from users/{uid}
  src/modules/           catalog · me · orders · payments (Kashier, webhook) · bookings · ops (team) · admin (console) · pos (gateway and signed events)
  src/seed/data.ts       the local edition's catalog and demo activity, copied for the seed
  test/unit              HTTP layer without Firebase (ImageKit and Firebase Auth faked)
  test/integration       the API end to end against the emulators (+ Kashier test mode)
```

## Run it locally

Node 22 or later (Node 26 works) and Java 21 for the Firebase emulators. Android Studio ships one:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

From `full-stack/` (one `npm install` there covers every workspace):

```bash
npm run emulators      # terminal 1 — Auth :9099 and Firestore :8080 for project demo-tawseela, UI at http://127.0.0.1:4000
npm run seed           # once per emulator start — catalog, demo activity and the accounts below
npm run dev:server     # terminal 2 — API at http://127.0.0.1:3000, docs at http://127.0.0.1:3000/docs
```

The emulators keep data in memory, so run `npm run seed` again after restarting them. `npm run dev:server` restarts
itself when `src/`, `../shared/src` or `server/.env` changes.

### Seeded accounts (emulators only)

| Account | Password | Role |
| --- | --- | --- |
| admin@fig.test | `FigAdmin2026` | `admin` |
| diner@fig.test | `FigTest2026` | `user` — Alex Morgan, the local edition's demo customer (1,240 points, $12.50 credit, her past order EK-4799) |
| host@fig.test | `FigStaff2026` | `callcenter` |
| kitchen@fig.test | `FigStaff2026` | `packer` |
| dispatch@fig.test | `FigStaff2026` | `warehouse` |
| courier@fig.test, courier2@fig.test | `FigStaff2026` | `delivery` (Marco Rossi, Aisha Khan) |

The demo orders sit in every queue: EK-4821 and EK-4819 are new, EK-4816 is confirmed and on the line, EK-4812 is
packed (cash), EK-4807 is out for delivery with Marco, EK-4799 and EK-4790 are delivered and EK-4781 was cancelled.
Tonight's five bookings, four reviews and the promo codes `FIG10`, `WEEKNIGHT15` and `LUNCH20` (off) are seeded too.
Photos keep their Unsplash URLs, as in the app.

Sign in against the Auth emulator from a script:

```bash
curl -s 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=any' \
  -H 'content-type: application/json' -d '{"email":"diner@fig.test","password":"FigTest2026","returnSecureToken":true}'
# → { "idToken": … } — send it as  Authorization: Bearer <idToken>
```

### Checks

```bash
npm run typecheck -w shared -w server
npm test -w shared -w server       # pricing + parity with the local edition, roles, the HTTP layer
npm run test:integration           # needs `npm run emulators`; uses its own project, demo-tawseela-test
```

The integration tests wipe and fill the `demo-tawseela-test` project only, never `demo-tawseela`. When `server/.env` has a Kashier
**test** key they also place card orders in Kashier test mode (Kashier payment session, confirmation with `pm_card_visa`, sync,
a signed webhook, refund, abandoned checkout); without one those tests are skipped. They never use a live key.

## Configuration

`server/.env` (git-ignored; `.env.example` is the template). An empty value counts as unset. A malformed value stops the
server at startup with the setting's name (never its value).

| Key | Default | What |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | `demo-tawseela` | Firebase project. `demo-*` ids only work with the emulators |
| `FIRESTORE_DATABASE_ID` | `(default)` | A named Firestore database in the project (e.g. `tawseela`), for a project shared with another app |
| `FIRESTORE_EMULATOR_HOST` | — | `127.0.0.1:8080` to use the Firestore emulator |
| `FIREBASE_AUTH_EMULATOR_HOST` | — | `127.0.0.1:9099` to use the Auth emulator |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Real project only: path to a service-account key, relative to `server/` (keep it at `server/service-account.json`, which is git-ignored). Not needed on Google Cloud |
| `KASHIER_SECRET_KEY` | — | Kashier Secret API Key; server-only Authorization header for creating and retrieving hosted payment sessions. |
| `KASHIER_PAYMENT_API_KEY` | — | Kashier Payment API Key; verifies signed webhook payloads. Used to verify Kashier webhook signatures. |
| `KASHIER_MERCHANT_ID` | — | Kashier merchant ID (MID). |
| `KASHIER_MODE` | `test` | `test` or `live`; must match the credential set. |
| `PUBLIC_API_URL` | — | Public HTTPS base URL of this backend; required for the Kashier webhook callback. |
| `POS_ENCRYPTION_KEY` | — | Required to create POS connections. Generate a 32-byte key with `openssl rand -hex 32`; keep it in server secrets only. POS webhook credentials are encrypted at rest with AES-256-GCM. |
| `CURRENCY` | `EGP` | Currency of the Kashier payment sessions |
| `IMAGEKIT_PRIVATE_KEY` | — | ImageKit private key for `POST /admin/uploads`. Without it uploads get `503 uploads_unavailable` |
| `IMAGEKIT_FOLDER` | `/tawseela` | Upload folder; photos land in `<folder>/dishes`, `/kitchens`, `/banners`, `/journal` or `/uploads` |
| `DEMO_KITCHEN_SECONDS` | `0` | Demos only: new orders move one stage every N seconds as if staff worked them, until someone on the team touches the order |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Where the API listens |
| `LOG_LEVEL` | `info` | Pino level; `Authorization` and `Kashier-Signature` headers are redacted |
| `CORS_ORIGINS` | — | Comma-separated browser origins. The native app sends no `Origin` and needs none |
| `API_DOCS` | `true` | Swagger UI at `/docs` (OpenAPI JSON at `/docs/json`) |
| `NODE_ENV` | `development` | `production` turns off pretty logs |

## Smart POS gateway

The first POS gateway release provides a secure, capability-based cloud Webhook adapter. It currently supports **outbound order dispatch** and **signed inbound product/inventory events**. It does not claim a native integration with Loyverse, Foodics, Odoo or local Windows cash-register software; each vendor needs its own official API/OAuth adapter and contract tests before it can be enabled.

1. Set `POS_ENCRYPTION_KEY` to the output of `openssl rand -hex 32` in the backend's secret manager. Never commit the key.
2. In Admin → Smart POS, create a Cloud Webhook connection for an existing kitchen/store. The generated shared secret is displayed once; store it in the POS endpoint's secret manager.
3. Configure the POS receiver to accept `order.created` at the HTTPS URL you supplied. Admins can dispatch an order from the connection card; each order/connection pair is recorded as a dispatch job so retries can be audited.
4. Configure the POS system to send signed events to `POST /v1/pos/{connectionId}/events`. Send `x-tawseela-timestamp` as Unix milliseconds and `x-tawseela-signature` as lowercase HMAC-SHA256 of `{timestamp}.{JSON.stringify(payload)}`, keyed by the shared secret. Timestamps older than five minutes are rejected.
5. Supported inbound event types are `inventory.snapshot`, `inventory.delta`, `product.upsert`, `order.acknowledged` and `order.status`. Inventory is stored in POS-scoped collections; it does not silently overwrite Tawseela's catalog or deduct customer stock before an order is accepted.

The currently exposed capabilities are deliberately limited to `orders.push` and `inventory.write`. Windows local bridge transport, thermal printer delivery, automatic catalog reconciliation and provider-specific cloud connectors remain separate implementation stages and must not be treated as live until built and tested.

## The API

All routes are under `/v1`. Signed-in routes take the Firebase ID token as `Authorization: Bearer <token>`. Errors are
`{ "error": { "code", "message", "details"? } }`; `message` is written to be shown to people as-is.

| Area | Routes |
| --- | --- |
| Catalog (public) | `GET /catalog` (ETag / `304`), `POST /promos/validate` |
| Account | `GET /me`, `PATCH /me`, `POST /me/rewards/:id/redeem`, `POST /posts/:id/like`, `POST /issues` |
| Smart POS (admin) | `GET/POST /admin/pos/connections`, `DELETE /admin/pos/connections/:id`, `POST /admin/pos/connections/:id/rotate-secret`, `POST /admin/pos/connections/:id/dispatch-order`, `GET /admin/pos/jobs` |
| Smart POS (signed inbound) | `POST /pos/:connectionId/events` — signed inventory/product and external order-status events |
| Orders | `POST /orders` (`Idempotency-Key`), `GET /orders`, `GET /orders/:id`, `POST /orders/:id/payment/sync`, `POST /orders/:id/cancel` (unpaid checkouts), `POST /orders/:id/rating`, `POST /orders/:id/issues` |
| Bookings | `POST /bookings`, `GET /bookings`, `POST /bookings/:id/cancel` |
| Team (any staff role) | `GET /ops/orders` (the caller's queue), `GET /ops/orders/:id`, `GET /ops/riders` (warehouse), `POST /ops/orders/:id/advance`, `PATCH /ops/orders/:id/contact` (call center), `POST /ops/orders/:id/items/:index/done` (packer) |
| Console — catalog (admin) | `GET /admin/catalog`; `POST/PATCH/DELETE /admin/dishes[/:id]`; `POST /admin/categories`, `PATCH /admin/categories/:id`, `PUT /admin/categories/order`; `PATCH /admin/brands/:id`; `PATCH /admin/banners/:id`, `PUT /admin/banners/order`; `PATCH /admin/sections/:k`, `PUT /admin/sections/order`; `PATCH /admin/deal`; `PATCH /admin/store`; `POST /admin/promos`, `PATCH /admin/promos/:code`; `POST/PATCH/DELETE /admin/posts[/:id]` |
| Console — operations (admin) | `GET /admin/orders[?stage=]`, `GET /admin/orders/:id`, `POST /admin/orders/:id/advance`, `POST /admin/orders/:id/cancel`, `POST /admin/orders/:id/fire`, `POST /admin/orders/:id/items/:index/done`; `GET /admin/bookings[?from=]`, `PATCH /admin/bookings/:id`; `GET /admin/reviews`, `POST /admin/reviews/:id/reply`; `GET /admin/customers`; `POST /admin/uploads` (multipart) |
| Console — people (admin) | `GET /admin/users[?role=]`, `POST /admin/users`, `PATCH /admin/users/:uid` |
| Kashier | `POST /webhooks/kashier` |
| Health | `GET /health` (outside `/v1`) |

`/docs` has every request and response schema.

### How it stays consistent

- **One catalog version.** Every console write (and every journal like, which changes a count in the catalog) bumps
  `meta/catalog.version` in the same batch or transaction. `GET /catalog` sends it as the ETag (`W/"catalog-<n>"`), so
  the app revalidates with `If-None-Match` for the cost of a `304`. The server caches the catalog in memory per version.
- **The server prices every order** from the live menu with `@fig/shared` (sizes, extras, the deal of the day at today's
  percentage, promo %, reward vouchers, Fig credit, delivery fee and free-delivery threshold, priority fee, pickup), in
  one Firestore transaction with the order number, promo count, voucher and credit use and points. If the total the app
  sent (`expectedTotal`) differs by more than a cent it answers `409 price_changed` with `details.total`.
- **Idempotent checkout.** `Idempotency-Key` (8–100 characters) is checked inside the same transaction, so a retry
  returns the same order; a Direct API intent is created separately for each payment attempt. Keys expire after a week
  through a Firestore TTL policy on `idempotency.expiresAt`.
- **Order numbers are document ids** (`orders/EK-4822`), so the app's `/track/[no]` routes work unchanged.

### Error codes

| Status | Codes |
| --- | --- |
| 400 | `invalid_request` (`details` lists each field), `amount_too_small` (card total under $0.50) |
| 401 | `unauthenticated` (no token, or an expired one) |
| 403 | `forbidden`, `account_disabled` |
| 404 | `not_found`, `promo_invalid` (validate) |
| 409 | `price_changed`, `item_unavailable` (`details.id`), `store_closed`, `promo_invalid`, `voucher_invalid`, `not_enough_points`, `already_redeemed`, `order_in_kitchen`, `move_not_allowed`, `order_cancelled`, `order_delivered`, `order_closed`, `not_paid`, `not_in_kitchen`, `rider_unavailable`, `order_packed`, `booking_closed`, `duplicate`, `in_use`, `email_taken`, `self_lockout`, `last_admin` |
| 413 | `file_too_large` |
| 429 | `rate_limited` (300 requests a minute per address; 20 orders, 20 promo checks, 10 bookings, 10 issue reports) |
| 502 | `payment_failed`, `upload_failed` |
| 503 | `payments_unavailable`, `uploads_unavailable` |

## Roles and the order workflow

Every account has `users/{uid}`. The first signed-in request creates it as a customer (`user`) with the token's name
and email and the 500-point welcome bonus. Roles: `admin`, `callcenter`, `packer`, `warehouse`, `delivery`, `user`.
The role is looked up on each request (cached ten seconds), so changes apply without signing in again. Admins can't
demote or disable themselves, the last admin can't be removed, and disabling an account revokes its sessions.

Each order moves `placed → confirmed → packed → assigned → out_for_delivery → delivered` (pickup orders go
`packed → delivered` at the counter), or to `cancelled`. Who may make which move is one table in
`shared/src/roles.ts` (`movesFor`, `canMove`, `QUEUE`), enforced inside a transaction:

| Role | Moves |
| --- | --- |
| `callcenter` (Front of house) | placed → confirmed; placed/confirmed → cancelled; packed pickup → delivered; fixes address/phone/note until packed |
| `packer` (Kitchen) | confirmed → packed, shown as Ready (with the per-item checklist) |
| `warehouse` (Dispatch) | packed → assigned (a courier) and reassigns; packed pickup → delivered |
| `delivery` (Courier) | its own orders: assigned → out_for_delivery → delivered (a cash order is then marked paid) |
| `admin` | any move, including late cancels; one-tap advance; the kitchen display |

Customers see Fig's `OrderStep` (`stepOfStage(stage, mode)`): placed → 0 New · confirmed, packed → 1 Preparing ·
assigned, out_for_delivery → 2 On the way · delivered → 3 · cancelled → 4. A packed pickup order shows 2, which the app
labels "Ready for pickup".

**Kitchen display.** Each order carries `kitchen: { fired, firedAt, done[] }`. `POST /admin/orders/:id/fire` is Fig's
`fireTicket`: a new ticket is accepted and fired (placed → confirmed, the clock starts), a fired ticket is ready
(confirmed → packed). `kitchenTab(order)` puts placed and unfired orders on "New tickets" and fired, unpacked ones "On the
line"; `ticketMinutes(order, now)` is the ticket's age from `firedAt` (or `placedAt`). Item ticks
(`…/items/:index/done`) are shared with the packer's checklist.

Cancelling gives back the Fig credit and reward vouchers an order spent; cancelling a paid card order refunds it in full.

## Payments

1. **Cash on delivery** (`method: "cash"`) goes straight to the kitchen; the courier marks it paid on delivery.
2. **Online card payments** (`card`) create an unpaid order. The API issues a server-signed Direct API intent using the stored order amount; the mobile app sends card data directly to Kashier FEP and never to the Tawseela API. Orders are marked paid only after a valid signed webhook with matching amount and currency.
3. Webhook endpoint: `POST /v1/webhooks/kashier`. Kashier signs the payload with HMAC-SHA256 using the Payment API Key and its `signatureKeys` list. The redirect and mobile API response are not proof of payment.
4. The return route `GET /v1/payments/kashier/return` only sends the app back to its `tawseela://payment-return` scheme; it never marks an order paid.
5. Refunds are manual in this build. Issue them from the Kashier dashboard and reconcile the order; the app deliberately does not mark a refund successful without a confirmed refund API response.
6. **Before live use:** obtain Kashier approval for the Direct API / PCI DSS scope, verify the live merchant, set `KASHIER_MODE=live`, use matching live Payment API Key and Secret API Key, publish the backend, set `PUBLIC_API_URL`, register the webhook in Kashier, complete 3DS testing, and run a controlled low-value transaction. Confirm the app's product prices are EGP before accepting customer orders.

## Scripts

| Command (from `full-stack/`) | What |
| --- | --- |
| `npm run seed [-- --reset] [-- --no-demo]` | Catalog + demo activity (+ emulator accounts). Refuses a real project without `--yes`. `--reset` clears the catalog collections, and in the emulators also orders, reviews, bookings and issues |
| `npm run team:create [-- --yes] [-- --reset-passwords]` | One login per role in the configured project. New passwords are written only to `server/team-accounts.local.md` (git-ignored), never to the terminal |
| `npm run role:set -w server -- <email> <role>` | Gives an existing account a role (how the first real admin is made) |

## Firestore

Collections: `dishes`, `categories`, `brands`, `banners`, `posts`, `promos` (id = code), `config/home`
(`sections`, `deal`), `config/store`, `meta/catalog` (version), `meta/orders` (next number), `orders` (id = number),
`bookings`, `reviews`, `issues`, `users`, `idempotency`.

`../firestore.rules` denies all client access — only this server (Admin SDK) reads and writes. `../firestore.indexes.json`
holds the one composite index (`orders`: `uid` ↑, `placedAt` ↓, a customer's history) and the TTL on
`idempotency.expiresAt`.

## Deploying

Any Node 22+ host (Cloud Run, Render, Fly, a VM):

```bash
npm ci                       # in full-stack/
npm run build -w server      # one ESM bundle in server/dist (with @fig/shared inlined)
npm start -w server          # node dist/server.js
```

Set the `server/.env` keys as the host's environment variables or secrets. On Google Cloud the service account replaces
`GOOGLE_APPLICATION_CREDENTIALS`; elsewhere point it at the key file. Keep `DEMO_KITCHEN_SECONDS=0` and API docs as you
prefer.

For the real Firebase project:

1. Firebase console → Project settings → Service accounts → *Generate new private key*; save it as
   `server/service-account.json` and set `GOOGLE_APPLICATION_CREDENTIALS=service-account.json`, `FIREBASE_PROJECT_ID`, and
   `FIRESTORE_DATABASE_ID` if the app gets its own named database. Remove the two emulator hosts.
2. `npm run seed -- --yes --no-demo` loads the catalog; `npm run team:create -- --yes` makes the team.
3. Publish rules, indexes and the TTL policy: `npx firebase-tools@15 deploy --only firestore:rules,firestore:indexes --project <id>`.
   For a named database, change `firebase.json`'s `"database"` to that id first.
4. Add the Kashier webhook endpoint and its secret.


## Kashier Direct API rollout

- The mobile checkout collects card number, cardholder name, expiry and CVV in memory only and posts them directly to Kashier FEP.
- The Tawseela API signs the order using `KASHIER_PAYMENT_API_KEY`; the Payment API Key and Secret Key remain server-only Replit Secrets.
- `PUBLIC_API_URL` must be the deployed public HTTPS API URL so Kashier can deliver signed webhooks.
- Orders are marked paid only after the signed Kashier webhook validates; the app response and redirect are not payment proof.
- 3D Secure may open a Kashier / issuer authentication page when the bank requires it.
- Direct card collection changes PCI DSS scope. Obtain written confirmation from Kashier about the required PCI DSS validation before enabling live card acceptance.
