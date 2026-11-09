import { z } from 'zod';

/* ---------- roles ---------- */

/**
 * Everyone who signs in is a `user` (a customer) until an admin gives them a staff role.
 *  - admin:      the whole restaurant: menu, settings, users and roles, every order, the kitchen display
 *  - callcenter: calls the customer, checks the address and confirms (or cancels) new orders
 *  - packer:     packs confirmed orders, ticking each item off
 *  - warehouse:  hands packed orders to a delivery rider (or to the customer, for pickup)
 *  - delivery:   picks up the orders assigned to them and delivers them, collecting cash on delivery
 */
export const Role = z.enum(['admin', 'callcenter', 'packer', 'warehouse', 'delivery', 'user']);
export type Role = z.infer<typeof Role>;

export const STAFF_ROLES = ['admin', 'callcenter', 'packer', 'warehouse', 'delivery'] as const satisfies readonly Role[];
export type StaffRole = (typeof STAFF_ROLES)[number];
export const isStaff = (role: Role | null | undefined): role is StaffRole => !!role && role !== 'user';

export const ROLE_INFO: Record<Role, { label: string; desc: string; icon: string }> = {
  admin: { label: 'Admin', desc: 'Full control: menu, settings, users and every order', icon: 'shield' },
  callcenter: { label: 'Front of house', desc: 'Calls guests, fixes their details and confirms new orders', icon: 'support_agent' },
  packer: { label: 'Kitchen', desc: 'Cooks confirmed orders and bags them, item by item', icon: 'skillet' },
  warehouse: { label: 'Dispatch', desc: 'Hands ready orders to couriers and pickups to guests', icon: 'room_service' },
  delivery: { label: 'Courier', desc: 'Picks up and delivers their own orders', icon: 'two_wheeler' },
  user: { label: 'Customer', desc: 'Orders food, books tables, earns rewards', icon: 'person' },
};

/* ---------- order fulfilment ---------- */

/** Where an order is in the restaurant. `step` on the order is the customer's simpler view of this. */
export const OrderStage = z.enum(['placed', 'confirmed', 'packed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled']);
export type OrderStage = z.infer<typeof OrderStage>;

