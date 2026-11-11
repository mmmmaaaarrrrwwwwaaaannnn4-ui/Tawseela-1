import {
  CreateOrder,
  ISSUE_CREDIT,
  ISSUE_TYPES,
  MIN_CARD_TOTAL,
  Order,
  OrderStage,
  POINTS,
  Dish,
  STAGE_LABEL,
  canMove,
  computeTotals,
  isStaff,
  lineMeta,
  lineUnit,
  round2,
  settleLine,
  stepOfStage,
  toCents,
  type AdvanceOrder,
  type CartLine,
  type IssueResult,
  type Me,
  type OrderContactPatch,
  type OrderEvent,
  type OrderItem,
  type Order as OrderT,
  type PayMethod,
  type Role,
  type StoreSettings,
  type Voucher,
} from '@fig/shared';
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { z } from 'zod';

import { COL, homeRef, orderCounterRef, storeRef } from '../../lib/collections';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import type { AuthUser } from '../../plugins/auth';
import { readDeal, readStore } from '../catalog/service';
import { award, readUserTx, userRef } from '../me/service';

/** A validated order request (defaults filled in). */
export type CreateOrderInput = z.output<typeof CreateOrder>;

export const orderRef = (db: Firestore, id: string) => db.collection(COL.orders).doc(id);

/** Firestore document → API order. Throws if the document is malformed. */
export function toOrder(snap: DocumentSnapshot): OrderT {
  return Order.parse(normalize(snap.id, snap.data() ?? {}));
}

/** Fills fields older documents may lack, and derives the customer's step from the stage. */
function normalize(id: string, d: Record<string, unknown>) {
  const stage = OrderStage.safeParse(d.stage).data ?? 'placed';
  const mode = d.mode === 'pickup' ? 'pickup' : 'delivery';
  return {
    rider: null,
    timeline: [],
    credit: 0,
    kitchen: { fired: false, firedAt: null, done: [] },
    ...d,
    id,
    no: typeof d.no === 'string' ? d.no : id,
    stage,
    step: stepOfStage(stage, mode),
  };
}

/** Like toOrder, but skips (and doesn't throw on) malformed documents. */
export const safeOrder = (snap: DocumentSnapshot): OrderT[] => {
  const r = Order.safeParse(normalize(snap.id, snap.data() ?? {}));
  return r.success ? [r.data] : [];
};

/** Paid, or cash: the order is real and the restaurant works on it. Unpaid card checkouts are not. */
export const inKitchen = (o: Pick<OrderT, 'payment'>) => ['due', 'paid'].includes(o.payment.status);

export type Actor = { uid: string; name: string; role: Role };
export const event = (stage: OrderStage, at: number, by: Actor | null, note?: string): OrderEvent => ({
  stage,
  at,
  by: by ? { uid: by.uid, name: by.name, role: by.role } : null,
  ...(note ? { note } : {}),
});

/** The first order number when the counter has never been set (the seed's orders end at EK-4821). */
export const FIRST_ORDER_NO = 4822;

type Priced = {
  items: OrderItem[];
  totals: ReturnType<typeof computeTotals>;
  promo: string | null;
  usedVouchers: Voucher[];
  store: StoreSettings;
};

/**
 * Prices an order from the catalog as it is right now, inside the transaction that creates it, with
 * the shared pricing rules the app uses. Every reason an order can't go ahead (closed kitchen, sold-out
 * dish, expired promo, used voucher, a total that no longer adds up) becomes a 409 the app can show as-is.
 */
