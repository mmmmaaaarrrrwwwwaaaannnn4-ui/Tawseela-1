/**
 * Gives an account a role — the way to make the first admin, who can then manage everyone else from
 * the console's Users & roles screen.
 *
 *   npm run role:set -w server -- owner@example.com admin
 *   npm run role:set -w server -- courier@example.com delivery
 *   npm run role:set -w server -- someone@example.com user      # back to customer
 *
 * Roles: admin, callcenter, packer, warehouse, delivery, user. The account must exist (signed in once,
 * or created with team:create). The change applies within a few seconds — no need to sign in again.
 */
import { POINTS, Role } from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';

import { databaseLabel, loadConfig, usingEmulators } from '../src/config';
import { COL } from '../src/lib/collections';
import { createDeps } from '../src/lib/deps';

const [email, roleArg] = process.argv.slice(2);
const role = Role.safeParse(roleArg);
if (!email || !role.success) {
  console.error(`Usage: npm run role:set -w server -- <email> <${Role.options.join('|')}>`);
  process.exit(1);
}

const config = loadConfig();
const { auth, db } = createDeps(config);

const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No account for ${email} in ${usingEmulators(config) ? 'the Auth emulator' : config.FIREBASE_PROJECT_ID}. Sign in to the app with it first.`);
  process.exit(1);
}
const ref = db.collection(COL.users).doc(user.uid);
const exists = (await ref.get()).exists;
await ref.set(
  {
    role: role.data,
    disabled: false,
    email,
    name: user.displayName || email.split('@')[0],
    ...(exists ? {} : { phone: null, photo: null, provider: 'password', points: POINTS.welcome, credit: 0, redeemed: [], vouchers: [], liked: [], createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true },
);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: role.data === 'admin' });
console.log(`${email} is now ${role.data} (Firestore ${databaseLabel(config)}).`);
process.exit(0);
