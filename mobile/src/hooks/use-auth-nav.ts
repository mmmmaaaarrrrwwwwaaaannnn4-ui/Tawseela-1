import { router, useNavigationContainerRef } from 'expo-router';

import { useAuthForm } from '@/components/auth/auth-ui';
import { startSession, syncRole } from '@/lib/account';
import { isStaff } from '@/lib/contract';
import { useApp } from '@/store/app-store';
import { homeFor, useSession, type SessionUser } from '@/store/session';

const AUTH = new Set(['login', 'register', 'forgot', 'verify']);
const KNOWN = new Set([...AUTH, 'index', '(tabs)', 'admin', 'staff', 'checkout']);

interface NavState {
  index?: number;
  routes: { name: string; state?: NavState }[];
}

/** Finds the app's root Stack state inside the container state. */
function findRootStack(state: NavState | undefined): NavState | undefined {
  let s = state;
  for (let guard = 0; s && guard < 6; guard++) {
    if (s.routes.some((r) => KNOWN.has(r.name))) return s;
    s = s.routes[s.index ?? s.routes.length - 1]?.state;
  }
  return undefined;
}

/**
 * Leaves the auth flow. Auth screens either sit on top of the app (opened from
 * Profile / Cart / Reserve) or were entered straight from the splash.
 * Returns true when it's continuing to checkout (the guest was checking out).
 */
export function useAuthExit() {
  const nav = useNavigationContainerRef();
  return (opts?: { signedIn?: boolean }): boolean => {
    const st = findRootStack(nav.getRootState() as unknown as NavState | undefined);
    const routes = st?.routes ?? [];
    let n = 0;
    for (let i = routes.length - 1; i >= 0 && AUTH.has(routes[i].name); i--) n++;
    const pending = useApp.getState().pendingCheckout;
    useApp.getState().setPendingCheckout(false);

    if (!routes.length || n >= routes.length) {
      // Came from the splash: the auth flow is the whole stack.
      if (router.canDismiss()) router.dismissAll();
      router.replace('/home');
    } else {
      router.dismiss(Math.max(1, n));
    }
    const toCheckout = !!opts?.signedIn && pending && useApp.getState().cart.length > 0;
    if (toCheckout) {
      // the checkout guard opens once the session has re-rendered the root stack
      setTimeout(() => {
        router.navigate('/cart');
        router.push('/checkout');
      }, 260);
    }
    return toCheckout;
  };
}

/**
 * Team members land where they work: once the role is known, admins open the console and staff their
 * queue. Customers (and anyone heading to checkout) stay where they were.
 */
function goToRoleHome(uid: string) {
  void syncRole().then((role) => {
    if (!role || !isStaff(role) || useSession.getState().user?.uid !== uid) return;
    // give the guarded admin / staff routes a frame to mount before navigating into them
    setTimeout(() => router.push(homeFor(role)), 80);
  });
}

/**
 * After Firebase has signed someone in: store them, close the auth flow, take staff to their screens
 * and say hello. `sub` may use the signed-in name.
 */
export function useFinishAuth() {
  const exit = useAuthExit();
  return (user: SessionUser, title: string, sub: string | ((name: string) => string)) => {
    const pending = useApp.getState().pendingCheckout;
    startSession(user);
    const toCheckout = exit({ signedIn: true });
    if (!toCheckout) goToRoleHome(user.uid);
    const line = typeof sub === 'function' ? sub(user.name) : sub;
    setTimeout(() => {
      const app = useApp.getState();
      if (pending && toCheckout) app.showToast(title, 'Continue to checkout', 'lock_open');
      else app.showToast(title, line, 'waving_hand');
    }, 220);
    setTimeout(() => useAuthForm.getState().set({ pw: '', showPw: false }), 700);
  };
}