async function priceOrder(tx: Transaction, db: Firestore, input: CreateOrderInput, me: Me): Promise<Priced> {
  const ids = [...new Set(input.items.map((l) => l.id))];
  const [storeSnap, homeSnap, categorySnap, brandSnap, promoSnap, ...dishSnaps] = await Promise.all([
    tx.get(storeRef(db)),
    tx.get(homeRef(db)),
    tx.get(db.collection(COL.categories)),
    tx.get(db.collection(COL.brands)),
    input.promo ? tx.get(db.collection(COL.promos).doc(input.promo.trim().toUpperCase() || '-')) : Promise.resolve(null),
    ...ids.map((id) => tx.get(db.collection(COL.dishes).doc(id))),
  ]);
  const store = readStore(storeSnap.data());
  if (!store.open) throw conflict('store_closed', 'The kitchen is closed right now. Ordering reopens at 11:00 AM.');
  const deal = readDeal(homeSnap.data());
  const offCats = new Set(categorySnap.docs.filter((d) => d.get('on') === false).map((d) => d.get('name') as string));
  const offBrands = new Set(brandSnap.docs.filter((d) => d.get('on') === false).map((d) => d.id));

  const dishes = new Map<string, Dish>();
  for (const snap of dishSnaps) {
    const p = Dish.safeParse({ id: snap.id, ...snap.data() });
    if (p.success) dishes.set(snap.id, p.data);
  }

  const vouchers = [...me.vouchers];
  const usedVouchers: Voucher[] = [];
  const settled: CartLine[] = [];
  const items: OrderItem[] = input.items.map((line) => {
    const p = dishes.get(line.id);
    if (!p) throw conflict('item_unavailable', 'Something in your cart is no longer on the menu.', { id: line.id });
    if (!p.avail || offCats.has(p.cat) || offBrands.has(p.brand)) throw conflict('item_unavailable', `${p.name} is sold out right now.`, { id: p.id });
    if (line.voucher) {
      const i = vouchers.findIndex((v) => v.id === line.voucher && v.dish === line.id && v.s === line.s);
      if (i < 0 || line.q !== 1 || line.ex.length) throw conflict('voucher_invalid', 'That reward has already been used.', { id: p.id });
      usedVouchers.push(vouchers.splice(i, 1)[0]);
    }
    const s = settleLine(line, deal);
    settled.push(s);
    return { ...s, name: p.name, meta: lineMeta(s, p), unit: lineUnit(s, p) };
  });

  let promoPct: number | null = null;
  let promo: string | null = null;
  if (input.promo) {
    if (!promoSnap?.exists || promoSnap.get('on') !== true) throw conflict('promo_invalid', `${input.promo.toUpperCase()} isn’t active any more.`);
    promoPct = promoSnap.get('pct') as number;
    promo = promoSnap.id;
  }

  const totals = computeTotals({
    cart: settled,
    dishOf: (id) => dishes.get(id)!,
    mode: input.mode,
    speed: input.speed,
    fee: store.fee,
    freeAt: store.freeAt,
    promo: promoPct ? { pct: promoPct } : null,
    credit: input.useCredit ? me.credit : 0,
  });
  if (Math.abs(toCents(totals.total) - toCents(input.expectedTotal)) > 1) {
    throw conflict('price_changed', 'Prices changed since you opened your cart. Check the new total and try again.', { total: round2(totals.total) });
  }
  return { items, totals, promo, usedVouchers, store };
}

const DEFAULT_LABEL: Record<PayMethod, string> = { cash: 'Cash', card: 'Card', apple_pay: 'Apple Pay', google_pay: 'Google Pay', wallet: 'Mobile Wallet' };

export type CreatedOrder = { order: OrderT; replay: boolean };

/**
 * Creates the order in one transaction: honours the Idempotency-Key, re-prices the cart, takes the next
 * order number (which is also the document id), spends vouchers, credit and the promo, and — for cash
 * — awards the points. Card and wallet orders wait for Kashier; the webhook or the sync call marks them paid.
 */
