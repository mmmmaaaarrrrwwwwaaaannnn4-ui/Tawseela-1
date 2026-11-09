import { useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import { create } from 'zustand';

import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';

import { api, errorMessage } from './api';
import { QUEUE, isStaff, movesFor, type AddressSnapshot, type OpsOrder, type OrderContactPatch, type OrderStage, type RiderLoad, type Role } from './contract';

/*
 * The restaurant team's work (/v1/ops): each staff role's queue, and the moves along
 * placed → confirmed → packed → assigned → out for delivery → delivered.
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

interface OpsState {
  orders: OpsOrder[];
  state: LoadState;
  error: string | null;
}

export const useOps = create<OpsState>(() => ({ orders: [], state: 'idle', error: null }));

const toast = (title: string, sub: string, icon: Parameters<ReturnType<typeof useApp.getState>['showToast']>[2]) =>
  useApp.getState().showToast(title, sub, icon);

const me = () => {
  const s = useSession.getState();
  return { role: s.role, uid: s.user?.uid ?? '' };
};

/** Is the order's next step the signed-in staff member's? (Being allowed to cancel it doesn't count.) */
export const needsMe = (o: OpsOrder, role: Role, uid: string) =>
  isStaff(role) &&
  QUEUE[role].includes(o.stage) &&
  movesFor({ stage: o.stage, mode: o.mode, riderUid: o.rider?.uid ?? null }, role, uid).some((m) => !m.danger);

/** Did the signed-in staff member move this order? */
export const movedByMe = (o: OpsOrder, uid: string) => o.timeline.some((e) => e.by?.uid === uid && e.stage !== 'placed');

export const itemCount = (o: OpsOrder) => o.items.reduce((a, l) => a + l.q, 0);
export const cashDue = (o: OpsOrder) => o.payment.method === 'cash' && o.payment.status === 'due';

/** Replaces the queue with the server's (orders a colleague moved out of it drop out). Returns new work for me. */
export async function syncOps(): Promise<OpsOrder[]> {
  if (useOps.getState().state !== 'ready') useOps.setState({ state: 'loading', error: null });
  try {
    const orders = await api.get<OpsOrder[]>('/v1/ops/orders');
    const before = new Set(useOps.getState().orders.map((o) => o.id));
    useOps.setState({ orders, state: 'ready', error: null });
    const { role, uid } = me();
    return orders.filter((o) => !before.has(o.id) && needsMe(o, role, uid));
  } catch (e) {
    useOps.setState((s) => ({ state: s.state === 'ready' ? 'ready' : 'error', error: errorMessage(e) }));
    return [];
  }
}

/** While a staff screen is open: load the queue, refresh it every few seconds, call out new work. */
export function useOpsSync(on: boolean) {
  const first = useRef(true);
  useEffect(() => {
    if (!on) return;
    first.current = true;
    let busy = false;
    const tick = async () => {
      if (busy || AppState.currentState !== 'active') return;
      busy = true;
      const arrived = await syncOps().finally(() => (busy = false));
      // the first load isn't news
      if (first.current) {
        first.current = false;
        return;
      }
      if (arrived.length) {
        toast(arrived.length > 1 ? `${arrived.length} new orders for you` : 'New order for you', arrived.map((o) => o.no).join(' · '), 'notifications');
      }
    };
    void tick();
    const id = setInterval(tick, 8000);
    return () => clearInterval(id);
  }, [on]);
}

/** Keeps the queue (and any open order screen) showing the server's copy. */
function applyOrder(order: OpsOrder) {
  useOps.setState((s) => ({ orders: s.orders.some((o) => o.id === order.id) ? s.orders.map((o) => (o.id === order.id ? order : o)) : [order, ...s.orders] }));
}

/** One order, for a link into the team screens when it isn't in the queue yet. */
export async function fetchOpsOrder(id: string): Promise<OpsOrder | null> {
  try {
    const o = await api.get<OpsOrder>(`/v1/ops/orders/${encodeURIComponent(id)}`);
    applyOrder(o);
    return o;
  } catch {
    return null;
  }
}

/** Moves an order on. Resolves with the updated order, or null after showing why it didn't work. */
export async function advanceOrder(order: OpsOrder, to: OrderStage, opts: { riderUid?: string; note?: string } = {}): Promise<OpsOrder | null> {
  try {
    const next = await api.post<OpsOrder>(`/v1/ops/orders/${encodeURIComponent(order.id)}/advance`, { to, ...opts });
    applyOrder(next);
    return next;
  } catch (e) {
    toast('Order not updated', errorMessage(e), 'error');
    // someone else may have moved it first
    void syncOps();
    return null;
  }
}

/** The call center corrects the address, phone or note before the order is packed. */
export async function saveOrderContact(order: OpsOrder, patch: OrderContactPatch): Promise<OpsOrder | null> {
  try {
    const next = await api.patch<OpsOrder>(`/v1/ops/orders/${encodeURIComponent(order.id)}/contact`, patch);
    applyOrder(next);
    return next;
  } catch (e) {
    toast('Details not saved', errorMessage(e), 'error');
    return null;
  }
}

/** Active delivery riders, least busy first. */
export async function fetchRiders(): Promise<RiderLoad[]> {
  try {
    const riders = await api.get<RiderLoad[]>('/v1/ops/riders');
    return [...riders].sort((a, b) => a.active - b.active || a.name.localeCompare(b.name));
  } catch (e) {
    toast('Couldn’t load couriers', errorMessage(e), 'error');
    return [];
  }
}

/**
 * Ticks an item in or out of the bag (the packer's checklist — the same flags the kitchen display shows).
 * Shows at once; rolls back with the server's reason if it's refused.
 */
export async function toggleItemDone(order: OpsOrder, index: number): Promise<void> {
  const done = !order.kitchen.done.includes(index);
  const optimistic = { ...order, kitchen: { ...order.kitchen, done: done ? [...order.kitchen.done, index] : order.kitchen.done.filter((x) => x !== index) } };
  applyOrder(optimistic);
  try {
    applyOrder(await api.post<OpsOrder>(`/v1/ops/orders/${encodeURIComponent(order.id)}/items/${index}/done`, { done }));
  } catch (e) {
    applyOrder(order);
    toast('Checklist not updated', errorMessage(e), 'error');
  }
}

/** Opens the phone (or Messages) app on a number. */
export const callNumber = (phone: string | null | undefined, via: 'tel' | 'sms' = 'tel') => {
  const digits = phone?.replace(/[^\d+]/g, '');
  if (!digits) {
    toast('No phone number', 'Add one to the order first', 'info');
    return;
  }
  void Linking.openURL(`${via}:${digits}`).catch(() =>
    toast(via === 'tel' ? 'Can’t place calls here' : 'Can’t send messages here', phone ?? '', via === 'tel' ? 'call' : 'chat'),
  );
};

/** Opens Maps on an address. */
export const openMaps = (address: AddressSnapshot | null) => {
  if (!address) return;
  const q = encodeURIComponent(`${address.l1}, ${address.l2}`);
  void Linking.openURL(process.env.EXPO_OS === 'ios' ? `http://maps.apple.com/?q=${q}` : `geo:0,0?q=${q}`).catch(() => undefined);
};
