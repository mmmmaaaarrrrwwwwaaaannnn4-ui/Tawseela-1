import type { AdminCatalog, Booking, Catalog, Customer, Me, Order, Review } from '@fig/shared';
import { restaurantDate, stepOfStage } from '@fig/shared';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { CUSTOMER_STEPS } from '@/data/content';
import { stepLabel, useApp } from '@/store/app-store';
import { useSession } from '@/store/session';

import { api, ApiError, errorMessage, get, onReachability } from './api';
import { isRole } from './contract';
import { auth } from './firebase';

/*
 * Server → store. The catalog is cached on the device (the persisted store) and revalidated with its
 * ETag, so a launch shows the last menu at once — offline too — and an unchanged menu costs a 304.
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface SyncState {
  catalog: LoadState;
  catalogError: string | null;
  /** last successful contact with the API (ms) */
  lastSync: number;
  admin: LoadState;
  adminError: string | null;
  /** false while calls to the API fail to connect */
  reachable: boolean;
}

export const useSync = create<SyncState>(() => ({ catalog: 'idle', catalogError: null, lastSync: 0, admin: 'idle', adminError: null, reachable: true }));

const toast = (title: string, sub: string, icon: Parameters<ReturnType<typeof useApp.getState>['showToast']>[2], action?: { label: string; href: string }) =>
  useApp.getState().showToast(title, sub, icon, action);

// Say so once when the API stops answering (the cached menu keeps working), and once when it's back.
onReachability((reachable) => {
  const was = useSync.getState().reachable;
  if (was === reachable) return;
  useSync.setState({ reachable });
  if (!reachable) toast('You’re offline', 'Showing the menu saved on this phone. We’ll sync when Fig & Fennel is reachable.', 'info');
  else toast('Back online', 'Menu and orders are up to date', 'sync');
});

const signedIn = () => !!useSession.getState().user?.uid && !!auth?.currentUser;
const isAdmin = () => signedIn() && useSession.getState().role === 'admin';

/* ------------------------------------------------------------------ catalog */

let catalogInFlight: Promise<void> | null = null;
/** whose catalog the cached copy is: admins also get drafts and promo codes */
let catalogFor: 'admin' | 'public' | null = null;

/**
 * Loads the catalog, or confirms the cached one is current (a 304 for the same ETag). Admins read the
 * console's catalog, which also has drafts and promo codes.
 */
export function syncCatalog(opts: { force?: boolean } = {}): Promise<void> {
  if (catalogInFlight) return catalogInFlight;
  catalogInFlight = (async () => {
    const s = useApp.getState();
    const admin = isAdmin();
    const kind = admin ? 'admin' : 'public';
    // the ETag only stands for the copy we hold when it came from the same endpoint
    const sameKind = catalogFor === null ? !admin : catalogFor === kind;
    const cached = s.catalogVersion > 0;
    if (!cached) useSync.setState({ catalog: 'loading', catalogError: null });
    try {
      const res = await get<Catalog | AdminCatalog>(admin ? '/v1/admin/catalog' : '/v1/catalog', {
        etag: cached && sameKind && !opts.force ? s.catalogEtag : null,
        auth: admin,
      });
      // (without a conditional request, an unchanged version is still a no-op)
      const changed = !!res.data && (opts.force || !sameKind || res.data.version !== s.catalogVersion);
      if (!res.notModified && res.data && changed) useApp.getState().applyCatalog(res.data, res.etag);
      catalogFor = kind;
      useSync.setState({ catalog: 'ready', catalogError: null, lastSync: Date.now() });
    } catch (e) {
      // with a cached menu the app keeps working; only an empty first launch shows the error
      useSync.setState({ catalog: cached ? 'ready' : 'error', catalogError: errorMessage(e) });
    } finally {
      catalogInFlight = null;
    }
  })();
  return catalogInFlight;
}

/** Debounced catalog refresh after a console edit, so the version and server-side fields catch up. */
let catalogTimer: ReturnType<typeof setTimeout> | null = null;
export function catalogChanged() {
  if (catalogTimer) clearTimeout(catalogTimer);
  catalogTimer = setTimeout(() => {
    catalogTimer = null;
    void syncCatalog({ force: true });
  }, 600);
}

/* ------------------------------------------------------------------ account */

/**
 * The signed-in account: role, points, credit, vouchers and likes. The role lands in the session, so a
 * change an admin makes reaches this person within seconds (their guarded screens open or close).
 */