export const STAGE_LABEL: Record<OrderStage, string> = {
  placed: 'New',
  confirmed: 'Confirmed',
  packed: 'Ready',
  assigned: 'Courier assigned',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** 0 New · 1 Preparing · 2 On the way (Ready for pickup) · 3 Delivered · 4 Cancelled — Fig's `OrderStep`. */
export type OrderStep = 0 | 1 | 2 | 3 | 4;

/** The labels the console shows for each step (the local app's STATUS list). */
export const STEP_LABEL = ['New', 'Preparing', 'On the way', 'Delivered', 'Cancelled'] as const;

export type FulfilMode = 'delivery' | 'pickup';

/**
 * The customer's tracking step for a fulfilment stage:
 * placed → 0 New · confirmed, packed → 1 Preparing · assigned, out_for_delivery → 2 On the way ·
 * delivered → 3 · cancelled → 4. A packed pickup order is ready at the counter, so it shows as 2
 * (the app labels step 2 "Ready for pickup" for pickup orders).
 */
export function stepOfStage(stage: OrderStage, mode: FulfilMode): OrderStep {
  switch (stage) {
    case 'placed':
      return 0;
    case 'confirmed':
      return 1;
    case 'packed':
      return mode === 'pickup' ? 2 : 1;
    case 'assigned':
    case 'out_for_delivery':
      return 2;
    case 'delivered':
      return 3;
    case 'cancelled':
      return 4;
  }
}

export type StageMove = {
  to: OrderStage;
  /** button text */
  label: string;
  /** needs a rider picked */
  rider?: boolean;
  /** irreversible — ask twice */
  danger?: boolean;
};

type MoveRule = StageMove & { from: OrderStage[]; roles: StaffRole[]; mode?: FulfilMode; ownRider?: boolean };

/**
 * Who may move an order where. The server enforces this table inside a transaction; the app uses it to
 * show each staff member only the buttons they can press. Admins can make any move.
 */
const RULES: MoveRule[] = [
  { from: ['placed'], to: 'confirmed', label: 'Confirm order', roles: ['callcenter'] },
  { from: ['confirmed'], to: 'packed', label: 'Mark ready', roles: ['packer'] },
  { from: ['packed'], to: 'assigned', label: 'Assign courier', rider: true, roles: ['warehouse'], mode: 'delivery' },
  { from: ['assigned'], to: 'assigned', label: 'Reassign courier', rider: true, roles: ['warehouse'], mode: 'delivery' },
  { from: ['packed'], to: 'delivered', label: 'Handed to customer', roles: ['warehouse', 'callcenter'], mode: 'pickup' },
  { from: ['assigned'], to: 'out_for_delivery', label: 'Picked up', roles: ['delivery'], ownRider: true },
  { from: ['out_for_delivery'], to: 'delivered', label: 'Delivered', roles: ['delivery'], ownRider: true },
  { from: ['placed', 'confirmed'], to: 'cancelled', label: 'Cancel order', danger: true, roles: ['callcenter'] },
  { from: ['packed', 'assigned', 'out_for_delivery'], to: 'cancelled', label: 'Cancel order', danger: true, roles: [] },
];

export type MoveContext = {
  stage: OrderStage;
  mode: FulfilMode;
  /** rider uid on the order, if any */
  riderUid: string | null;
};

/** The moves `role` (signed in as `uid`) can make on an order right now, in button order. */
export function movesFor(order: MoveContext, role: Role, uid: string): StageMove[] {
  if (!isStaff(role)) return [];
  return RULES.filter(
    (r) =>
      r.from.includes(order.stage) &&
      (!r.mode || r.mode === order.mode) &&
      (role === 'admin' || (r.roles.includes(role) && (!r.ownRider || order.riderUid === uid))),
  ).map(({ to, label, rider, danger }) => ({ to, label, ...(rider ? { rider } : {}), ...(danger ? { danger } : {}) }));
}

export const canMove = (order: MoveContext, role: Role, uid: string, to: OrderStage) => movesFor(order, role, uid).some((m) => m.to === to);

/**
 * The next stage on the happy path — what the console's one-tap "Advance" does (Fig's advanceOrder).
 * null once the order is delivered or cancelled.
 */
export function nextStage(stage: OrderStage, mode: FulfilMode): OrderStage | null {
  switch (stage) {
    case 'placed':
      return 'confirmed';
    case 'confirmed':
      return 'packed';
    case 'packed':
      return mode === 'pickup' ? 'delivered' : 'assigned';
    case 'assigned':
      return 'out_for_delivery';
    case 'out_for_delivery':
      return 'delivered';
    default:
      return null;
  }
}

/** Orders each role works on: the stages that land in their queue. */
export const QUEUE: Record<StaffRole, OrderStage[]> = {
  admin: ['placed', 'confirmed', 'packed', 'assigned', 'out_for_delivery'],
  callcenter: ['placed', 'confirmed'],
  packer: ['confirmed'],
  warehouse: ['packed', 'assigned'],
  delivery: ['assigned', 'out_for_delivery'],
};

/* ---------- kitchen display ---------- */

export type KitchenState = {
  /** the kitchen started cooking (Fig's fireTicket) */
  fired: boolean;
  /** epoch ms, when fired */
  firedAt: number | null;
  /** indexes of the order's items the line has ticked off (Fig's toggleKDone) */
  done: number[];
};

/**
 * Which kitchen-display tab an order belongs on: 0 "New tickets" (placed, or confirmed but not fired
 * yet), 1 "On the line" (fired, not packed yet), or null once it has left the kitchen.
 */
export function kitchenTab(o: { stage: OrderStage; kitchen: Pick<KitchenState, 'fired'> }): 0 | 1 | null {
  if (o.stage === 'placed' || (o.stage === 'confirmed' && !o.kitchen.fired)) return 0;
  if (o.stage === 'confirmed' && o.kitchen.fired) return 1;
  return null;
}

/** Minutes a ticket has been waiting: since it was fired, or since the order was placed. */
export const ticketMinutes = (o: { placedAt: number; kitchen: Pick<KitchenState, 'firedAt'> }, now: number) =>
  Math.max(0, Math.floor((now - (o.kitchen.firedAt ?? o.placedAt)) / 60_000));
