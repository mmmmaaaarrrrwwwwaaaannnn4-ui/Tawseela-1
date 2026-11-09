/*
 * FIXTURE — the local edition's pricing, copied verbatim so the parity test can price the same carts
 * both ways. Two parts, each byte-for-byte from the repo root (test/parity.test.ts checks this while
 * the root app is next door):
 *   1. the size and extra tables from src/data/menu.ts
 *   2. everything after the imports in src/lib/pricing.ts, minus its closing re-export of sizesOf/extrasOf
     (part 1 already exports them)
 * Only the import lines and these local type declarations are new. Do not edit by hand: re-copy.
 */
/* eslint-disable */

export interface SizeOption {
  label: string;
  delta: number;
}
export interface Extra {
  id: string;
  label: string;
  price: number;
}
export interface Dish {
  id: string;
  cat: string;
  price: number;
}
export interface CartLine {
  id: string;
  s: number;
  ex: string[];
  q: number;
  deal?: boolean;
  dealPct?: number;
}
export type FulfilmentMode = 'delivery' | 'pickup';
export interface AppliedPromo {
  code: string;
  pct: number;
}

/* ---- 1. src/data/menu.ts (size and extra tables) ---- */
const SIZES: Record<string, SizeOption[]> = {
  Pizza: [
    { label: '10"', delta: -2 },
    { label: '12"', delta: 0 },
    { label: '14"', delta: 3 },
  ],
  Desserts: [
    { label: 'Slice', delta: 0 },
    { label: 'Double', delta: 6.5 },
  ],
  _: [
    { label: 'Regular', delta: 0 },
    { label: 'Large', delta: 3 },
  ],
};

export const sizesOf = (cat: string): SizeOption[] => SIZES[cat] ?? SIZES._;

/** Pizza defaults to 12" (index 1); everything else to the first size. */
export const defaultSize = (cat: string): number => (cat === 'Pizza' ? 1 : 0);

const EXTRAS = {
  sweet: [
    { id: 'cream', label: 'Vanilla cream', price: 1.5 },
    { id: 'berry', label: 'Berry compote', price: 1.5 },
  ],
  savory: [
    { id: 'cheese', label: 'Extra cheese', price: 1.5 },
    { id: 'chili', label: 'Calabrian chili oil', price: 0.8 },
    { id: 'dip', label: 'Garlic dip', price: 1 },
    { id: 'side', label: 'Side of fries', price: 3.5 },
  ],
} satisfies Record<string, Extra[]>;

export const extrasOf = (cat: string): Extra[] => (cat === 'Desserts' ? EXTRAS.sweet : EXTRAS.savory);
export const ALL_EXTRAS: Extra[] = [...EXTRAS.sweet, ...EXTRAS.savory];

/* ---- 2. src/lib/pricing.ts (after its imports, without the closing re-export) ---- */
export const SPEEDS = [
  { t: 'Standard', s: '25–35 min', fee: 0 },
  { t: 'Priority', s: '15–20 min', fee: 1.99 },
] as const;

/** Unit price of a dish with a size index and selected extras. */
export function unitOf(dish: Dish, sizeIndex: number, extras: string[]): number {
  const sizes = sizesOf(dish.cat);
  const size = sizes[sizeIndex] ?? sizes[0];
  const ex = extras.reduce((a, id) => a + (ALL_EXTRAS.find((x) => x.id === id)?.price ?? 0), 0);
  return dish.price + size.delta + ex;
}

/** Unit price of a cart line, applying any deal/reward discount. */
export function lineUnit(line: CartLine, dish: Dish): number {
  const base = unitOf(dish, line.s, line.ex);
  return line.deal ? base * (1 - (line.dealPct ?? 0) / 100) : base;
}

/** Human summary of a line's options, e.g. `12" · Calabrian chili oil`. */
export function lineMeta(line: CartLine, dish: Dish): string {
  const size = sizesOf(dish.cat)[line.s]?.label ?? '';
  const ex = line.ex.map((id) => ALL_EXTRAS.find((x) => x.id === id)?.label ?? '');
  return [size, ...ex].filter(Boolean).join(' · ');
}

export interface Totals {
  sub: number;
  count: number;
  fee: number;
  speedFee: number;
  disc: number;
  /** Total shown on the cart (excludes priority fee). */
  cartTotal: number;
  /** Total charged at checkout. */
  total: number;
}

export function computeTotals(args: {
  cart: CartLine[];
  dishOf: (id: string) => Dish;
  mode: FulfilmentMode;
  speed: number;
  fee: number;
  freeAt: number;
  promo: AppliedPromo | null;
}): Totals {
  const { cart, dishOf, mode, speed, fee: baseFee, freeAt, promo } = args;
  const sub = cart.reduce((a, c) => a + lineUnit(c, dishOf(c.id)) * c.q, 0);
  const count = cart.reduce((a, c) => a + c.q, 0);
  const pickup = mode === 'pickup';
  const fee = pickup || sub === 0 || sub >= freeAt ? 0 : baseFee;
  const speedFee = pickup ? 0 : (SPEEDS[speed]?.fee ?? 0);
  const disc = promo ? (sub * promo.pct) / 100 : 0;
  return { sub, count, fee, speedFee, disc, cartTotal: sub + fee - disc, total: sub + fee + speedFee - disc };
}