export async function syncMe(): Promise<Me | null> {
  const uid = useSession.getState().user?.uid;
  if (!uid || !auth?.currentUser) return null;
  try {
    const me = await api.get<Me>('/v1/me');
    const session = useSession.getState();
    if (session.user?.uid !== me.uid) return null;
    const wasAdmin = session.role === 'admin';
    if (isRole(me.role)) session.setRole(me.role);
    session.updateUser({ name: me.name || session.user.name, ...(me.phone ? { phone: me.phone } : {}) });
    useApp.getState().applyMe(me);
    // admins see drafts and promo codes in the catalog (and lose them when demoted)
    if (me.admin !== wasAdmin) void syncCatalog({ force: true });
    return me;
  } catch (e) {
    if (e instanceof ApiError && (e.code === 'account_disabled' || e.status === 403)) {
      // disabled: the server revoked the session
      toast('Account disabled', e.message, 'block');
    } else if (!(e instanceof ApiError && e.offline)) console.warn('[sync] me', e);
    return null;
  }
}

/** A customer-facing note when one of their orders moves on (what the local edition's simulation did). */
function announce(changed: Order[], before: Map<string, Order>, opts: { quiet?: boolean } = {}) {
  const { orderNotif } = useApp.getState();
  const uid = useSession.getState().user?.uid;
  for (const o of changed) {
    const prev = before.get(o.id);
    if (!prev || prev.step === o.step || o.uid !== uid || o.step > 3) continue;
    const label = stepLabel(o, o.step);
    const sub = o.step === 2 && o.mode === 'delivery' && o.rider ? `${o.rider.name.split(' ')[0]} is riding to you` : CUSTOMER_STEPS[o.step][1];
    useApp.getState().pushInbox(CUSTOMER_STEPS[o.step][2], `${o.no} · ${label}`, sub);
    if (orderNotif && !opts.quiet) toast(label, `${o.no} · ${sub}`, CUSTOMER_STEPS[o.step][2], { label: 'Track', href: `/track/${o.no}` });
  }
}

/** The customer's own orders. Returns the ones whose step, payment or rider changed. */
export async function syncOrders(opts: { quiet?: boolean } = {}): Promise<Order[]> {
  if (!signedIn()) return [];
  try {
    const orders = await api.get<Order[]>('/v1/orders');
    const before = new Map(useApp.getState().orders.map((o) => [o.id, o]));
    const changed = useApp.getState().mergeOrders(orders);
    announce(changed, before, opts);
    return changed;
  } catch (e) {
    if (!(e instanceof ApiError && e.offline)) console.warn('[sync] orders', e);
    return [];
  }
}

/** One order, fresh from the server (the tracking screen polls this). */
export async function syncOrder(id: string, opts: { quiet?: boolean } = {}): Promise<Order | null> {
  if (!signedIn()) return null;
  try {
    const order = await api.get<Order>(`/v1/orders/${encodeURIComponent(id)}`);
    const before = new Map(useApp.getState().orders.map((o) => [o.id, o]));
    announce(useApp.getState().mergeOrders([order]), before, opts);
    return order;
  } catch {
    return null;
  }
}

/** The customer's own reservations (kept beside everyone else's while the console has them loaded). */
export async function syncBookings(): Promise<void> {
  if (!signedIn()) return;
  try {
    const mine = await api.get<Booking[]>('/v1/bookings');
    const ids = new Set(mine.map((b) => b.id));
    useApp.setState((s) => ({ bookings: [...s.bookings.filter((b) => !ids.has(b.id) && !b.mine), ...mine.map((b) => ({ ...b, mine: true }))] }));
  } catch (e) {
    if (!(e instanceof ApiError && e.offline)) console.warn('[sync] bookings', e);
  }
}

/** Everything the customer side needs after sign-in or coming back to the app. */
export async function syncAccount(): Promise<void> {
  await syncMe();
  await Promise.all([syncOrders({ quiet: true }), syncBookings()]);
}

/* ------------------------------------------------------------------ restaurant console */

/** An order the kitchen should see: paid, cash, or being paid — not an abandoned card checkout. */
export const inKitchen = (o: Pick<Order, 'payment'>) => ['due', 'paid'].includes(o.payment.status);

