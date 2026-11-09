import { AdvanceOrder, ApiError, ItemDonePatch, Order, OrderContactPatch, QUEUE, Rider, canMove } from '@fig/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { conflict } from '../../lib/errors';
import { requireStaff } from '../../plugins/auth';
import { advanceOrder, getOrderFor, inKitchen, listOrders, ridersWithLoad, setItemDone, updateOrderContact } from '../orders/service';
import { refundOrder } from '../payments/kashier';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 502: ApiError, 503: ApiError };
const idParam = z.object({ id: z.string().min(1).max(64) });
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * /v1/ops/* — the restaurant team's work: each role sees its own queue and can only make the moves the
 * shared rules (roles.ts) give it. Admins see and can do everything.
 */
const opsRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config, now } = app.deps;

  app.addHook('onRoute', (route) => {
    route.schema = { ...route.schema, tags: ['staff'], security: [{ firebase: [] }] };
  });
  // before body validation, so customers get 403 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireStaff(req);
  });

  app.get(
    '/orders',
    {
      schema: {
        summary: 'My queue',
        description:
          'Orders waiting on the caller’s role (a rider sees only orders assigned to them), plus the ones they moved in the last 24 hours. ' +
          'Unpaid card checkouts never appear.',
        response: { 200: z.array(Order), ...errors },
      },
    },
    async (req) => {
      const me = requireStaff(req);
      const since = now() - DAY_MS;
      const orders = (await listOrders(db, { limit: 300 })).filter(inKitchen);
      return orders.filter((o) => {
        const queued = QUEUE[me.role].includes(o.stage) && (me.role !== 'delivery' || o.rider?.uid === me.uid);
        const mine = o.timeline.some((e) => e.by?.uid === me.uid && e.at >= since && e.stage !== 'placed');
        return queued || mine;
      });
    },
  );

  app.get(
    '/riders',
    {
      schema: {
        summary: 'Couriers',
        description: 'Active accounts with the delivery role and how many orders each is carrying, least busy first. Warehouse and admins.',
        response: { 200: z.array(Rider.extend({ active: z.number().int() })), ...errors },
      },
    },
    async (req) => {
      requireStaff(req, ['warehouse']);
      return ridersWithLoad(db);
    },
  );

  app.get('/orders/:id', { schema: { summary: 'One order', params: idParam, response: { 200: Order, ...errors } } }, async (req) =>
    getOrderFor(db, requireStaff(req), req.params.id),
  );

  app.post(
    '/orders/:id/advance',
    {
      schema: {
        summary: 'Move an order to another stage',
        description:
          'callcenter: placed → confirmed / cancelled · packer: confirmed → packed · warehouse: packed → assigned (riderUid) or, for pickup, ' +
          'delivered · delivery (assigned rider only): assigned → out_for_delivery → delivered. Admins can make any move. Cancelling a paid ' +
          'card order refunds it.',
        params: idParam,
        body: AdvanceOrder,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      const me = requireStaff(req);
      const order = await getOrderFor(db, me, req.params.id);
      // checked before refunding; the transaction checks again
      if (!canMove({ stage: order.stage, mode: order.mode, riderUid: order.rider?.uid ?? null }, me.role, me.uid, req.body.to)) {
        throw conflict('move_not_allowed', 'You can’t make that change to this order.');
      }
      if (req.body.to === 'cancelled') await refundOrder(config, db, order.id);
      return advanceOrder(db, order.id, req.body, me, now());
    },
  );

  app.patch(
    '/orders/:id/contact',
    {
      schema: {
        summary: 'Correct the address, phone or note',
        description: 'Front of house and admins, until the order is ready (packed).',
        params: idParam,
        body: OrderContactPatch,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => updateOrderContact(db, req.params.id, req.body, requireStaff(req, ['callcenter']), now()),
  );

  app.post(
    '/orders/:id/items/:index/done',
    {
      schema: {
        summary: 'Tick an item off the packing checklist',
        description: 'Packers and admins, while the order is in the kitchen. Toggles, or send `{ done }`. The same flags show on the kitchen display.',
        params: z.object({ id: z.string().min(1).max(64), index: z.coerce.number().int().min(0).max(49) }),
        body: ItemDonePatch.default({}),
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      requireStaff(req, ['packer']);
      return setItemDone(db, req.params.id, req.params.index, req.body.done);
    },
  );
};

export default opsRoutes;
