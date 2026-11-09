import { ApiError, CreateOrder, CreateOrderResult, IssueResult, Order, RateOrder, ReportIssue, toCents } from '@fig/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AppError } from '../../lib/errors';
import { requireUser } from '../../plugins/auth';
import { createKashierDirectIntent, requireKashier, verifyKashierSession } from '../payments/kashier';
import { cancelUnpaid, createOrder, getOrderFor, inKitchen, listOrders, rateOrder, reportIssue } from './service';

const secured = { security: [{ firebase: [] }] };
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 502: ApiError, 503: ApiError };
const idParam = z.object({ id: z.string().min(1).max(64) });

const orderRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config, now } = app.deps;
  const live = () => config.DEMO_KITCHEN_SECONDS > 0;

  // before body validation, so a signed-out caller gets 401 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireUser(req);
  });

  app.post(
    '/orders',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['orders'],
        summary: 'Place an order (Fig’s placeOrder)',
        description:
          'Prices the cart from the live menu with the shared pricing rules and refuses with `409 price_changed` (details.total = the real total) ' +
          'when `expectedTotal` differs. Cash orders go straight to the kitchen. Card orders create a Direct API payment intent separately; they reach the kitchen only after a signed Kashier webhook confirms success. Send an `Idempotency-Key` ' +
          'header (8–100 chars): a retry with the same key returns the same order while it is unpaid.',
        ...secured,
        headers: z.object({ 'idempotency-key': z.string().min(8).max(100).optional() }),
        body: CreateOrder,
        response: { 201: CreateOrderResult, ...errors },
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      // refuse online orders if Kashier is not configured; free orders need no gateway.
      if (req.body.method !== 'cash' && toCents(req.body.expectedTotal) > 0) requireKashier(config);
      const { order } = await createOrder(db, user, req.body, { now: now(), idempotencyKey: req.headers['idempotency-key'], live: live() });
      const payment = null; // Direct API intent is issued separately after the order is created.
      return reply.code(201).send({ order, payment });
    },
  );

  app.post(
    '/orders/:id/payment/direct-intent',
    {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
      schema: {
        tags: ['payments'], summary: 'Create a signed Kashier Direct API card payment intent',
        ...secured, params: idParam,
        response: { 200: z.object({ hash: z.string(), endpoint: z.string().url(), merchantId: z.string(), reference: z.string(), amount: z.string(), currency: z.string(), customerReference: z.string(), webhookUrl: z.string().url(), merchantRedirect: z.string() }), ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const order = await getOrderFor(db, user, req.params.id);
      if (order.payment.method === 'cash' || order.stage === 'cancelled' || order.payment.status === 'paid') {
        throw new AppError(409, 'payment_not_available', 'This order is not awaiting an online payment.');
      }
      const intent = await createKashierDirectIntent(config, order);
      await db.collection('orders').doc(order.id).update({ 'payment.provider': 'kashier_direct', updatedAt: new Date(now()) });
      return intent;
    },
  );

  app.get(
    '/orders',
    {
      schema: {
        tags: ['orders'],
        summary: 'The signed-in customer’s orders, newest first',
        description: 'Orders the kitchen has (cash, or paid). Unpaid card checkouts are left out; `GET /orders/:id` still returns them.',
        ...secured,
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
        response: { 200: z.array(Order), ...errors },
      },
    },
    async (req) => (await listOrders(db, { uid: requireUser(req).uid, limit: req.query.limit })).filter(inKitchen),
  );

  app.get(
    '/orders/:id',
    {
      schema: {
        tags: ['orders'],
        summary: 'One order by its number (e.g. EK-4822) — poll it to follow tracking',
        ...secured,
        params: idParam,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => getOrderFor(db, requireUser(req), req.params.id),
  );

  app.post(
    '/orders/:id/payment/sync',
    {
      schema: {
        tags: ['orders'],
        summary: 'Verify the Kashier payment session',
        description: 'Reads the payment state from Kashier; browser redirects are never treated as proof of payment.',
        ...secured,
        params: idParam,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const order = await getOrderFor(db, user, req.params.id);
      if (order.payment.method === 'cash') return order;
      const storedOrder = await db.collection('orders').doc(order.id).get();
      if (storedOrder.get('payment.kashierSessionId')) await verifyKashierSession(config, db, order.id, now());
      return getOrderFor(db, user, order.id);
    },
  );

  app.post(
    '/orders/:id/cancel',
    {
      schema: {
        tags: ['orders'],
        summary: 'Abandon an unpaid card checkout',
        description: 'Cancels an unpaid order and gives back any Fig credit or reward vouchers it used. The Kashier session itself expires separately. Orders the kitchen has can’t be cancelled here (409 order_in_kitchen).',
        ...secured,
        params: idParam,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const order = await getOrderFor(db, { uid: user.uid, role: 'user' }, req.params.id);
      
      return cancelUnpaid(db, user, order.id, now());
    },
  );

  app.post(
    '/orders/:id/rating',
    {
      schema: {
        tags: ['orders'],
        summary: 'Rate an order and tip (Fig’s submitRating) — the first rating earns 50 points',
        ...secured,
        params: idParam,
        body: RateOrder,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => rateOrder(db, requireUser(req), req.params.id, req.body, now()),
  );

  app.post(
    '/orders/:id/issues',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['orders'],
        summary: 'Report a problem with an order — adds $5 Fig credit once per order',
        ...secured,
        params: idParam,
        body: ReportIssue,
        response: { 200: IssueResult, ...errors },
      },
    },
    async (req) => reportIssue(db, requireUser(req), req.params.id, req.body, now()),
  );
};

export default orderRoutes;