export async function createOrder(
  db: Firestore,
  user: AuthUser,
  input: CreateOrderInput,
  opts: { now: number; idempotencyKey?: string; live: boolean },
): Promise<CreatedOrder> {
  if (input.mode === 'delivery' && !input.address) throw badRequest('Add a delivery address.');
  const idemRef = opts.idempotencyKey ? db.collection(COL.idempotency).doc(`${user.uid}:${opts.idempotencyKey}`) : null;

  return db.runTransaction(async (tx) => {
    // a retry of a request we already handled: the same order
    const seen = idemRef ? await tx.get(idemRef) : null;
    if (seen?.exists) {
      const prior = await tx.get(orderRef(db, seen.get('orderId') as string));
      if (prior.exists) return { order: toOrder(prior), replay: true };
    }
    const { me, create } = await readUserTx(tx, db, user);
    const counter = await tx.get(orderCounterRef(db));
    const priced = await priceOrder(tx, db, input, me);
    const { totals } = priced;

    const free = toCents(totals.total) === 0;
    if (input.method !== 'cash' && !free && totals.total < MIN_CARD_TOTAL) {
      throw new AppError(400, 'amount_too_small', 'Online payments need at least 0.01 EGP — pay cash for this order.');
    }
    const status = free ? 'paid' : input.method === 'cash' ? 'due' : 'awaiting_payment';
    const kitchen = status !== 'awaiting_payment';
    const next = (counter.get('next') as number | undefined) ?? FIRST_ORDER_NO;
    const no = `EK-${next}`;
    const phone = input.address?.phone?.trim() || me.phone || null;
    const doc = {
      no,
      uid: user.uid,
      customer: { name: me.name, email: me.email, phone },
      placedAt: opts.now,
      step: 0 as const,
      stage: 'placed' as const,
      rider: null,
      timeline: [event('placed', opts.now, { uid: user.uid, name: me.name, role: user.role })],
      items: priced.items,
      subtotal: round2(totals.sub),
      fee: totals.fee,
      speedFee: totals.speedFee,
      discount: round2(totals.disc),
      credit: round2(totals.credit),
      total: round2(totals.total),
      mode: input.mode,
      speed: input.mode === 'pickup' ? 0 : input.speed,
      address: input.mode === 'pickup' ? null : input.address,
      note: input.note.trim(),
      promo: priced.promo,
      pay: free ? (totals.credit ? 'Fig credit' : 'Fig Rewards') : input.payLabel?.trim() || DEFAULT_LABEL[input.method],
      payment: { method: input.method, status },
      kitchen: { fired: false, firedAt: null, done: [] },
      // the demo kitchen starts on cash orders now, and on card orders once Kashier confirms payment
      live: kitchen && opts.live,
      pointsAwarded: kitchen,
      vouchersUsed: priced.usedVouchers,
      kitchenAt: opts.now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    create();
    tx.set(orderCounterRef(db), { next: next + 1 }, { merge: true });
    tx.create(orderRef(db, no), doc);
    // expiresAt: a Firestore TTL policy (firestore.indexes.json) deletes the key a week later
    if (idemRef) tx.set(idemRef, { orderId: no, uid: user.uid, at: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(opts.now + 7 * 86_400_000) });
    if (priced.promo) tx.update(db.collection(COL.promos).doc(priced.promo), { used: FieldValue.increment(1) });
    if (priced.usedVouchers.length) tx.update(userRef(db, user.uid), { vouchers: FieldValue.arrayRemove(...priced.usedVouchers) });
    if (doc.credit) award(tx, db, user.uid, 0, -doc.credit);
    if (kitchen) award(tx, db, user.uid, Math.floor(totals.sub) * POINTS.perDollar);
    return { order: Order.parse({ id: no, ...doc }), replay: false };
  });
}

/** The customer's own order — or any order, for restaurant staff. */
export async function getOrderFor(db: Firestore, user: Pick<AuthUser, 'uid' | 'role'>, id: string): Promise<OrderT> {
  const snap = await orderRef(db, id).get();
  if (!snap.exists || (snap.get('uid') !== user.uid && !isStaff(user.role))) throw notFound('That order');
  return toOrder(snap);
}

/** Newest first: one customer's orders (composite index uid + placedAt), or everyone's. */
export async function listOrders(db: Firestore, opts: { uid?: string; limit: number }): Promise<OrderT[]> {
  const q = opts.uid
    ? db.collection(COL.orders).where('uid', '==', opts.uid).orderBy('placedAt', 'desc')
    : db.collection(COL.orders).orderBy('placedAt', 'desc');
  return (await q.limit(opts.limit).get()).docs.flatMap(safeOrder);
}

/** Gives back what a cancelled order spent: Fig credit and reward vouchers. */
function restoreSpend(tx: Transaction, db: Firestore, snap: DocumentSnapshot) {
  if (snap.get('spendRestored') === true) return {};
  const credit = (snap.get('credit') as number | undefined) ?? 0;
  const vouchers = (snap.get('vouchersUsed') as Voucher[] | undefined) ?? [];
  if (credit > 0) award(tx, db, snap.get('uid') as string, 0, credit);
  if (vouchers.length) tx.set(userRef(db, snap.get('uid') as string), { vouchers: FieldValue.arrayUnion(...vouchers) }, { merge: true });
  return { spendRestored: true };
}

/**
 * Moves an order to another stage, as `actor` (staff), or as the demo kitchen (`actor` null). Who may
 * make which move is the shared table in roles.ts; it is re-checked inside the transaction so two staff
 * members can't both act on the same order. Assigning takes a delivery rider; a cash order delivered is
 * marked paid (the rider collected it); a cancelled order gives back its credit and vouchers.
 */
export async function advanceOrder(
  db: Firestore,
  id: string,
  input: AdvanceOrder,
  actor: Actor | null,
  now: number,
  opts: { fire?: boolean } = {},
): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('That order');
    const order = toOrder(snap);
    const rider = input.to === 'assigned' ? await readRider(tx, db, input.riderUid) : null;

    if (actor && !canMove({ stage: order.stage, mode: order.mode, riderUid: order.rider?.uid ?? null }, actor.role, actor.uid, input.to)) {
      if (order.stage === 'cancelled') throw conflict('order_cancelled', 'This order was cancelled.');
      if (order.stage === 'delivered') throw conflict('order_delivered', 'This order was already delivered.');
      throw conflict('move_not_allowed', `This order is ${STAGE_LABEL[order.stage].toLowerCase()} — you can’t mark it ${STAGE_LABEL[input.to].toLowerCase()}.`);
    }
    if (!actor && order.stage === input.to && input.to !== 'assigned') return;
    if (!inKitchen(order) && input.to !== 'cancelled') throw conflict('not_paid', 'This order hasn’t been paid yet.');

    const cancelled = input.to === 'cancelled';
    const collected = input.to === 'delivered' && order.payment.method === 'cash' && order.payment.status === 'due';
    // a ticket reaches the bag through the kitchen: packing (or the demo kitchen confirming) fires it
    const fire = !order.kitchen.fired && (input.to === 'packed' || opts.fire);
    tx.update(ref, {
      stage: input.to,
      step: stepOfStage(input.to, order.mode),
      ...(rider ? { rider } : {}),
      timeline: FieldValue.arrayUnion(event(input.to, now, actor, input.note?.trim() || (rider ? `Rider: ${rider.name}` : undefined))),
      ...(collected ? { 'payment.status': 'paid', 'payment.collectedAt': now } : {}),
      ...(cancelled && order.payment.status === 'awaiting_payment' ? { 'payment.status': 'canceled' } : {}),
      ...(cancelled ? restoreSpend(tx, db, snap) : {}),
      ...(fire ? { 'kitchen.fired': true, 'kitchen.firedAt': now } : {}),
      // staff took over from the demo kitchen
      ...(actor || input.to === 'delivered' || cancelled ? { live: false } : {}),
      kitchenAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return toOrder(await ref.get());
}

/** A rider must be an active account with the delivery role (or the demo kitchen's own rider). */
async function readRider(tx: Transaction, db: Firestore, uid: string | undefined) {
  if (!uid) throw badRequest('Pick a courier to assign.');
  if (uid === DEMO_RIDER.uid) return DEMO_RIDER;
  const snap = await tx.get(userRef(db, uid));
  if (!snap.exists || snap.get('role') !== 'delivery' || snap.get('disabled') === true) {
    throw conflict('rider_unavailable', 'That person isn’t an active delivery rider.');
  }
  return { uid, name: (snap.get('name') as string) || 'Rider', phone: (snap.get('phone') as string | null) ?? null };
}

/** Active riders with how many orders each is carrying, least busy first. */
export async function ridersWithLoad(db: Firestore) {
  const [riders, onRoad] = await Promise.all([
    db.collection(COL.users).where('role', '==', 'delivery').get(),
    db.collection(COL.orders).where('stage', 'in', ['assigned', 'out_for_delivery']).get(),
  ]);
  const load = new Map<string, number>();
  for (const d of onRoad.docs) {
    const uid = d.get('rider.uid') as string | undefined;
    if (uid) load.set(uid, (load.get(uid) ?? 0) + 1);
  }
  return riders.docs
    .filter((d) => d.get('disabled') !== true)
    .map((d) => ({ uid: d.id, name: (d.get('name') as string) || 'Rider', phone: (d.get('phone') as string | null) ?? null, active: load.get(d.id) ?? 0 }))
    .sort((a, b) => a.active - b.active || a.name.localeCompare(b.name));
}

/** The call center corrects the delivery address, phone or note — until the order is packed. */
export async function updateOrderContact(db: Firestore, id: string, patch: OrderContactPatch, actor: Actor, now: number): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('That order');
    const order = toOrder(snap);
    if (order.stage !== 'placed' && order.stage !== 'confirmed') throw conflict('order_packed', 'This order is already packed — the address can’t change now.');
    if (patch.address && order.mode === 'pickup') throw badRequest('Pickup orders have no delivery address.');
    tx.update(ref, {
      ...(patch.address ? { address: { ...patch.address, note: patch.address.note.trim() } } : {}),
      ...(patch.phone !== undefined ? { 'customer.phone': patch.phone || null } : {}),
      ...(patch.note !== undefined ? { note: patch.note.trim() } : {}),
      timeline: FieldValue.arrayUnion(event(order.stage, now, actor, 'Contact details updated')),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return toOrder(await ref.get());
}

/**
 * The kitchen display's one button (Fig's fireTicket): a new ticket is accepted and fired (placed →
 * confirmed, the ticket clock starts); a confirmed ticket not yet fired is fired; a fired ticket is
 * ready and goes to the bag (confirmed → packed).
 */
export async function fireTicket(db: Firestore, id: string, actor: Actor, now: number): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('That order');
    const order = toOrder(snap);
    if (order.stage !== 'placed' && order.stage !== 'confirmed') throw conflict('not_in_kitchen', 'This ticket has already left the kitchen.');
    if (!inKitchen(order)) throw conflict('not_paid', 'This order hasn’t been paid yet.');
    const ready = order.stage === 'confirmed' && order.kitchen.fired;
    const to: OrderStage = ready ? 'packed' : 'confirmed';
    tx.update(ref, {
      stage: to,
      step: stepOfStage(to, order.mode),
      timeline: FieldValue.arrayUnion(event(to, now, actor, ready ? 'Ready from the kitchen' : 'Ticket fired')),
      ...(ready ? {} : { 'kitchen.fired': true, 'kitchen.firedAt': now }),
      live: false,
      kitchenAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return toOrder(await ref.get());
}

/** Ticks one item off on the kitchen display / packer's checklist (Fig's toggleKDone), or sets it. */
export async function setItemDone(db: Firestore, id: string, index: number, done: boolean | undefined): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound('That order');
    const order = toOrder(snap);
    if (index >= order.items.length) throw badRequest(`This order has ${order.items.length} items.`);
    if (order.stage !== 'placed' && order.stage !== 'confirmed') throw conflict('not_in_kitchen', 'This ticket has already left the kitchen.');
    const on = done ?? !order.kitchen.done.includes(index);
    const list = on ? [...new Set([...order.kitchen.done, index])].sort((a, b) => a - b) : order.kitchen.done.filter((k) => k !== index);
    tx.update(ref, { 'kitchen.done': list, updatedAt: FieldValue.serverTimestamp() });
  });
  return toOrder(await ref.get());
}

/** The rider the demo kitchen (and a one-tap console advance with no riders on the team) uses. */
export const DEMO_RIDER = { uid: 'demo-rider', name: 'Marco Rossi', phone: null };

const DEMO_NEXT: Partial<Record<OrderStage, (mode: 'delivery' | 'pickup') => OrderStage>> = {
  placed: () => 'confirmed',
  confirmed: () => 'packed',
  packed: (mode) => (mode === 'pickup' ? 'delivered' : 'assigned'),
  assigned: () => 'out_for_delivery',
  out_for_delivery: () => 'delivered',
};

/**
 * Demo kitchen (DEMO_KITCHEN_SECONDS): live orders move one stage at a time, as if the staff were
 * working them, until someone on the team acts on the order.
 */
export async function advanceLiveOrders(db: Firestore, now: number, everyMs: number): Promise<number> {
  const snap = await db.collection(COL.orders).where('live', '==', true).limit(50).get();
  let moved = 0;
  for (const d of snap.docs) {
    const order = safeOrder(d)[0];
    const at = (d.get('kitchenAt') as number | undefined) ?? 0;
    const to = order && DEMO_NEXT[order.stage]?.(order.mode);
    if (!order || !to || now - at < everyMs) continue;
    await advanceOrder(db, d.id, { to, ...(to === 'assigned' ? { riderUid: DEMO_RIDER.uid } : {}) }, null, now, { fire: to === 'confirmed' }).catch(() => {});
    moved++;
  }
  return moved;
}

/** Rates an order (and tips); the first rating earns points. The review reaches the console. */
export async function rateOrder(
  db: Firestore,
  user: AuthUser,
  id: string,
  input: { stars: number; tags: string[]; text: string; tip: number },
  now: number,
): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('uid') !== user.uid) throw notFound('That order');
    const order = toOrder(snap);
    if (order.stage === 'cancelled') throw conflict('order_cancelled', 'This order was cancelled.');
    const { name, create } = await readUserTx(tx, db, user);
    const first = order.rated == null;
    create();
    tx.update(ref, { rated: input.stars, tip: input.tip, updatedAt: FieldValue.serverTimestamp() });
    tx.set(
      db.collection(COL.reviews).doc(`order-${id}`),
      {
        name,
        stars: input.stars,
        text: input.text.trim() || input.tags.join(' · ') || 'Great meal.',
        dish: order.items[0]?.name ?? 'Fig order',
        at: now,
        uid: user.uid,
        orderId: id,
        // a changed rating is a new review to answer
        replied: false,
        reply: null,
      },
      { merge: true },
    );
    if (first) award(tx, db, user.uid, POINTS.rating);
  });
  return toOrder(await ref.get());
}

