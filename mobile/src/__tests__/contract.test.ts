import { isStaff, movesFor, stepOfStage, type MoveContext } from '@/lib/contract';

const order = (over: Partial<MoveContext> = {}): MoveContext => ({ stage: 'placed', mode: 'delivery', riderUid: null, ...over });
const labels = (o: MoveContext, role: Parameters<typeof movesFor>[1], uid = 'me') => movesFor(o, role, uid).map((m) => m.label);

describe('order workflow', () => {
  it('lets each role make only its own move', () => {
    expect(labels(order(), 'callcenter')).toEqual(['Confirm order', 'Cancel order']);
    expect(labels(order(), 'packer')).toEqual([]);
    expect(labels(order({ stage: 'confirmed' }), 'packer')).toEqual(['Mark ready']);
    expect(labels(order({ stage: 'packed' }), 'warehouse')).toEqual(['Assign courier']);
    expect(labels(order({ stage: 'packed', mode: 'pickup' }), 'warehouse')).toEqual(['Handed to customer']);
    expect(labels(order(), 'user')).toEqual([]);
  });

  it('only lets the assigned rider pick up and deliver', () => {
    expect(labels(order({ stage: 'assigned', riderUid: 'r1' }), 'delivery', 'r1')).toEqual(['Picked up']);
    expect(labels(order({ stage: 'assigned', riderUid: 'r1' }), 'delivery', 'r2')).toEqual([]);
    expect(labels(order({ stage: 'out_for_delivery', riderUid: 'r1' }), 'delivery', 'r1')).toEqual(['Delivered']);
  });

  it('gives admins every move, cancelling included', () => {
    const moves = movesFor(order({ stage: 'assigned', riderUid: 'r1' }), 'admin', 'a');
    expect(moves.map((m) => m.to)).toEqual(['assigned', 'out_for_delivery', 'cancelled']);
    expect(moves.find((m) => m.to === 'cancelled')?.danger).toBe(true);
    expect(moves.find((m) => m.to === 'assigned')?.rider).toBe(true);
  });

  it('maps stages to the customer tracking steps', () => {
    expect(stepOfStage('placed', 'delivery')).toBe(0);
    expect(stepOfStage('packed', 'delivery')).toBe(1);
    expect(stepOfStage('packed', 'pickup')).toBe(2);
    expect(stepOfStage('out_for_delivery', 'delivery')).toBe(2);
    expect(stepOfStage('delivered', 'pickup')).toBe(3);
    expect(stepOfStage('cancelled', 'delivery')).toBe(4);
  });

  it('knows who is staff', () => {
    expect(isStaff('user')).toBe(false);
    expect(isStaff('callcenter')).toBe(true);
    expect(isStaff(null)).toBe(false);
  });
});
