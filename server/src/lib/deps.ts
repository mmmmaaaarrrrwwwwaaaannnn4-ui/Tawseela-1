import ImageKit from '@imagekit/nodejs';
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { SERVER_ROOT, usingEmulators, type Config } from '../config';

/** The parts of ImageKit the API uses — an interface, so tests can pass a fake. */
export type Uploader = Pick<ImageKit, 'files'>;

/** Everything the routes talk to, passed in so tests can swap in fakes. */
export type Deps = {
  config: Config;
  db: Firestore;
  auth: Auth;
  /** null when IMAGEKIT_PRIVATE_KEY isn't set — uploads are then refused */
  imagekit: Uploader | null;
  now: () => number;
};

function firebaseApp(config: Config): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (usingEmulators(config)) {
    // nothing to discover on a laptop: skip Google's metadata-server probe (a slow timeout and a warning)
    process.env.METADATA_SERVER_DETECTION ??= 'none';
    return initializeApp({ projectId: config.FIREBASE_PROJECT_ID });
  }
  // Prefer a secret supplied by the hosting platform (e.g. Replit Secrets).
  // Never put this JSON in the repository or in the mobile app.
  let serviceAccount: ReturnType<typeof JSON.parse> | undefined;
  if (config.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(config.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON');
    }
  }
  const keyFile = credentialsPath(config.GOOGLE_APPLICATION_CREDENTIALS);
  if (!serviceAccount && keyFile) {
    try {
      serviceAccount = JSON.parse(readFileSync(keyFile, 'utf8'));
    } catch {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS must point to a valid service-account JSON file');
    }
  }
  const credential = serviceAccount ? cert(serviceAccount) : applicationDefault();
  return initializeApp({ credential, projectId: config.FIREBASE_PROJECT_ID });
}

/**
 * The service-account key path, relative to server/ (where server/.env lives) unless absolute. Google's
 * libraries read the same variable, so it's set back as an absolute path for them too.
 */
function credentialsPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const abs = isAbsolute(path) ? path : resolve(SERVER_ROOT, path);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = abs;
  return abs;
}

/** The Firestore database: `(default)`, or FIRESTORE_DATABASE_ID when the project hosts several apps. */
export function firestoreFor(app: App, config: Pick<Config, 'FIRESTORE_DATABASE_ID'>): Firestore {
  const id = config.FIRESTORE_DATABASE_ID;
  const db = id && id !== '(default)' ? getFirestore(app, id) : getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // already configured by an earlier createDeps in this process
  }
  return db;
}

export function createDeps(config: Config): Deps {
  const app = firebaseApp(config);
  return {
    config,
    db: firestoreFor(app, config),
    auth: getAuth(app),
    imagekit: config.IMAGEKIT_PRIVATE_KEY ? new ImageKit({ privateKey: config.IMAGEKIT_PRIVATE_KEY }) : null,
    now: () => Date.now(),
  };
}
