# Tawseela — full-stack edition

The Tawseela restaurant app (iOS and Android) with a real backend. The course edition (`../course-edition`) runs on
in-memory demo data; this edition signs people in with Firebase, keeps the menu, orders, bookings and rewards in
Firestore behind a Node API, takes payments with Kashier and runs the restaurant team in the same app.

- **Customer app:** splash and onboarding, Firebase sign-in (email and password, Sign in with Apple, Google), sign-up
  with email verification, password reset. Home, menu search and filters, dish customisation, saved dishes, cart and
  promo codes, checkout with Kashier (card, Apple Pay, Google Pay) or cash, live order tracking with the courier's name,
  rate and tip, table reservations, notifications, addresses, Fig Club rewards, help, the journal, settings and dark
  mode. The menu is cached on the phone, so the app opens instantly and still shows the menu offline.
- **Restaurant console** (Profile → Restaurant admin, admins only): tonight's dashboard, the order board, the kitchen
  display, the menu editor with photo uploads, promotions, customers, **Users & roles**, reservations, reviews,
  categories, kitchens, Home layout, banners and the deal of the day, the journal and store settings.
- **The team** (Profile → Staff): front of house, the kitchen, dispatch and couriers each get their own queue — see
  [Roles and the order workflow](#roles-and-the-order-workflow).

## Repository layout

npm workspaces, one install in `full-stack/`:

```
mobile/    Expo app (routes in mobile/src/app)
server/    Tawseela API — Fastify 5 on Node 22, Firebase Admin, Kashier, ImageKit (see server/README.md)
shared/    @fig/shared — the API contract (Zod schemas), pricing, roles and the order workflow
firebase.json · firestore.rules · firestore.indexes.json · .firebaserc
```

| Concern | Choice |
| --- | --- |
| App | Expo SDK 58 · React Native 0.88 (New Architecture) · React 19.3 with the React Compiler · Expo Router 58 · Reanimated 4 · TypeScript strict |
| App state | Zustand 5, persisted with AsyncStorage (the cached catalog, cart, saved dishes, addresses, the demo card wallet, notifications, settings, theme) |
| API | Fastify 5 with Zod type providers (request and response validation), helmet, rate limits, OpenAPI docs at `/docs` |
| Data | Firestore through the Firebase Admin SDK — only the server touches it (`firestore.rules` deny all clients) |
| Auth | Firebase Auth in the app (JS SDK with React Native persistence); the API verifies the ID token on every call and reads the role from `users/{uid}` |
| Payments | Kashier hosted payment sessions on the server, Kashier Direct API card form in the app |
| Images | ImageKit, uploaded through the API (`/fig-fennel/dishes`, `/kitchens`, `/journal`) |

## Run it locally

You need Node 22+ and Java 21 for the Firebase emulators (Android Studio ships one). From `full-stack/`:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
npm install
npm run emulators      # terminal 1 — Auth :9099 + Firestore :8080 (project demo-fig), UI at http://127.0.0.1:4000
npm run seed           # once per emulator start — catalog, demo activity and the accounts below
npm run dev:server     # terminal 2 — API at http://127.0.0.1:3000, docs at http://127.0.0.1:3000/docs
npm run dev:mobile     # terminal 3 — Metro for the development build
```

The app needs a **development build** (Firebase, Kashier, Google Sign-In and the image picker are native code):

```bash
cd mobile
npx expo run:ios       # or: npx expo run:android
```

On a Mac with Xcode 27 `npx expo run:ios` can mis-detect iOS 27 simulators; build with Xcode instead:

```bash
cd mobile && npx expo prebuild --platform ios
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods needs a UTF-8 locale
(cd ios && pod install)
xcodebuild -workspace ios/FigFennel.xcworkspace -scheme FigFennel -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' -derivedDataPath ios/build/dd build
xcrun simctl install booted ios/build/dd/Build/Products/Debug-iphonesimulator/FigFennel.app
xcrun simctl openurl booted "com.tawseela.app://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

For Android, `adb reverse tcp:8081 tcp:8081` and open `figandfennel://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`.
Simulators reach the API on this computer by themselves (iOS at 127.0.0.1, the Android emulator at 10.0.2.2). On a
real phone, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to this computer's Wi-Fi address, e.g. `http://192.168.1.20:3000`.

### Seeded accounts (emulators only)

| Account | Password | Role |
| --- | --- | --- |
| admin@fig.test | `FigAdmin2026` | Admin |
| diner@fig.test | `FigTest2026` | Customer — Alex Morgan (1,240 points, $12.50 credit, past order EK-4799) |
| host@fig.test | `FigStaff2026` | Front of house (Nadia Rahman) |
| kitchen@fig.test | `FigStaff2026` | Kitchen (Leo Park) |
| dispatch@fig.test | `FigStaff2026` | Dispatch (Sam Okafor) |
| courier@fig.test, courier2@fig.test | `FigStaff2026` | Courier (Marco Rossi, Aisha Khan) |

The demo orders sit in every queue (new, confirmed, ready, out for delivery). In emulator mode no email is sent: the
verification and reset links are printed in the emulator's log and listed under Auth in the emulator UI.

### Checks

```bash
npm run typecheck          # all three workspaces
npm test                   # shared pricing, server unit tests, app tests (API client, order workflow)
npm run test:integration   # the API end to end against the emulators (needs npm run emulators)
cd mobile && npx expo lint # the app, with the React Compiler rules
```

## Configuration

Two git-ignored `.env` files hold every setting (`.env.example` next to each is the template).

**`mobile/.env`** — bundled into the app, so public values only. Restart Metro after changing it.

| Key | What |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | The API. Empty in development (simulators use this computer); a LAN address for a phone; the deployed URL for store builds |
| `EXPO_PUBLIC_FIREBASE_EMULATORS` | `1` to sign in against the local Auth emulator (development builds only). Must match the server |

**`server/.env`** — the API's secrets; every key is described in [`server/README.md`](server/README.md#configuration)
(`FIREBASE_PROJECT_ID`, emulator hosts, `GOOGLE_APPLICATION_CREDENTIALS`, `FIRESTORE_DATABASE_ID`, `KASHIER_SECRET_KEY`,
`KASHIER_PAYMENT_API_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_FOLDER`, `DEMO_KITCHEN_SECONDS`, …).

Other credentials:

| What | Where |
| --- | --- |
| `GoogleService-Info.plist`, `google-services.json` | `mobile/` (git-ignored); `mobile/app.config.js` reads them. For EAS Build, upload each as a file variable: `npx eas-cli@latest env:create --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist` (and `GOOGLE_SERVICES_JSON`) |
| Kashier Direct API card form handles eligible wallet methods on the merchant account |
| Android signing SHA-1 (Google sign-in) | Firebase → Project settings → Android app → *Add fingerprint*, then download `google-services.json` again |

In emulator mode the app needs neither Firebase file: it starts the JS SDK with stand-in options for the `demo-fig`
project, which the Auth emulator accepts.

## Using the real Firebase project

1. Firebase console → Project settings → Service accounts → **Generate new private key**; save it as
   `server/service-account.json` (git-ignored).
2. `server/.env`: comment out the emulator hosts, set `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS=service-account.json`
   and, for a project shared with another app, `FIRESTORE_DATABASE_ID=fig-fennel`. `mobile/.env`: leave
   `EXPO_PUBLIC_FIREBASE_EMULATORS` empty. Register the app and add its two config files (below), then rebuild it.
3. Load the menu: `npm run seed -- --yes --no-demo`.
4. Create the team: `npm run team:create -- --yes` — one login per role; the generated passwords go to
   `server/team-accounts.local.md` (git-ignored), never to the terminal.
5. Your own account: sign in once, then `npm run role:set -w server -- you@example.com admin`. From then on admins
   manage everyone in the console under **Users & roles**.
6. Publish the rules, indexes and the idempotency TTL policy:
   `npx firebase-tools@15 deploy --only firestore:rules,firestore:indexes` (`.firebaserc` points at the project; for a
   named database, change `firebase.json`'s `"database"` first).

## Roles and the order workflow

Everyone who signs up — email, Apple or Google — starts as a **Customer** (`user`). An admin gives team roles in
**Console → Manage → Users & roles**, where they can also add accounts (name, email, first password, role), rename them
and disable them. A role change reaches the person within seconds without signing in again (the app re-reads `/me`
every 15 seconds and on returning to the foreground; the server reads the role on each request). Disabling an account
signs it out everywhere. Admins can't demote or disable themselves, and there is always at least one admin.

| Role | Does |
| --- | --- |
| Admin (`admin`) | Everything: menu, settings, promotions, users and roles, any order move, the kitchen display |
| Front of house (`callcenter`) | Calls the guest, corrects the address or phone, **confirms** new orders (or cancels them) |
| Kitchen (`packer`) | Cooks confirmed orders and bags them with a per-item checklist (the same ticks the kitchen display shows), then marks them **ready** |
| Dispatch (`warehouse`) | **Assigns** ready orders to a courier (least busy first) or reassigns; hands pickup orders to the guest |
| Courier (`delivery`) | Sees only orders assigned to them: **picked up**, then **delivered** — a cash order is then marked collected |

Each order moves `placed → confirmed → packed → assigned → out_for_delivery → delivered` (pickup orders skip the courier). The app calls `packed` **Ready** and `assigned` **Courier assigned**; the role ids in code stay `callcenter`, `packer`, `warehouse` and `delivery`
or to `cancelled`. Every move lands on the order's timeline with who made it and when — the team's order screen and the
console's order detail both show it. The rules live once, in `shared/src/roles.ts` (`movesFor`, `QUEUE`): the server
enforces them in a transaction and the app shows each person only the buttons they can press. Customers keep seeing the
simple steps (placed, preparing, on the way / ready for pickup, delivered) and the courier's name once one is assigned.

### Who sees what in the app

The signed-in user and their role live in a small persisted store (`mobile/src/store/session.ts`), so the right screens
are open from the first frame; Firebase Auth restores the session and `GET /v1/me` confirms the role. The root layout
guards routes with Expo Router's `Stack.Protected`:

| Screens | Open to |
| --- | --- |
| Home, menu, dishes, cart, journal, reservations, rewards, sign-in | everyone (booking a table and redeeming a reward ask for sign-in) |
| Checkout, order placed, my orders, tracking, rating, edit profile | signed-in users |
| `/staff` — the team queue | any staff role (admins see every order in progress as "Fulfilment") |
| `/admin` — the restaurant console | admins only |

A link to a guarded screen without access lands on Home. After signing in, admins go straight to the console, staff to
their queue, and a guest who was checking out continues to checkout.

## The API

All routes are under `/v1`; errors are `{ "error": { "code", "message", "details"? } }`. The full list and every schema
are in [`server/README.md`](server/README.md#the-api) and at `/docs`. How the app uses it (`mobile/src/lib/`):

- **`api.ts`** — base URL, the Firebase ID token on every call (a 401 is retried once with a fresh token), timeouts,
  typed `ApiError`s from the error envelope, `If-None-Match`/`304`, `Idempotency-Key`.
- **`sync.ts`** — the catalog (cached, revalidated on launch, every minute and on returning to the foreground), the
  account, orders (every 10 seconds while one is on its way; the tracking screen every 5), bookings, and the console
  (orders and bookings every 5 seconds while it's open, new tickets called out).
- **`remote.ts`** — the store's writes. Console edits show at once and roll back with the server's reason if refused.
- **`checkout.ts`** — orders are priced by the server; a `409 price_changed` reloads the menu and shows the new total.
- **`ops.ts`**, **`team.ts`**, **`uploads.ts`** — the team queues and moves, Users & roles, photo uploads.

## Payments (Kashier Direct API card form)

Online card and wallet payments use Kashier's hosted payment sessions. Card data is entered on Kashier's checkout page and never passes through this app's API. The server creates each session from the order total, stores the session ID, and verifies the result with Kashier's session API or a signed server webhook before the order is marked paid. Cash on delivery remains available.

Required Replit Secrets (server only): `KASHIER_MERCHANT_ID`, `KASHIER_PAYMENT_API_KEY`, `KASHIER_SECRET_KEY`, `KASHIER_MODE`, and `PUBLIC_API_URL`. Set `KASHIER_MODE=test` during integration testing; use `live` only after the merchant's live account and webhook are verified. `PUBLIC_API_URL` must be the public HTTPS URL of the backend deployment.

Webhook endpoint: `POST /v1/webhooks/kashier`. Configure the same URL in Kashier if using dashboard-managed webhooks. Webhook signatures are checked with the Payment API Key using Kashier's `signatureKeys` algorithm. The browser redirect is never treated as proof of payment.

Refunds are not automated in this build. Staff must issue refunds from the Kashier dashboard and reconcile the order manually; the app does not falsely mark a refund as completed.

## Deploying

The API runs on any Node 22 host — see [`server/README.md`](server/README.md#deploying). Point the app at it with
`EXPO_PUBLIC_API_URL` (an EAS environment variable for builds), leave `EXPO_PUBLIC_FIREBASE_EMULATORS` empty, upload the
two Firebase files as EAS file variables, and build with `npx eas-cli@latest build`.

## Sign in with Apple and Google

Login offers **Apple** (iOS) and **Google** (iOS and Android). Each provider's ID token is exchanged for a Firebase
session (`mobile/src/lib/account.ts`, `oauth.ts`), and the API takes that session's ID token. Without what a provider
needs, its button stays and says what's missing — it never signs anyone in without the provider.

**Register `com.tawseela.app` in Firebase and add the config files:**

1. Firebase console → Project settings → **Add app → iOS**: bundle ID `com.tawseela.app`. Download
   `GoogleService-Info.plist` into `mobile/`.
2. **Add app → Android**: package `com.tawseela.app`, plus the signing SHA-1 (`cd mobile/android && ./gradlew
   signingReport` prints the debug one; add the release/EAS one too). Download `google-services.json` into `mobile/`.
3. Authentication → Sign-in method: enable **Email/Password**, **Google** and **Apple**.
4. Rebuild the development app (`npx expo prebuild --clean`, then build) — `app.config.js` wires the files into the
   native projects, adds Google's URL scheme on iOS and passes the web client ID (from `google-services.json`) to
   Google Sign-In.

- **Apple:** the App ID needs the *Sign in with Apple* capability (EAS turns it on from `ios.usesAppleSignIn`). Apple
  returns the name only on the first authorization; the app saves it to the account. Sign-in uses a SHA-256 nonce,
  which Firebase verifies. Apple has no native Android SDK, so the Android button explains that.
- **Google:** uses Google's native SDK — a development or store build (Expo Go says so instead).

## App layout

```
mobile/src/
  app/          routes: (tabs) · login/register/forgot/verify · checkout · track/[no] · rate/[no] · admin/** · staff/** · …
  components/   ui (Txt, Glass, ListCard, StatusPill, Chip, Sheet, toasts, Reveal…), admin, staff, payments, auth, home…
  store/        app-store.ts (catalog, cart, account, orders; server-backed actions) · session.ts · storage.ts
  lib/          api · sync · remote · checkout · kashier · account · oauth · firebase · ops · team · uploads · contract
  data/         the bundled first-launch catalog and device-only seeds (addresses, demo card wallet, inbox)
```

## Design notes

- The screens are the local edition's, unchanged in layout, tokens, motion and dark mode; new screens (the team queue,
  the team's order screen, Users & roles) are built from the same kit: the console's glass header (as "Fig team" on
  `/staff`), `ListCard`/cards on `surface-1`, `StatusPill` stage chips, `Chip` filters, `Sheet` for the courier picker,
  floating CTA bars and staggered `Reveal` entrances.
- **Verify screen:** Firebase confirms an email with a link, not a code, so "Check your inbox" keeps its hero and
  layout but swaps the four code boxes for one status row (where the link went, and "Email verified" once it's opened —
  the screen re-checks every few seconds and when the app comes back from Mail). "Continue" reloads the account and
  carries on either way: ordering never waits on verification. After "Forgot password" the same screen says a reset link
  was sent and goes back to sign-in.
- Irreversible moves (cancel an order, cancel & refund, disable an account) ask for a second tap.
- The Payments screen's saved-card display is still a prototype placeholder; checkout sends one-time card data directly to Kashier and does not save PAN/CVV.
  Settings → Reset demo data resets this phone only (cart, addresses, wallet, inbox); the account and menu are the
  server's. Fig credit comes from the server, so the demo gift card button says gift cards are coming soon.
- Photos keep their Unsplash URLs until replaced from the console.


## Kashier Direct API rollout

- The mobile checkout collects card number, cardholder name, expiry and CVV in memory only and posts them directly to Kashier FEP.
- The Tawseela API signs the order using `KASHIER_PAYMENT_API_KEY`; the Payment API Key and Secret Key remain server-only Replit Secrets.
- `PUBLIC_API_URL` must be the deployed public HTTPS API URL so Kashier can deliver signed webhooks.
- Orders are marked paid only after the signed Kashier webhook validates; the app response and redirect are not payment proof.
- 3D Secure may open a Kashier / issuer authentication page when the bank requires it.
- Direct card collection changes PCI DSS scope. Obtain written confirmation from Kashier about the required PCI DSS validation before enabling live card acceptance.
