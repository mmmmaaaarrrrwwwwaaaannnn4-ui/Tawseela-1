import { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User as FirebaseUser,
} from 'firebase/auth';
import { useEffect } from 'react';

import { useApp } from '@/store/app-store';
import { useSession, type SessionUser } from '@/store/session';

import { api, ApiError } from './api';
import { isRole, type Role } from './contract';
import { auth } from './firebase';
import { emulatorMode } from './firebase-config';
import { signInWithApple, signInWithGoogle, signOutProvider, type OAuthProvider as Provider, type OAuthResult } from './oauth';
import { syncCatalog, syncMe } from './sync';

/*
 * Accounts: Firebase Auth signs people in (email and password, Apple, Google); the Fig API owns the
 * profile and the role. The session store is the app's copy of both.
 */

export type AccountResult = { ok: true; user: SessionUser } | { ok: false; cancelled?: boolean; message: string };
type Done = { ok: true } | { ok: false; message: string };

const NOT_CONFIGURED = 'Sign-in isn’t set up for this build — add the Firebase config files, or run with EXPO_PUBLIC_FIREBASE_EMULATORS=1.';

/** Plain-language messages for Firebase Auth error codes. */
export function authMessage(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password don’t match an account.';
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/email-already-in-use':
      return 'There’s already an account with this email — sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password with at least 8 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
      return emulatorMode
        ? 'Can’t reach the Firebase Auth emulator. Start it with `npm run emulators` and try again.'
        : 'You’re offline. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact Tawseela if you think that’s a mistake.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method isn’t turned on for Tawseela yet.';
    case 'auth/account-exists-with-different-credential':
      return 'This email already signs in another way. Use that method first.';
    case 'auth/requires-recent-login':
      return 'For your security, sign out and back in, then try again.';
    default:
      return 'Something went wrong. Try again in a moment.';
  }
}

function providerOf(u: FirebaseUser): SessionUser['provider'] {
  const id = u.providerData[0]?.providerId;
  return id === 'google.com' ? 'google' : id === 'apple.com' ? 'apple' : 'password';
}

/** The app's user record for a Firebase user (keeping a phone number saved on this device). */
function toSessionUser(u: FirebaseUser, name?: string): SessionUser {
  const prev = useSession.getState().user;
  return {
    uid: u.uid,
    name: name || u.displayName || u.email?.split('@')[0] || 'Tawseela guest',
    email: u.email ?? '',
    phone: prev?.uid === u.uid ? prev.phone : undefined,
    photo: u.photoURL ?? undefined,
    provider: providerOf(u),
    emailVerified: u.emailVerified,
  };
}

/* ------------------------------------------------------------------ session */

/** Signs `user` in on this device. Switching straight to another account forgets the previous one's data. */
export function startSession(user: SessionUser): void {
  const session = useSession.getState();
  if (session.user?.uid && session.user.uid !== user.uid) useApp.getState().clearAccount();
  session.signIn(user);
}

/** Forgets the signed-in user on this device (the menu, cart and settings stay). */
export function endSession(): void {
  const wasAdmin = useSession.getState().role === 'admin';
  useSession.getState().signOut();
  useApp.getState().clearAccount();
  // an admin's cached catalog has drafts and promo codes: swap it for the public one
  if (wasAdmin) void syncCatalog({ force: true });
}

/**
 * The account's role. The server's word (GET /v1/me) wins; while it can't be reached, a `role` claim
 * on the Firebase ID token (when the server sets one) keeps staff on their screens.
 */
export async function syncRole(): Promise<Role | null> {
  const fbUser = auth?.currentUser;
  const session = useSession.getState();
  if (!fbUser || session.user?.uid !== fbUser.uid) return null;
  const me = await syncMe();
  if (me) return isRole(me.role) ? me.role : null;
  // the API can't be reached: a role claim on the ID token (when the server sets one) still opens the right screens
  try {
    const { claims } = await fbUser.getIdTokenResult();
    const role = isRole(claims.role) ? claims.role : claims.admin === true ? 'admin' : null;
    if (role && useSession.getState().user?.uid === fbUser.uid) useSession.getState().setRole(role);
    return role ?? (useSession.getState().roleConfirmed ? useSession.getState().role : null);
  } catch {
    return null;
  }
}

/**
 * Saves the name and phone on the account. The server keeps users/{uid} in step; when it can't be
 * reached the change still shows on this device and is sent with the next profile save.
 */
async function saveProfile(user: SessionUser): Promise<void> {
  try {
    await api.patch('/v1/me', { name: user.name, phone: user.phone ?? null });
  } catch (e) {
    if (!(e instanceof ApiError && e.offline)) console.warn('[account] could not save the profile', e);
  }
}

/* ------------------------------------------------------------------ email and password */

export async function signInWithEmail(email: string, password: string): Promise<AccountResult> {
  if (!auth) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true, user: toSessionUser(user) };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/** Creates the account, sets its display name and sends Firebase's verification email. */
