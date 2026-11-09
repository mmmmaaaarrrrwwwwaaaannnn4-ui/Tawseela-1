import { create } from 'zustand';

import { useApp } from '@/store/app-store';

import { api, errorMessage } from './api';
import type { CreateUser, Role, UserPatch, UserRow } from './contract';
import type { LoadState } from './ops';

/** Users & roles (admin): every account, with its role. Not persisted — it loads when the screen opens. */
interface TeamState {
  users: UserRow[];
  state: LoadState;
  error: string | null;
}
export const useTeam = create<TeamState>(() => ({ users: [], state: 'idle', error: null }));

/** Role order on the screens: the team first, customers last. */
export const ROLE_ORDER: Role[] = ['admin', 'callcenter', 'packer', 'warehouse', 'delivery', 'user'];

export async function loadUsers(): Promise<void> {
  if (useTeam.getState().state !== 'ready') useTeam.setState({ state: 'loading', error: null });
  try {
    useTeam.setState({ users: await api.get<UserRow[]>('/v1/admin/users'), state: 'ready', error: null });
  } catch (e) {
    useTeam.setState((s) => ({ state: s.state === 'ready' ? 'ready' : 'error', error: errorMessage(e) }));
  }
}

const put = (u: UserRow) =>
  useTeam.setState((s) => ({ users: s.users.some((x) => x.uid === u.uid) ? s.users.map((x) => (x.uid === u.uid ? u : x)) : [u, ...s.users] }));

export async function createUser(input: CreateUser): Promise<UserRow | null> {
  try {
    const u = await api.post<UserRow>('/v1/admin/users', input);
    put(u);
    return u;
  } catch (e) {
    useApp.getState().showToast('Account not created', errorMessage(e), 'error');
    return null;
  }
}

/**
 * Renames, changes the role of, or disables an account. The list shows the change at once and rolls
 * back with the server's reason if it's refused.
 */
export async function updateUser(uid: string, patch: UserPatch): Promise<UserRow | null> {
  const prev = useTeam.getState().users.find((x) => x.uid === uid);
  if (prev) put({ ...prev, ...patch });
  try {
    const u = await api.patch<UserRow>(`/v1/admin/users/${encodeURIComponent(uid)}`, patch);
    // the update doesn't recount orders; keep the totals the list already has
    const merged = prev ? { ...u, orders: prev.orders, spent: prev.spent } : u;
    put(merged);
    return merged;
  } catch (e) {
    if (prev) put(prev);
    useApp.getState().showToast('Account not updated', errorMessage(e), 'error');
    return null;
  }
}