/** The live board: every order and today's reservations onwards. Returns new tickets. */
export async function syncAdminLive(): Promise<Order[]> {
  const uid = useSession.getState().user?.uid;
  const [orders, bookings] = await Promise.all([
    api.get<Order[]>('/v1/admin/orders?limit=300'),
    api.get<Booking[]>(`/v1/admin/bookings?from=${restaurantDate(Date.now())}`),
  ]);
  const known = new Map(useApp.getState().orders.map((o) => [o.id, o]));
  const arrived = orders.filter((o) => inKitchen(o) && o.stage === 'placed' && (!known.has(o.id) || !inKitchen(known.get(o.id)!)));
  useApp.getState().mergeOrders(orders);
  useApp.setState((s) => ({
    bookings: [...bookings.map((b) => ({ ...b, mine: !!uid && b.uid === uid })), ...s.bookings.filter((b) => b.mine && !bookings.some((x) => x.id === b.id))],
  }));
  return arrived;
}

/** Everything the console shows. */
export async function syncAdmin(): Promise<void> {
  const first = useSync.getState().admin !== 'ready';
  if (first) useSync.setState({ admin: 'loading', adminError: null });
  try {
    const [reviews, customers] = await Promise.all([
      api.get<Review[]>('/v1/admin/reviews'),
      api.get<Customer[]>('/v1/admin/customers'),
      syncAdminLive(),
      syncCatalog({ force: true }),
    ]);
    useApp.setState({ reviews, customers });
    useSync.setState({ admin: 'ready', adminError: null });
  } catch (e) {
    useSync.setState({ admin: first ? 'error' : 'ready', adminError: errorMessage(e) });
  }
}

/* ------------------------------------------------------------------ hooks */

/**
 * Keeps the device in step with the server: the catalog on launch, every minute while the app is open
 * and on coming back to it; the account (role, points, orders, bookings) on sign-in and coming back; the
 * role every 15 seconds while signed in, so a change made in the console reaches this person quickly.
 */
export function useServerSync() {
  const uid = useSession((s) => s.user?.uid);
  const ready = useSession((s) => s.ready);

  useEffect(() => {
    void syncCatalog();
    const every = setInterval(() => {
      if (AppState.currentState === 'active') void syncCatalog();
    }, 60_000);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void syncCatalog();
      void syncAccount();
    });
    return () => {
      clearInterval(every);
      sub.remove();
    };
  }, []);

  // once Firebase has restored (or made) the session: this account's data, then the right catalog
  useEffect(() => {
    if (!ready || !uid) return;
    void syncAccount().then(() => syncCatalog());
    const every = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      void syncMe();
    }, 15_000);
    return () => clearInterval(every);
  }, [ready, uid]);
}

/** While a customer has an order on its way, its progress refreshes every 10 seconds (anywhere in the app). */
export function useActiveOrderSync() {
  const uid = useSession((s) => s.user?.uid);
  const live = useApp((s) => !!uid && s.orders.some((o) => o.uid === uid && o.step < 3 && inKitchen(o)));
  const path = usePathname();
  const inConsole = path.startsWith('/admin') || path.startsWith('/staff');
  useEffect(() => {
    if (!live || inConsole) return;
    const id = setInterval(() => {
      if (AppState.currentState === 'active') void syncOrders();
    }, 10_000);
    return () => clearInterval(id);
  }, [live, inConsole]);
}

/** The tracking screen: this order every 5 seconds. */
export function useTrackOrder(id: string | undefined, on: boolean) {
  useEffect(() => {
    if (!id || !on) return;
    void syncOrder(id, { quiet: true });
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void syncOrder(id, { quiet: true });
    }, 5000);
    return () => clearInterval(t);
  }, [id, on]);
}

/**
 * While the console is open: loads everything, then refreshes the order board and reservations every
 * five seconds and calls out new tickets.
 */
export function useAdminSync(on: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (!on) return;
    first.current = true;
    void syncAdmin();
    let busy = false;
    const id = setInterval(async () => {
      if (busy || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const arrived = await syncAdminLive();
        if (arrived.length && !first.current) {
          const names = arrived.map((o) => `${o.no} · ${o.customer.name}`).join(', ');
          toast(arrived.length > 1 ? `${arrived.length} new orders` : 'New order', names, 'receipt_long', { label: 'Open', href: '/admin/orders' });
        }
        first.current = false;
      } catch {
        // offline for a moment: the next tick retries
      } finally {
        busy = false;
      }
    }, 5000);
    return () => clearInterval(id);
  }, [on]);
}

export { stepOfStage };
