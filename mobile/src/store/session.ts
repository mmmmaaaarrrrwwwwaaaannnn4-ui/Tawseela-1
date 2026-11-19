import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isStaff, type Role } from '@/lib/contract';

import { deviceStorage } from './storage';

/*
 * Who is signed in, and what they may do. Firebase Auth owns the session (lib/account.ts keeps this
 * store in step with it) and the server owns the role (GET /v1/me). This is the app's local copy,
 * saved on the device so the right screens are open from the first frame of the next launch.
 */

export interface SessionUser {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  photo?: string;
  /** how they signed in */
  provider?: 'password' | 'apple' | 'google';
  emailVerified?: boolean;
}

interface SessionState {
  user: SessionUser | null;
  /** the account's role; `user` (a customer) until the server says otherwise */
  role: Role;
  /** Firebase has reported this launch's session (until then `user` is the saved one) */
  ready: boolean;
  /** the server (or the ID token) confirmed `role` this launch */
  roleConfirmed: boolean;

  signIn: (user: SessionUser) => void;
  updateUser: (patch: Partial<SessionUser>) => void;
  setRole: (role: Role) => void;
  signOut: () => void;
  setReady: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      role: 'user',
      ready: false,
      roleConfirmed: false,

      // a different account starts as a customer: its own role arrives from the server
      signIn: (user) => set((s) => (s.user?.uid === user.uid ? { user: { ...s.user, ...user } } : { user, role: 'user', roleConfirmed: false })),
      updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      setRole: (role) => set({ role, roleConfirmed: true }),
      signOut: () => set({ user: null, role: 'user', roleConfirmed: false }),
      setReady: () => set({ ready: true }),
    }),
    {
      name: 'fig-session',
      version: 1,
      storage: createJSONStorage(() => deviceStorage),
      partialize: ({ user, role }) => ({ user, role }),
    },
  ),
);

/* ------------------------------------------------------------------ selectors */

type Who = Pick<SessionState, 'user' | 'role'>;

export const selectSignedIn = (s: Pick<SessionState, 'user'>) => !!s.user?.uid;
/** Only a signed-in admin. */
export const selectIsAdmin = (s: Who) => !!s.user?.uid && s.role === 'admin';
/** Any signed-in team member, admins included. */
export const selectIsStaff = (s: Who) => !!s.user?.uid && isStaff(s.role);

/** The signed-in user, outside React. */
export const currentUser = () => useSession.getState().user;

/** Where each role works: the console for admins, the team queue for staff, the app for customers. */
export const homeFor = (role: Role): Href => (role === 'admin' ? '/admin' : isStaff(role) ? '/staff' : '/home');

/** The saved session has loaded from the device (route guards wait for it, so nobody is bounced on launch). */
export const useSessionHydrated = () => {
  const [hydrated, setHydrated] = useState(() => useSession.persist.hasHydrated());
  useEffect(() => {
    if (useSession.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useSession.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
};
