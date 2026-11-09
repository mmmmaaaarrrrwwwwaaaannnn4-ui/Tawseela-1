import {
  AdminAdvanceOrder,
  ApiError,
  Booking,
  BookingStatusPatch,
  Customer,
  ItemDonePatch,
  Order,
  OrderStage,
  Review,
  nextStage,
  restaurantDate,
} from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { extname } from 'node:path';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { AppError, badRequest, conflict, notFound, unavailable } from '../../lib/errors';
import { requireAdmin } from '../../plugins/auth';
import { byDayAndTime, toBooking } from '../bookings/routes';
import { DEMO_RIDER, advanceOrder, fireTicket, getOrderFor, listOrders, ridersWithLoad, setItemDone } from '../orders/service';
import { refundOrder } from '../payments/kashier';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError, 413: ApiError, 502: ApiError, 503: ApiError };
const idParam = z.object({ id: z.string().min(1).max(64) });

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** /v1/admin — orders and the kitchen display, reservations, reviews, customers and photo uploads. */
const adminOperationRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, imagekit, config, now } = app.deps;

  /* ---------- orders and the kitchen display ---------- */

  app.get(
    '/orders',
    {
      schema: {
        summary: 'All orders, newest first',
        description: 'Includes unpaid card checkouts (payment.status awaiting_payment) so nothing is hidden from the console.',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(200), stage: OrderStage.optional() }),
        response: { 200: z.array(Order), ...errors },
      },
    },
    async (req) => (await listOrders(db, { limit: req.query.limit })).filter((o) => !req.query.stage || o.stage === req.query.stage),
  );

  app.get('/orders/:id', { schema: { summary: 'One order with its timeline', params: idParam, response: { 200: Order, ...errors } } }, async (req) =>
    getOrderFor(db, requireAdmin(req), req.params.id),
  );

  app.post(
    '/orders/:id/advance',
    {
      schema: {
        summary: 'Move an order on (Fig’s advanceOrder)',
        description:
          'Without a body, moves to the next stage on the happy path; moving a packed delivery order to `assigned` picks the least busy rider ' +
          'unless `riderUid` is given. Any stage can be sent as `to` — cancelling requires a manual Kashier dashboard refund for a paid online order.',
        params: idParam,
        body: AdminAdvanceOrder.default({}),
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      const me = requireAdmin(req);
      const order = await getOrderFor(db, me, req.params.id);
      const to = req.body.to ?? nextStage(order.stage, order.mode);
      if (!to) throw conflict('order_closed', `This order is already ${order.stage}.`);
      const riderUid = to === 'assigned' ? (req.body.riderUid ?? (await ridersWithLoad(db))[0]?.uid ?? DEMO_RIDER.uid) : undefined;
      if (to === 'cancelled') await refundOrder(config, db, order.id);
      return advanceOrder(db, order.id, { to, riderUid, note: req.body.note }, { ...me, role: 'admin' }, now());
    },
  );

  app.post(
    '/orders/:id/cancel',
    {
      schema: {
        summary: 'Cancel an order and refund it (Fig’s cancelOrder)',
        description: 'A paid online order is flagged for a manual refund in the Kashier dashboard; any Fig credit and reward vouchers it used go back to the customer.',
        params: idParam,
        body: z.object({ note: z.string().max(300).optional() }).default({}),
        response: { 200: Order, ...errors },
      },
    },
    async (req) => {
      const me = requireAdmin(req);
      const order = await getOrderFor(db, me, req.params.id);
      if (order.stage === 'cancelled') return order;
      if (order.stage === 'delivered') throw conflict('order_delivered', 'This order was already delivered.');
      const refunded = await refundOrder(config, db, order.id);
      return advanceOrder(db, order.id, { to: 'cancelled', note: req.body.note?.trim() || (refunded ? 'Refund issued' : undefined) }, me, now());
    },
  );

  app.post(
    '/orders/:id/fire',
    {
      schema: {
        summary: 'Kitchen display button (Fig’s fireTicket)',
        description: 'New ticket → fired (accepted, confirmed, ticket clock starts). Fired ticket → ready (packed, handed on to the warehouse or the pickup counter).',
        params: idParam,
        response: { 200: Order, ...errors },
      },
    },
    async (req) => fireTicket(db, req.params.id, requireAdmin(req), now()),
  );

  app.post(
    '/orders/:id/items/:index/done',
    {
      schema: {
        summary: 'Tick an item off on the kitchen display (Fig’s toggleKDone)',
        description: 'Toggles, or send `{ done }` to set it.',
        params: z.object({ id: z.string().min(1).max(64), index: z.coerce.number().int().min(0).max(49) }),
        body: ItemDonePatch.default({}),
        response: { 200: Order, ...errors },
      },
    },
    async (req) => setItemDone(db, req.params.id, req.params.index, req.body.done),
  );

  /* ---------- reservations ---------- */

  app.get(
    '/bookings',
    {
      schema: {
        summary: 'Reservations from a day on (default: today, in the restaurant’s time zone)',
        querystring: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }),
        response: { 200: z.array(Booking), ...errors },
      },
    },
    async (req) => {
      const from = req.query.from ?? restaurantDate(now());
      const snap = await db.collection(COL.bookings).where('date', '>=', from).limit(500).get();
      return snap.docs.flatMap((d) => Booking.safeParse({ id: d.id, ...d.data() }).data ?? []).sort(byDayAndTime);
    },
  );

  app.patch(
    '/bookings/:id',
    { schema: { summary: 'Seat, cancel or re-book a reservation (Fig’s setBookingStatus)', params: idParam, body: BookingStatusPatch, response: { 200: Booking, ...errors } } },
    async (req) => {
      const ref = db.collection(COL.bookings).doc(req.params.id);
      if (!(await ref.get()).exists) throw notFound('That booking');
      await ref.update({ status: req.body.status, updatedAt: FieldValue.serverTimestamp() });
      return toBooking(await ref.get());
    },
  );

  /* ---------- reviews ---------- */

  app.get('/reviews', { schema: { summary: 'Reviews, newest first', response: { 200: z.array(Review), ...errors } } }, async () => {
    const snap = await db.collection(COL.reviews).orderBy('at', 'desc').limit(200).get();
    return snap.docs.flatMap((d) => Review.safeParse({ reply: null, ...d.data(), id: d.id }).data ?? []);
  });

  app.post(
    '/reviews/:id/reply',
    {
      schema: {
        summary: 'Reply to a review (Fig’s replyReview)',
        params: idParam,
        body: z.object({ text: z.string().trim().max(1000).default('') }).default({ text: '' }),
        response: { 200: Review, ...errors },
      },
    },
    async (req) => {
      const ref = db.collection(COL.reviews).doc(req.params.id);
      if (!(await ref.get()).exists) throw notFound('That review');
      await ref.update({ replied: true, reply: req.body.text || 'Thank you!', repliedAt: now() });
      const snap = await ref.get();
      return Review.parse({ reply: null, ...snap.data(), id: snap.id });
    },
  );

  /* ---------- customers ---------- */

  app.get('/customers', { schema: { summary: 'Customers with their order count and spend', response: { 200: z.array(Customer), ...errors } } }, async () => {
    const [users, orders] = await Promise.all([db.collection(COL.users).where('role', '==', 'user').limit(1000).get(), listOrders(db, { limit: 500 })]);
    const stats = new Map<string, { orders: number; spent: number; addr: string }>();
    for (const o of orders) {
      const s = stats.get(o.uid) ?? { orders: 0, spent: 0, addr: '' };
      if (o.stage !== 'cancelled' && o.payment.status !== 'awaiting_payment') {
        s.orders += 1;
        s.spent += o.total;
      }
      s.addr ||= o.address?.l1 ?? '';
      stats.set(o.uid, s);
    }
    return users.docs
      .map((d) => {
        const s = stats.get(d.id) ?? { orders: 0, spent: 0, addr: '' };
        const tier = (d.get('tier') as Customer['tier'] | undefined) ?? (s.spent >= 50 ? 'VIP' : s.orders <= 1 ? 'New' : 'Regular');
        return Customer.parse({
          id: d.id,
          name: d.get('name') || 'Guest',
          email: d.get('email') ?? '',
          phone: d.get('phone') ?? '',
          addr: s.addr || (d.get('addr') as string | undefined) || '',
          tier,
          orders: s.orders,
          spent: Math.round(s.spent * 100) / 100,
        });
      })
      .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
  });

  /* ---------- photo uploads ---------- */

  app.post(
    '/uploads',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        summary: 'Upload a photo to ImageKit',
        description:
          'multipart/form-data with one `file` field (JPEG, PNG, WebP or HEIC, up to 8 MB). Returns the public URL to save on a dish, kitchen, banner or story. ' +
          'Optional `folder` field: dishes, kitchens, banners or journal (default uploads).',
        consumes: ['multipart/form-data'],
        response: { 201: z.object({ url: z.url(), fileId: z.string() }), ...errors },
      },
    },
    async (req, reply) => {
      if (!imagekit) throw unavailable('uploads_unavailable', 'Photo uploads aren’t set up on the server yet (IMAGEKIT_PRIVATE_KEY).');
      if (!req.isMultipart()) throw badRequest('Send the photo as multipart/form-data in a `file` field.');
      const file = await req.file();
      if (!file) throw badRequest('Attach a photo in the `file` field.');
      if (!IMAGE_TYPES.has(file.mimetype)) throw badRequest('Photos must be JPEG, PNG, WebP or HEIC.');
      const buffer = await file.toBuffer().catch((e: { code?: string }) => {
        if (e.code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError(413, 'file_too_large', 'Photos can be up to 8 MB.');
        throw e;
      });
      if (file.file.truncated) throw new AppError(413, 'file_too_large', 'Photos can be up to 8 MB.');
      const folderField = (file.fields.folder as { value?: unknown } | undefined)?.value;
      const folder = ['dishes', 'kitchens', 'banners', 'journal'].includes(String(folderField)) ? String(folderField) : 'uploads';
      const ext = (extname(file.filename) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '');
      const res = await imagekit.files
        .upload({
          file: new File([buffer], file.filename || `photo${ext}`, { type: file.mimetype }),
          fileName: `${folder}-${now().toString(36)}${ext}`,
          folder: `${config.IMAGEKIT_FOLDER}/${folder}`,
          useUniqueFileName: true,
        })
        .catch((err) => {
          req.log.error({ err }, 'ImageKit upload failed');
          throw new AppError(502, 'upload_failed', 'ImageKit didn’t accept the photo. Try again.');
        });
      if (!res.url || !res.fileId) throw new AppError(502, 'upload_failed', 'ImageKit didn’t accept the photo. Try again.');
      return reply.code(201).send({ url: res.url, fileId: res.fileId });
    },
  );
};

export default adminOperationRoutes;
