import { describe, expect, it } from 'vitest';

import { canMove, isStaff, kitchenTab, movesFor, nextStage, stepOfStage, ticketMinutes, type MoveContext, type OrderStage } from '../src';

const order = (stage: OrderStage, over: Partial<MoveContext> = {}): MoveContext => ({ stage, mode: 'delivery', riderUid: null, ...over });
const to = (o: MoveContext, role: Parameters<typeof movesFor>[1], uid = 'me') => movesFor(o, role, uid).map((m) => m.to);

describe('who moves an order', () => {
  it('lets the call center confirm or cancel new orders only', () => {
    expect(to(order('placed'), 'callcenter')).toEqual(['confirmed', 'cancelled']);
    expect(to(order('confirmed'), 'callcenter')).toEqual(['cancelled']);
    expect(to(order('packed'), 'callcenter')).toEqual([]);
  });

  it('lets the packer pack confirmed orders', () => {
    expect(to(order('placed'), 'packer')).toEqual([]);
    expect(to(order('confirmed'), 'packer')).toEqual(['packed']);
  });

  it('lets the warehouse assign and reassign riders, or hand pickups over', () => {
    expect(movesFor(order('packed'), 'warehouse', 'me')).toEqual([{ to: 'assigned', label: 'Assign courier', rider: true }]);
    expect(to(order('assigned', { riderUid: 'r1' }), 'warehouse')).toEqual(['assigned']);
    expect(to(order('packed', { mode: 'pickup' }), 'warehouse')).toEqual(['delivered']);
    expect(to(order('packed', { mode: 'pickup' }), 'callcenter')).toEqual(['delivered']);
  });

  it('lets only the assigned rider pick up and deliver', () => {
    const o = order('assigned', { riderUid: 'r1' });
    expect(to(o, 'delivery', 'r1')).toEqual(['out_for_delivery']);
    expect(to(o, 'delivery', 'r2')).toEqual([]);
    expect(to(order('out_for_delivery', { riderUid: 'r1' }), 'delivery', 'r1')).toEqual(['delivered']);
  });

  it('lets an admin make any move, including cancelling late', () => {
    expect(to(order('placed'), 'admin')).toEqual(['confirmed', 'cancelled']);
    expect(to(order('out_for_delivery', { riderUid: 'r1' }), 'admin')).toEqual(['delivered', 'cancelled']);
    expect(canMove(order('assigned', { riderUid: 'r1' }), 'admin', 'a1', 'out_for_delivery')).toBe(true);
  });

  it('gives customers and finished orders no moves', () => {
    expect(to(order('placed'), 'user')).toEqual([]);
    expect(to(order('delivered'), 'admin')).toEqual([]);
    expect(to(order('cancelled'), 'admin')).toEqual([]);
    expect(isStaff('user')).toBe(false);
    expect(isStaff('packer')).toBe(true);
  });

  it('knows the next stage on the happy path (the console’s Advance)', () => {
    expect(nextStage('placed', 'delivery')).toBe('confirmed');
    expect(nextStage('packed', 'delivery')).toBe('assigned');
    expect(nextStage('packed', 'pickup')).toBe('delivered');
    expect(nextStage('out_for_delivery', 'delivery')).toBe('delivered');
    expect(nextStage('delivered', 'delivery')).toBeNull();
    expect(nextStage('cancelled', 'pickup')).toBeNull();
  });
});

describe('the customer’s view (Fig’s OrderStep)', () => {
  it('maps stages to 0 New · 1 Preparing · 2 On the way · 3 Delivered · 4 Cancelled', () => {
    expect(stepOfStage('placed', 'delivery')).toBe(0);
    expect(stepOfStage('confirmed', 'delivery')).toBe(1);
    expect(stepOfStage('packed', 'delivery')).toBe(1);
    expect(stepOfStage('assigned', 'delivery')).toBe(2);
    expect(stepOfStage('out_for_delivery', 'delivery')).toBe(2);
    expect(stepOfStage('delivered', 'delivery')).toBe(3);
    expect(stepOfStage('cancelled', 'pickup')).toBe(4);
  });

  it('shows a packed pickup order as ready (step 2)', () => {
    expect(stepOfStage('packed', 'pickup')).toBe(2);
  });
});

describe('the kitchen display', () => {
  const k = (fired: boolean, firedAt: number | null = null) => ({ fired, firedAt, done: [] });

  it('puts new and unfired tickets on the first tab, fired ones on the line', () => {
    expect(kitchenTab({ stage: 'placed', kitchen: k(false) })).toBe(0);
    expect(kitchenTab({ stage: 'confirmed', kitchen: k(false) })).toBe(0);
    expect(kitchenTab({ stage: 'confirmed', kitchen: k(true) })).toBe(1);
    expect(kitchenTab({ stage: 'packed', kitchen: k(true) })).toBeNull();
  });

  it('ages a ticket from when it was fired, or placed', () => {
    const now = 1_000_000_000;
    expect(ticketMinutes({ placedAt: now - 7 * 60_000, kitchen: k(false) }, now)).toBe(7);
    expect(ticketMinutes({ placedAt: now - 30 * 60_000, kitchen: k(true, now - 4 * 60_000 - 5_000) }, now)).toBe(4);
  });
});
