import { describe, expect, it } from 'vitest';

import { computeTotals, lineMeta, lineUnit, restaurantDate, settleLine, tierOf, toCents, unitOf, type CartLine } from '../src';

const pizza = { id: 'pep', cat: 'Pizza', price: 14.5 };
const burger = { id: 'smash', cat: 'Burgers', price: 13.5 };
const cake = { id: 'cheesecake', cat: 'Desserts', price: 7.5 };
const dishOf = (id: string) => [pizza, burger, cake].find((d) => d.id === id)!;
const deal = { id: 'smash', pct: 25, on: true };
const store = { fee: 2.99, freeAt: 40 };
const totals = (cart: CartLine[], over: Partial<Parameters<typeof computeTotals>[0]> = {}) =>
  computeTotals({ cart, dishOf, mode: 'delivery', speed: 0, ...store, promo: null, ...over });

describe('unit prices', () => {
  it('adds size and extras', () => {
    expect(unitOf(pizza, 0, [])).toBe(12.5);
    expect(unitOf(pizza, 2, ['cheese', 'chili'])).toBeCloseTo(14.5 + 3 + 1.5 + 0.8);
    expect(unitOf(cake, 1, ['berry'])).toBeCloseTo(7.5 + 6.5 + 1.5);
    // an unknown size falls back to the first one, an unknown extra costs nothing
    expect(unitOf(burger, 9, ['nope'])).toBe(13.5);
  });

  it('discounts deal lines by their percentage, and rewards to zero', () => {
    expect(lineUnit({ s: 0, ex: [], deal: true, dealPct: 25 }, burger)).toBeCloseTo(10.125);
    expect(lineUnit({ s: 1, ex: ['cheese'], deal: true, dealPct: 100 }, pizza)).toBe(0);
  });

  it('labels options for receipts', () => {
    expect(lineMeta({ s: 2, ex: ['cheese', 'chili'] }, pizza)).toBe('14" · Extra cheese · Calabrian chili oil');
    expect(lineMeta({ s: 0, ex: [] }, burger)).toBe('Regular');
  });
});

describe('settling a line against the live menu', () => {
  it('applies today’s deal only to the deal dish while it is on', () => {
    expect(settleLine({ id: 'smash', s: 0, ex: [], q: 1, deal: true, dealPct: 10 }, deal)).toMatchObject({ deal: true, dealPct: 25 });
    expect(settleLine({ id: 'pep', s: 1, ex: [], q: 1, deal: true, dealPct: 25 }, deal)).toEqual({ id: 'pep', s: 1, ex: [], q: 1 });
    expect(settleLine({ id: 'smash', s: 0, ex: [], q: 1, deal: true, dealPct: 25 }, { ...deal, on: false })).not.toHaveProperty('deal');
  });

  it('makes voucher lines free and leaves plain lines alone', () => {
    expect(settleLine({ id: 'fries', s: 0, ex: [], q: 1, voucher: 'v1' }, deal)).toMatchObject({ deal: true, dealPct: 100 });
    const plain = { id: 'pep', s: 1, ex: [], q: 2 };
    expect(settleLine(plain, deal)).toBe(plain);
  });
});

describe('totals', () => {
  it('charges delivery below the free threshold', () => {
    const r = totals([{ id: 'pep', s: 1, ex: [], q: 1 }]);
    expect(r).toMatchObject({ sub: 14.5, fee: 2.99, count: 1 });
    expect(r.total).toBeCloseTo(17.49);
    expect(totals([{ id: 'pep', s: 1, ex: [], q: 3 }]).fee).toBe(0);
  });

  it('judges free delivery before the promo comes off', () => {
    const r = totals([{ id: 'pep', s: 1, ex: ['cheese'], q: 2, deal: false }, { id: 'cheesecake', s: 0, ex: [], q: 1 }], { promo: { pct: 10 } });
    // 32 + 7.5 = 39.5 → still pays delivery; 10% off 39.5
    expect(r.fee).toBe(2.99);
    expect(r.disc).toBeCloseTo(3.95);
  });

  it('adds the priority fee for delivery only', () => {
    const fast = totals([{ id: 'pep', s: 1, ex: [], q: 1 }], { speed: 1 });
    expect(fast.speedFee).toBe(20);
    expect(fast.cartTotal).toBeCloseTo(17.49);
    expect(fast.total).toBeCloseTo(37.49);
    expect(totals([{ id: 'pep', s: 1, ex: [], q: 1 }], { speed: 1, mode: 'pickup' })).toMatchObject({ fee: 0, speedFee: 0, total: 14.5 });
  });

  it('has no fee for an empty cart', () => {
    expect(totals([])).toMatchObject({ sub: 0, fee: 0, total: 0 });
  });

  it('spends Fig credit last, in whole cents, never below zero', () => {
    const r = totals([{ id: 'pep', s: 1, ex: [], q: 1 }], { credit: 5 });
    expect(r.credit).toBe(5);
    expect(r.total).toBeCloseTo(12.49);
    expect(r.cartTotal).toBeCloseTo(17.49);
    const all = totals([{ id: 'pep', s: 1, ex: [], q: 1 }], { credit: 50 });
    expect(all.credit).toBe(17.49);
    expect(toCents(all.total)).toBe(0);
    expect(totals([{ id: 'pep', s: 1, ex: [], q: 1 }], { credit: 0 }).credit).toBe(0);
  });

  it('converts to Kashier cents without float drift', () => {
    expect(toCents(18.99)).toBe(1899);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe('Fig Club and dates', () => {
  it('names tiers by points, up to Platinum', () => {
    expect(tierOf(0)).toBe('Bronze');
    expect(tierOf(1240)).toBe('Silver');
    expect(tierOf(2500)).toBe('Gold');
    expect(tierOf(5000)).toBe('Platinum');
  });

  it('counts days in the restaurant’s time zone', () => {
    // 03:00 UTC on 6 Nov is still 5 Nov in New York
    const t = Date.UTC(2026, 10, 6, 3, 0);
    expect(restaurantDate(t)).toBe('2026-11-05');
    expect(restaurantDate(t, 1)).toBe('2026-11-06');
    expect(restaurantDate(t, 30)).toBe('2026-12-05');
  });
});
