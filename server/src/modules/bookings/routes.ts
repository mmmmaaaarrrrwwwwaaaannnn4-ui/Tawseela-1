import { ApiError, Booking, CreateBooking, POINTS, restaurantDate } from '@fig/shared';
import { FieldValue, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { randomInt } from 'node:crypto';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { requireUser } from '../../plugins/auth';
import { award, readUserTx } from '../me/service';

const secured = { security: [{ firebase: [] }] };
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };

export const toBooking = (d: DocumentSnapshot) => Booking.parse({ id: d.id, ...d.data() });

/** Evening slots ("5:30" … "10:30" PM) as minutes, so "10:00" sorts after "9:30". */
const minutesOf = (x: string) => {
  const [h, m] = x.split(':').map(Number);
  return (h % 12) * 60 + m;
};

/** Bookings sorted by day, then time of day. */
export const byDayAndTime = (a: Booking, b: Booking) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time);

/** How far ahead tables can be booked (the app's 14-day picker). */
const BOOKING_DAYS = 30;

const bookingRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;

  // before body validation, so a signed-out caller gets 401 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireUser(req);
  });

  app.post(
    '/bookings',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['bookings'],
        summary: 'Book a table (Fig’s addBooking) — earns 100 points',
        description: '`date` is YYYY-MM-DD in the restaurant’s time zone (restaurantDate(Date.now(), day) in @fig/shared).',
        ...secured,
        body: CreateBooking,
        response: { 201: Booking, ...errors },
      },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const today = restaurantDate(now());
      if (req.body.date < today || req.body.date > restaurantDate(now(), BOOKING_DAYS)) {
        throw badRequest(`Pick a day between today and ${BOOKING_DAYS} days from now.`);
      }
      const ref = db.collection(COL.bookings).doc();
      const booking = await db.runTransaction(async (tx) => {
        const { name, create } = await readUserTx(tx, db, user);
        const doc = {
          ...req.body,
          uid: user.uid,
          name,
          code: `R-${randomInt(2800, 9999)}`,
          status: 0 as const,
          createdAt: FieldValue.serverTimestamp(),
        };
        create();
        tx.set(ref, doc);
        award(tx, db, user.uid, POINTS.booking);
        return Booking.parse({ id: ref.id, ...doc });
      });
      return reply.code(201).send(booking);
    },
  );

  app.get(
    '/bookings',
    {
      schema: { tags: ['bookings'], summary: 'The signed-in customer’s bookings, soonest first', ...secured, response: { 200: z.array(Booking), ...errors } },
    },
    async (req) => {
      const snap = await db.collection(COL.bookings).where('uid', '==', requireUser(req).uid).limit(200).get();
      return snap.docs.flatMap((d) => Booking.safeParse({ id: d.id, ...d.data() }).data ?? []).sort(byDayAndTime);
    },
  );

  app.post(
    '/bookings/:id/cancel',
    {
      schema: {
        tags: ['bookings'],
        summary: 'Cancel a booking (Fig’s setBookingStatus(id, 2))',
        ...secured,
        params: z.object({ id: z.string().min(1).max(64) }),
        response: { 200: Booking, ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const ref = db.collection(COL.bookings).doc(req.params.id);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.get('uid') !== user.uid) throw notFound('That booking');
        if (snap.get('status') === 2) return;
        if (snap.get('status') !== 0) throw conflict('booking_closed', 'This booking can’t be cancelled any more.');
        tx.update(ref, { status: 2, updatedAt: FieldValue.serverTimestamp() });
      });
      return toBooking(await ref.get());
    },
  );
};

export default bookingRoutes;