/** Logs a problem; the first report on one of the customer's orders adds $5 Fig credit. */
export async function reportIssue(
  db: Firestore,
  user: AuthUser,
  orderId: string | null,
  input: { type: number; text: string },
  now: number,
): Promise<IssueResult> {
  return db.runTransaction(async (tx) => {
    const ref = orderId ? orderRef(db, orderId) : null;
    const snap = ref ? await tx.get(ref) : null;
    if (ref && (!snap?.exists || snap.get('uid') !== user.uid)) throw notFound('That order');
    const { me, create } = await readUserTx(tx, db, user);
    const credited = !!snap && snap.get('issueCredited') !== true;
    create();
    tx.set(db.collection(COL.issues).doc(), {
      orderId,
      uid: user.uid,
      name: me.name,
      type: input.type,
      label: ISSUE_TYPES[input.type] ?? 'Issue',
      text: input.text.trim(),
      credited,
      at: now,
    });
    if (credited) {
      tx.update(ref!, { issueCredited: true, updatedAt: FieldValue.serverTimestamp() });
      award(tx, db, user.uid, 0, ISSUE_CREDIT);
    }
    return { credited, credit: round2(me.credit + (credited ? ISSUE_CREDIT : 0)) };
  });
}

/**
 * The customer abandons an unpaid card checkout: the order is cancelled and its credit and vouchers
 * come back. Orders already in the kitchen can't be cancelled from the app.
 */
export async function cancelUnpaid(db: Firestore, user: AuthUser, id: string, now: number): Promise<OrderT> {
  const ref = orderRef(db, id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('uid') !== user.uid) throw notFound('That order');
    const order = toOrder(snap);
    if (order.stage === 'cancelled') return;
    if (inKitchen(order)) throw conflict('order_in_kitchen', 'The kitchen already has this order. Message us from the tracking screen to change it.');
    tx.update(ref, {
      stage: 'cancelled',
      step: 4,
      'payment.status': 'canceled',
      timeline: FieldValue.arrayUnion(event('cancelled', now, { uid: user.uid, name: order.customer.name, role: user.role }, 'Checkout abandoned')),
      ...restoreSpend(tx, db, snap),
      live: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return toOrder(await ref.get());
}
