/**
 * Creates the restaurant team — one login per role — in the Firebase project server/.env points at, so
 * an order can be followed from the customer to the doorstep:
 *
 *   npm run team:create                          # the emulators
 *   npm run team:create -- --yes                 # the real project (asks for --yes)
 *   … -- --yes --reset-passwords                 # give existing team accounts new passwords
 *
 * New accounts get a random password. Passwords go only to server/team-accounts.local.md (git-ignored),
 * never to the terminal — share each one with its person and have them change it.
 * Existing accounts keep their password; their name and role are brought in line.
 */
import { POINTS, ROLE_INFO, type Role } from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { databaseLabel, loadConfig, usingEmulators } from '../src/config';
import { COL } from '../src/lib/collections';
import { createDeps } from '../src/lib/deps';

type Member = { email: string; name: string; role: Role; phone: string };

/** The team: an admin, the four fulfilment roles (two riders) and a customer to order with. */
const TEAM: Member[] = [
  { email: 'admin@fig.test', name: 'Fig Admin', role: 'admin', phone: '+1 (212) 555-0100' },
  { email: 'host@fig.test', name: 'Nadia Rahman', role: 'callcenter', phone: '+1 (212) 555-0161' },
  { email: 'kitchen@fig.test', name: 'Leo Park', role: 'packer', phone: '+1 (212) 555-0162' },
  { email: 'dispatch@fig.test', name: 'Sam Okafor', role: 'warehouse', phone: '+1 (212) 555-0163' },
  { email: 'courier@fig.test', name: 'Marco Rossi', role: 'delivery', phone: '+1 (917) 555-0164' },
  { email: 'courier2@fig.test', name: 'Aisha Khan', role: 'delivery', phone: '+1 (917) 555-0165' },
  { email: 'diner@fig.test', name: 'Alex Morgan', role: 'user', phone: '+1 (212) 555-0142' },
];

const OUT_FILE = resolve(import.meta.dirname, '../team-accounts.local.md');
const args = new Set(process.argv.slice(2));
const config = loadConfig();
const emulator = usingEmulators(config);

if (!emulator && !args.has('--yes')) {
  console.error(
    `This creates ${TEAM.length} logins in the real Firebase project "${config.FIREBASE_PROJECT_ID}".\n` +
      'Run it again with --yes to confirm:  npm run team:create -- --yes',
  );
  process.exit(1);
}

const { auth, db } = createDeps(config);
const resetPasswords = args.has('--reset-passwords');
/** 16 characters from a 62-character alphabet, plus a fixed prefix so it reads as a password. */
const newPassword = () => 'Fig-' + randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').slice(0, 16);

const rows: { m: Member; password: string | null; created: boolean }[] = [];
for (const m of TEAM) {
  let user = await auth.getUserByEmail(m.email).catch(() => null);
  let password: string | null = null;
  const created = !user;
  if (!user) {
    password = newPassword();
    user = await auth.createUser({ email: m.email, password, displayName: m.name, emailVerified: true });
  } else if (resetPasswords) {
    password = newPassword();
    await auth.updateUser(user.uid, { password, displayName: m.name, disabled: false });
  } else {
    await auth.updateUser(user.uid, { displayName: m.name, disabled: false });
  }
  await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: m.role === 'admin' });

  const ref = db.collection(COL.users).doc(user.uid);
  const exists = (await ref.get()).exists;
  await ref.set(
    {
      name: m.name,
      email: m.email,
      phone: m.phone,
      role: m.role,
      disabled: false,
      provider: 'password',
      ...(exists ? {} : { photo: null, points: POINTS.welcome, credit: 0, redeemed: [], vouchers: [], liked: [], createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  rows.push({ m, password, created });
  console.log(`${created ? 'Created' : 'Updated'}  ${m.email.padEnd(22)} ${ROLE_INFO[m.role].label}`);
}

const where = emulator ? 'the Firebase emulators' : `Firebase project ${config.FIREBASE_PROJECT_ID} (Firestore ${databaseLabel(config)})`;
const lines = [
  `# Fig & Fennel team logins (${where})`,
  '',
  `Written by \`npm run team:create\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Git-ignored — keep it private.`,
  'Each person signs in to the app with their email and password; staff find their queue under Profile → Staff.',
  '',
  '| Email | Name | Role | Password |',
  '| --- | --- | --- | --- |',
  ...rows.map(({ m, password }) => `| ${m.email} | ${m.name} | ${ROLE_INFO[m.role].label} | ${password ? `\`${password}\`` : 'unchanged (run with --reset-passwords for a new one)'} |`),
  '',
];
writeFileSync(OUT_FILE, lines.join('\n'), { mode: 0o600 });
console.log(`\nPasswords for new accounts are in server/team-accounts.local.md (git-ignored).`);
process.exit(0);
