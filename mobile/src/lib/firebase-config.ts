import Constants from 'expo-constants';
import type { FirebaseOptions } from 'firebase/app';

/** Written by app.config.js from GoogleService-Info.plist and google-services.json, when they exist. */
type FirebaseExtra = { ios?: FirebaseOptions; android?: FirebaseOptions; googleWebClientId?: string };

const extra = (Constants.expoConfig?.extra?.firebase ?? {}) as FirebaseExtra;

/**
 * Development only: EXPO_PUBLIC_FIREBASE_EMULATORS=1 signs in against the local Auth emulator
 * (`npm run emulators`, project `demo-fig`). Must match the server's Firebase setting.
 */
export const emulatorMode = __DEV__ && process.env.EXPO_PUBLIC_FIREBASE_EMULATORS === '1';

/** How a simulator reaches this computer: the Android emulator sees it as 10.0.2.2. */
export const emulatorHost = process.env.EXPO_OS === 'android' ? '10.0.2.2' : '127.0.0.1';

const EMULATOR_PROJECT = 'demo-fig';

/** The registered Firebase app for this platform (from the native config files), if there is one. */
const registered = process.env.EXPO_OS === 'android' ? (extra.android ?? extra.ios) : (extra.ios ?? extra.android);

/**
 * Stand-in options for the Auth emulator while no Firebase app is registered for com.tawseela.app:
 * the emulator accepts any API key under a `demo-` project, so email sign-in works without the files.
 */
const EMULATOR_OPTIONS: FirebaseOptions = {
  apiKey: 'demo-fig-api-key',
  appId: '1:000000000000:web:0000000000000000',
  projectId: EMULATOR_PROJECT,
  authDomain: `${EMULATOR_PROJECT}.firebaseapp.com`,
};

/** The options the JS SDK starts with — undefined when sign-in can't work in this build. */
export const firebaseOptions: FirebaseOptions | undefined = emulatorMode ? { ...(registered ?? EMULATOR_OPTIONS), projectId: EMULATOR_PROJECT } : registered;

export const firebaseConfigured = !!firebaseOptions?.apiKey;

/** The native config files are bundled (Google sign-in needs their client IDs and URL scheme). */
export const nativeFirebaseConfig = !!registered?.apiKey;

/** Google's "web" OAuth client, which makes Google Sign-In ID tokens valid for Firebase Auth. */
export const googleWebClientId = extra.googleWebClientId;
