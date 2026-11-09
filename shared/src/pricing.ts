import { ALL_EXTRAS, SPEEDS, sizesOf } from './menu';
import type { CartLine, Deal, Dish, FulfilmentMode } from './schemas';

/*
 * Pricing, shared by the app (what the customer sees) and the server (what is charged), so the two can
 * never disagree. unitOf, lineUnit, lineMeta and computeTotals are the local edition's
 * src/lib/pricing.ts, unchanged in arithmetic (test/parity.test.ts proves it); settleLine and the
 * credit option are what the server adds on top. Everything here is pure.
 */

type Priceable = Pick<Dish, 'price' | 'cat'>;

/** Unit price of a dish with a size index and selected extras. */
export function unitOf(dish: Priceable, sizeIndex: number, extras: readonly string[]): number {
  const sizes = sizesOf(dish.cat);
  const size = sizes[sizeIndex] ?? sizes[0];
  const ex = extras.reduce((a, id) => a + (ALL_EXTRAS.find((x) => x.id === id)?.price ?? 0), 0);
  return dish.price + size.delta + ex;
}

/** Unit price of a cart line, applying its deal / reward discount (`dealPct`). */
export function lineUnit(line: Pick<CartLine, 's' | 'ex' | 'deal' | 'dealPct'>, dish: Priceable): number {
  const base = unitOf(dish, line.s, line.ex);
  return line.deal ? base * (1 - (line.dealPct ?? 0) / 100) : base;
}

/** Human summary of a line's options, e.g. `12" · Calabrian chili oil`. */
export function lineMeta(line: Pick<CartLine, 's' | 'ex'>, dish: Pick<Dish, 'cat'>): string {
  const size = sizesOf(dish.cat)[line.s]?.label ?? '';
  const ex = line.ex.map((id) => ALL_EXTRAS.find((x) => x.id === id)?.label ?? '');
  return [size, ...ex].filter(Boolean).join(' · ');
}

/**
 * A cart line as the server prices it: a reward voucher is free (dealPct 100), a deal line gets
 * today's deal at today's percentage while the deal is on and is for this dish, and anything else is
 * full price. The app runs its cart through this whenever the catalog changes, so the total it shows
 * is the total the server will charge.
 */
export function settleLine<T extends CartLine>(line: T, deal: Deal | null | undefined): T {
  if (line.voucher) return { ...line, deal: true, dealPct: 100 };
  if (line.deal && deal?.on && deal.id === line.id) return { ...line, deal: true, dealPct: deal.pct };
  if (!line.deal && line.dealPct === undefined) return line;
  const { deal: _deal, dealPct: _pct, ...rest } = line;
  return rest as T;
}

export interface Totals {
  sub: number;
  count: number;
  fee: number;
  speedFee: number;
  /** promo discount */
  disc: number;
  /** Fig credit applied (0 unless `credit` was passed) */
  credit: number;
  /** total shown on the cart (excludes the priority fee and credit) */
  cartTotal: number;
  /** total charged at checkout */
  total: number;
}

export interface TotalsArgs {
  cart: CartLine[];
  dishOf: (id: string) => Priceable;
  mode: FulfilmentMode;
  speed: number;
  /** store delivery fee */
  fee: number;
  /** free delivery from this subtotal */
  freeAt: number;
  promo: { pct: number } | null;
  /** Fig credit available to spend on this order (omit or 0 to keep it) */
  credit?: number;
}

export function computeTotals(args: TotalsArgs): Totals {
  const { cart, dishOf, mode, speed, fee: baseFee, freeAt, promo } = args;
  const sub = cart.reduce((a, c) => a + lineUnit(c, dishOf(c.id)) * c.q, 0);
  const count = cart.reduce((a, c) => a + c.q, 0);
  const pickup = mode === 'pickup';
  // free delivery is judged on the subtotal before the promo comes off
  const fee = pickup || sub === 0 || sub >= freeAt ? 0 : baseFee;
  const speedFee = pickup ? 0 : (SPEEDS[speed]?.fee ?? 0);
  const disc = promo ? (sub * promo.pct) / 100 : 0;
  const due = sub + fee + speedFee - disc;
  // credit comes off last, never below zero, and only in whole cents
  const credit = args.credit && args.credit > 0 && due > 0 ? Math.min(round2(args.credit), round2(due)) : 0;
  return { sub, count, fee, speedFee, disc, credit, cartTotal: sub + fee - disc, total: credit ? Math.max(0, due - credit) : due };
}

/** Rounds to whole cents (what Kashier charges and the receipt shows). */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whole cents — the unit Kashier charges in. */
export const toCents = (n: number) => Math.round(n * 100);

/** Kashier's minimum supported order amount (EGP). */
export const MIN_CARD_TOTAL = 0.01;
