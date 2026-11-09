/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { computeTotals, lineMeta, lineUnit, settleLine, unitOf, type CartLine } from '../src';
import * as local from './fixtures/local-pricing';

/*
 * The app and the server must charge the same total for the same cart. fixtures/local-pricing.ts is the
 * local edition's pricing, copied verbatim; these tests price thousands of carts with both and demand
 * identical numbers (Object.is, not "close to"), and check the copy still matches the root app.
 */

/** The local edition's dishes (id, category, base price) — src/data/menu.ts — plus a few awkward prices. */
const DISHES: { id: string; cat: string; price: number }[] = [
  { id: 'marg', cat: 'Pizza', price: 12.5 },
  { id: 'pep', cat: 'Pizza', price: 14.5 },
  { id: 'funghi', cat: 'Pizza', price: 15.5 },
  { id: 'brisket', cat: 'Burgers', price: 14 },
  { id: 'smash', cat: 'Burgers', price: 13.5 },
  { id: 'chick', cat: 'Burgers', price: 12 },
  { id: 'carb', cat: 'Pasta', price: 13 },
  { id: 'lasagne', cat: 'Pasta', price: 14 },
  { id: 'risotto', cat: 'Pasta', price: 16.5 },
  { id: 'handi', cat: 'Bowls', price: 13.5 },
  { id: 'biryani', cat: 'Bowls', price: 14.5 },
  { id: 'ramen', cat: 'Bowls', price: 13 },
  { id: 'wings', cat: 'Sides', price: 9.5 },
  { id: 'fries', cat: 'Sides', price: 6.5 },
  { id: 'cheesecake', cat: 'Desserts', price: 7.5 },
  { id: 'gateau', cat: 'Desserts', price: 8 },
  { id: 'odd1', cat: 'Specials', price: 9.99 },
  { id: 'odd2', cat: 'Pizza', price: 10.15 },
  { id: 'odd3', cat: 'Desserts', price: 0.7 },
];
const dishOf = (id: string) => DISHES.find((d) => d.id === id)!;
const EXTRA_IDS = ['cream', 'berry', 'cheese', 'chili', 'dip', 'side', 'nope'];
const PROMOS = [null, { code: 'FIG10', pct: 10 }, { code: 'WEEKNIGHT15', pct: 15 }, { code: 'LUNCH20', pct: 20 }, { code: 'X', pct: 35 }];

/** Deterministic pseudo-random numbers (mulberry32), so a failure can be replayed. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCart(r: () => number): CartLine[] {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const n = 1 + Math.floor(r() * 6);
  return Array.from({ length: n }, () => {
    const d = pick(DISHES);
    const ex = EXTRA_IDS.filter(() => r() < 0.25);
    const line: CartLine = { id: d.id, s: Math.floor(r() * 4), ex, q: 1 + Math.floor(r() * 4) };
    const kind = r();
    if (kind < 0.15) return { ...line, deal: true, dealPct: pick([5, 10, 25, 30, 50]) };
    if (kind < 0.22) return { ...line, deal: true, dealPct: 100, q: 1 };
    return line;
  });
}

describe('pricing parity with the local edition', () => {
  it('prices 5,000 random carts to exactly the same totals', () => {
    const r = rng(20261105);
    for (let i = 0; i < 5000; i++) {
      const cart = randomCart(r);
      const mode = r() < 0.3 ? ('pickup' as const) : ('delivery' as const);
      const speed = Math.floor(r() * 2);
      const fee = [0, 1.5, 2.99, 3.49][Math.floor(r() * 4)];
      const freeAt = [10, 25, 40, 60][Math.floor(r() * 4)];
      const promo = PROMOS[Math.floor(r() * PROMOS.length)];
      const theirs = local.computeTotals({ cart, dishOf, mode, speed, fee, freeAt, promo });
      const ours = computeTotals({ cart, dishOf, mode, speed, fee, freeAt, promo });
      const ctx = JSON.stringify({ i, cart, mode, speed, fee, freeAt, promo });
      for (const k of ['sub', 'count', 'fee', 'speedFee', 'disc', 'cartTotal', 'total'] as const) {
        expect(Object.is(ours[k], theirs[k]), `${k}: ${ours[k]} vs ${theirs[k]} for ${ctx}`).toBe(true);
      }
      expect(ours.credit).toBe(0);
      for (const line of cart) {
        expect(Object.is(lineUnit(line, dishOf(line.id)), local.lineUnit(line, dishOf(line.id)))).toBe(true);
        expect(lineMeta(line, dishOf(line.id))).toBe(local.lineMeta(line, dishOf(line.id)));
      }
    }
  });

  it('agrees on unit prices for every size and extra combination', () => {
    for (const d of DISHES) {
      for (let s = 0; s < 4; s++) {
        for (let mask = 0; mask < 1 << EXTRA_IDS.length; mask += 3) {
          const ex = EXTRA_IDS.filter((_, k) => mask & (1 << k));
          expect(Object.is(unitOf(d, s, ex), local.unitOf(d, s, ex))).toBe(true);
        }
      }
    }
  });

  it('charges what the app shows once the cart is settled against the live deal', () => {
    // the app keeps each deal line's percentage up to date (settleLine) — the server prices the same way
    const deal = { id: 'smash', pct: 25, on: true };
    const r = rng(7);
    for (let i = 0; i < 1000; i++) {
      const cart = randomCart(r).map((l): CartLine => (l.deal && l.dealPct !== 100 ? { ...l, id: 'smash', dealPct: 25 } : l));
      const app = local.computeTotals({ cart, dishOf, mode: 'delivery', speed: 0, fee: 2.99, freeAt: 40, promo: null });
      // what the server sees: reward lines carry a voucher id, and it re-derives every discount itself
      const sent = cart.map((l) => (l.dealPct === 100 ? { ...l, voucher: 'v1' } : l));
      const server = computeTotals({ cart: sent.map((l) => settleLine(l, deal)), dishOf, mode: 'delivery', speed: 0, fee: 2.99, freeAt: 40, promo: null });
      expect(Object.is(server.total, app.total)).toBe(true);
    }
  });
});

/* ---------- the fixture is still the root app's code ---------- */

const ROOT = resolve(import.meta.dirname, '../../../src');
const haveRoot = existsSync(resolve(ROOT, 'lib/pricing.ts')) && existsSync(resolve(ROOT, 'data/menu.ts'));

describe.skipIf(!haveRoot)('the fixture', () => {
  const fixture = readFileSync(resolve(import.meta.dirname, 'fixtures/local-pricing.ts'), 'utf8');

  it('holds src/data/menu.ts’s size and extra tables verbatim', () => {
    const menu = readFileSync(resolve(ROOT, 'data/menu.ts'), 'utf8');
    const start = menu.indexOf('const SIZES');
    const endMarker = 'export const ALL_EXTRAS: Extra[] = [...EXTRAS.sweet, ...EXTRAS.savory];';
    const tables = menu.slice(start, menu.indexOf(endMarker) + endMarker.length);
    expect(start).toBeGreaterThan(0);
    expect(fixture).toContain(tables);
  });

  it('holds src/lib/pricing.ts verbatim (after its imports)', () => {
    const pricing = readFileSync(resolve(ROOT, 'lib/pricing.ts'), 'utf8');
    const body = pricing
      .split('\n')
      .filter((l) => !l.startsWith('import '))
      .join('\n')
      .replace('export { extrasOf, sizesOf };', '')
      .trim();
    expect(fixture).toContain(body);
  });
});
