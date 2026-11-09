import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { TurboModuleRegistry } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { deviceStorage } from '@/store/storage';

import { emulatorMode, googleWebClientId, nativeFirebaseConfig } from './firebase-config';

export type OAuthProvider = 'apple' | 'google';

/** What a provider tells us about the person who signed in. */
export interface OAuthProfile {
  provider: OAuthProvider;
  /** stable provider user id (Apple `user`, Google `sub`) */
  id: string;
  name: string;
  email: string;
  photo?: string;
  /** signed JWT, exchanged for a Firebase session */
  idToken: string | null;
  /** Apple only: the unhashed nonce whose SHA-256 went into the request (Firebase checks it) */
  rawNonce?: string;
}

export type OAuthResult =
  { ok: true; profile: OAuthProfile } | { ok: false; reason: 'cancelled' } | { ok: false; reason: 'unavailable' | 'error'; message: string };

const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/* ------------------------------------------------------------------ Apple (iOS only) */

/**
 * Apple sends the name and email only on the very first authorization, so remember them per Apple
 * user id; later sign-ins with the same Apple ID look them up here.
 */
const useAppleNames = create<{ byId: Record<string, { name: string; email: string }> }>()(
  persist(() => ({ byId: {} }), { name: 'fig-apple-ids', storage: createJSONStorage(() => deviceStorage) }),
);

export async function signInWithApple(): Promise<OAuthResult> {
  if (process.env.EXPO_OS !== 'ios') {
    return { ok: false, reason: 'unavailable', message: 'Sign in with Apple is available on iPhone. Use Google or your email here.' };
  }
  // Apple's ID token has to be accepted by a Firebase project: a registered app, or the local emulator
  if (!nativeFirebaseConfig && !emulatorMode) {
    return { ok: false, reason: 'unavailable', message: 'Sign in with Apple isn’t set up for this build yet — GoogleService-Info.plist is missing.' };
  }
  if (!(await AppleAuthentication.isAvailableAsync().catch(() => false))) {
    return { ok: false, reason: 'unavailable', message: 'Sign in with Apple isn’t available on this device.' };
  }
  try {
    // Firebase requires a nonce: Apple embeds its SHA-256 in the ID token, Firebase gets the raw value
    const rawNonce = Crypto.randomUUID();
    const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
    const fresh = {
      name: [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' '),
      email: cred.email ?? '',
    };
    const known = useAppleNames.getState().byId[cred.user];
    const name = fresh.name || known?.name || '';
    const email = fresh.email || known?.email || '';
    if (fresh.name || fresh.email) useAppleNames.setState((s) => ({ byId: { ...s.byId, [cred.user]: { name, email } } }));
    return { ok: true, profile: { provider: 'apple', id: cred.user, name, email, idToken: cred.identityToken, rawNonce } };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'ERR_REQUEST_CANCELED') return { ok: false, reason: 'cancelled' };
    // what iOS reports when no Apple Account is signed in on the device
    if (code === 'ERR_REQUEST_UNKNOWN') {
      return { ok: false, reason: 'unavailable', message: 'Sign in to your Apple Account in Settings, then try again.' };
    }
    return { ok: false, reason: 'error', message: 'Apple couldn’t sign you in. Try again in a moment.' };
  }
}

/* ------------------------------------------------------------------ Google (native SDK) */

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let google: GoogleModule | null = null;

/** Whether this binary includes Google's native SDK (development and store builds; not Expo Go). */
const hasGoogleNative = () => TurboModuleRegistry.get('RNGoogleSignin') != null;

/**
 * Loads and configures the Google module on first use. Importing it at the top of the file would
 * throw in Expo Go, which doesn't ship its native code, so it's required only once that's confirmed.
 */
function loadGoogle(): GoogleModule {
  if (!google) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    google = require('@react-native-google-signin/google-signin') as GoogleModule;
    // the iOS client ID is read from GoogleService-Info.plist, which the config plugin bundles
    google.GoogleSignin.configure({ webClientId: googleWebClientId });
  }
  return google;
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  if (inExpoGo || !hasGoogleNative()) {
    return { ok: false, reason: 'unavailable', message: 'Google sign-in needs a development build — it isn’t available in Expo Go.' };
  }
  // Without the Firebase files the build has no OAuth client IDs (and on iOS no URL scheme, which
  // would abort the app), so never call into the SDK until they're bundled.
  if (!nativeFirebaseConfig || !googleWebClientId) {
    const file = process.env.EXPO_OS === 'android' ? 'google-services.json' : 'GoogleService-Info.plist and google-services.json';
    return {
      ok: false,
      reason: 'unavailable',
      message: `Google sign-in isn’t set up for this build yet — ${file} ${file.includes(' and ') ? 'are' : 'is'} missing.`,
    };
  }
  const m = loadGoogle();
  try {
    await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await m.GoogleSignin.signIn();
    if (!m.isSuccessResponse(res)) return { ok: false, reason: 'cancelled' };
    const { user, idToken } = res.data;
    return {
      ok: true,
      profile: {
        provider: 'google',
        id: user.id,
        name: user.name || [user.givenName, user.familyName].filter(Boolean).join(' '),
        email: user.email,
        photo: user.photo ?? undefined,
        idToken,
      },
    };
  } catch (e) {
    if (m.isErrorWithCode(e)) {
      if (e.code === m.statusCodes.SIGN_IN_CANCELLED || e.code === m.statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled' };
      if (e.code === m.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { ok: false, reason: 'error', message: 'Google Play services is missing or out of date on this device.' };
      }
      // "10" / DEVELOPER_ERROR: no OAuth client matches this package + signing certificate
      if (e.code === '10' || /DEVELOPER_ERROR/.test(e.message)) {
        return { ok: false, reason: 'unavailable', message: 'Google sign-in isn’t set up for this build yet — add this build’s SHA-1 in Firebase.' };
      }
    }
    return { ok: false, reason: 'error', message: 'Google couldn’t sign you in. Try again in a moment.' };
  }
}

/** Ends the Google session too, so the next Google sign-in offers the account picker again. */
export async function signOutProvider(provider: OAuthProvider | 'password' | undefined): Promise<void> {
  if (provider !== 'google' || !hasGoogleNative() || !nativeFirebaseConfig) return;
  try {
    await loadGoogle().GoogleSignin.signOut();
  } catch {
    // already signed out on the Google side
  }
}