export async function registerWithEmail(name: string, email: string, password: string): Promise<AccountResult> {
  if (!auth) return { ok: false, message: NOT_CONFIGURED };
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await updateProfile(user, { displayName: name.trim() }).catch((e) => console.warn('[account] display name', e));
    sendEmailVerification(user).catch((e) => console.warn('[account] verification email failed', e));
    const appUser = toSessionUser(user, name.trim());
    void saveProfile(appUser);
    return { ok: true, user: appUser };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

export async function sendPasswordReset(email: string): Promise<Done> {
  if (!auth) return { ok: false, message: NOT_CONFIGURED };
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (e) {
    // don't reveal whether an account exists for the address
    if (e instanceof FirebaseError && e.code === 'auth/user-not-found') return { ok: true };
    return { ok: false, message: authMessage(e) };
  }
}

/** Sends the verification link again to the signed-in account. */
export async function resendVerification(): Promise<Done> {
  const user = auth?.currentUser;
  if (!user) return { ok: false, message: 'Sign in first, then ask for a new link.' };
  try {
    await sendEmailVerification(user);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/** Asks Firebase whether the link has been opened yet (reloads the account). */
export async function checkEmailVerified(): Promise<boolean> {
  const user = auth?.currentUser;
  if (!user) return false;
  try {
    await reload(user);
  } catch {
    // offline: answer from what we know
  }
  const verified = !!auth?.currentUser?.emailVerified;
  useSession.getState().updateUser({ emailVerified: verified });
  // a verified address shows up in the ID token the server reads
  if (verified) await user.getIdToken(true).catch(() => null);
  return verified;
}

/** Firebase sends a confirmation link to the new address; the email changes once it's opened. */
export async function changeEmail(email: string): Promise<Done> {
  const user = auth?.currentUser;
  if (!user) return { ok: false, message: 'Sign in first.' };
  try {
    await verifyBeforeUpdateEmail(user, email.trim());
    return { ok: true };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/* ------------------------------------------------------------------ Apple and Google */

/** Native Apple / Google sign-in, then exchange its ID token for a Firebase session. */
export async function signInWithProvider(provider: Provider): Promise<AccountResult> {
  const res: OAuthResult = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
  if (!res.ok) return res.reason === 'cancelled' ? { ok: false, cancelled: true, message: '' } : { ok: false, message: res.message };
  if (!auth) return { ok: false, message: NOT_CONFIGURED };
  const { profile } = res;
  if (!profile.idToken) return { ok: false, message: 'The provider didn’t return a sign-in token. Try again.' };
  try {
    const credential =
      provider === 'apple'
        ? new OAuthProvider('apple.com').credential({ idToken: profile.idToken, rawNonce: profile.rawNonce })
        : GoogleAuthProvider.credential(profile.idToken);
    const { user } = await signInWithCredential(auth, credential);
    // Apple shares the name only once, so store it on the Firebase account the first time
    if (!user.displayName && profile.name) await updateProfile(user, { displayName: profile.name }).catch(() => undefined);
    const appUser = toSessionUser(user, user.displayName || profile.name);
    if (profile.name) void saveProfile(appUser);
    return { ok: true, user: appUser };
  } catch (e) {
    return { ok: false, message: authMessage(e) };
  }
}

/* ------------------------------------------------------------------ profile and sign-out */

/** Updates the name everywhere and the phone number on the profile. */
export async function updateAccountProfile(patch: { name: string; phone?: string }): Promise<void> {
  const session = useSession.getState();
  if (!session.user) return;
  session.updateUser({ name: patch.name, phone: patch.phone });
  const fbUser = auth?.currentUser;
  if (fbUser && fbUser.displayName !== patch.name) await updateProfile(fbUser, { displayName: patch.name }).catch(() => undefined);
  await saveProfile({ ...session.user, name: patch.name, phone: patch.phone });
}

export async function signOutAccount(): Promise<void> {
  const provider = useSession.getState().user?.provider;
  endSession();
  await signOutProvider(provider);
  if (auth) await firebaseSignOut(auth).catch((e) => console.warn('[account] sign-out failed', e));
}

/**
 * Keeps the session store in step with Firebase Auth: restores the session on launch, clears one that
 * no longer exists (expired, disabled, or a demo user saved before sign-in was real), and re-checks the
 * role on launch and whenever the app comes back to the foreground.
 */
export function useAccountSession() {
  useEffect(() => {
    if (!auth) {
      // no Firebase in this build: nobody can be signed in
      if (useSession.getState().user) endSession();
      useSession.getState().setReady();
      return;
    }
    // the account's data (role, points, orders) follows in lib/sync.ts once `ready` and the uid are set
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      const saved = useSession.getState().user;
      if (u) {
        if (saved?.uid !== u.uid) startSession(toSessionUser(u));
        else useSession.getState().updateUser({ emailVerified: u.emailVerified, email: u.email ?? saved.email });
      } else if (saved) {
        endSession();
      }
      useSession.getState().setReady();
    });
    return unsubscribe;
  }, []);
}
