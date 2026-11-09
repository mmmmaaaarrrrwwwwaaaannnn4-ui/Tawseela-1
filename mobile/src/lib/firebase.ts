import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';

import { emulatorHost, emulatorMode, firebaseOptions } from './firebase-config';

/*
 * The app only uses Firebase for sign-in. Menu, orders, bookings and payments go through the Fig API
 * (lib/api.ts), which checks the Firebase ID token on every call.
 */

const app = firebaseOptions ? (getApps().length ? getApp() : initializeApp(firebaseOptions)) : null;

/**
 * Firebase Auth with the session kept in AsyncStorage, so people stay signed in across launches.
 * A fast refresh re-runs this module and Auth can only be initialised once, hence the getAuth fallback.
 */
function createAuth(): Auth | null {
  if (!app) return null;
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence({
        getItem: (key: string) => AsyncStorage.getItem(key),
        setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
        removeItem: (key: string) => AsyncStorage.removeItem(key),
      }),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();

const g = globalThis as { __figAuthEmulator?: boolean };
if (emulatorMode && auth && !g.__figAuthEmulator) {
  g.__figAuthEmulator = true;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
}
