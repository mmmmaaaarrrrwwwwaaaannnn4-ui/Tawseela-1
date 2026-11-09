import { ApiError, IssueResult, LikeResult, Me, REWARDS, ReportGeneralIssue, UpdateMe } from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { COL, bumpCatalog } from '../../lib/collections';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { forgetAccess } from '../../lib/roles';
import { requireUser } from '../../plugins/auth';
import { reportIssue } from '../orders/service';
import { ensureUser, readUserTx, toMe, userRef } from './service';

const secured = { security: [{ firebase: [] }] };
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };

const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, auth, now } = app.deps;

  // before body validation, so a signed-out caller gets 401 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireUser(req);
  });

  app.get('/me', { schema: { tags: ['me'], summary: 'The signed-in account: role, Fig Club points and tier, credit, vouchers, likes', ...secured, response: { 200: Me, ...errors } } }, async (req) => {
    const user = requireUser(req);
    return toMe(user, (await ensureUser(db, user)).data());
  });

  app.patch(
    '/me',
    { schema: { tags: ['me'], summary: 'Update name or phone', ...secured, body: UpdateMe, response: { 200: Me, ...errors } } },
    async (req) => {
      const user = requireUser(req);
      await ensureUser(db, user);
      const { name, phone } = req.body;
      await userRef(db, user.uid).set(
        { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      if (name) {
        forgetAccess(user.uid);
        await auth.updateUser(user.uid, { displayName: name }).catch((err) => req.log.warn({ err }, 'display name not updated'));
      }
      return toMe({ ...user, name: name ?? user.name }, (await userRef(db, user.uid).get()).data());
    },
  );

  app.post(
    '/me/rewards/:id/redeem',
    {
      schema: {
        tags: ['me'],
        summary: 'Spend points on a reward (Fig’s redeem)',
        description:
          'Dish rewards become a voucher: add it to the cart as `{ id: dish, s, ex: [], q: 1, voucher: voucher.id, deal: true, dealPct: 100 }` and it is free at checkout. ' +
          'Money-off rewards become Fig credit, spent with `useCredit` on an order.',
        ...secured,
        params: z.object({ id: z.string() }),
        response: { 200: Me, ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const reward = REWARDS.find((r) => r.id === req.params.id);
      if (!reward) throw badRequest('That reward doesn’t exist.');
      await db.runTransaction(async (tx) => {
        const { me, create } = await readUserTx(tx, db, user);
        if (me.redeemed.includes(reward.id)) throw conflict('already_redeemed', 'You’ve already redeemed this reward.');
        if (me.points < reward.pts) throw new AppError(409, 'not_enough_points', `You need ${reward.pts - me.points} more points.`);
        create();
        tx.set(
          userRef(db, user.uid),
          {
            points: FieldValue.increment(-reward.pts),
            redeemed: FieldValue.arrayUnion(reward.id),
            ...(reward.credit
              ? { credit: FieldValue.increment(reward.credit) }
              : { vouchers: FieldValue.arrayUnion({ id: randomUUID(), reward: reward.id, dish: reward.dish!, s: reward.s ?? 0 }) }),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      });
      return toMe(user, (await userRef(db, user.uid).get()).data());
    },
  );

  app.post(
    '/posts/:id/like',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: {
        tags: ['me'],
        summary: 'Like or unlike a journal story (Fig’s toggleLike)',
        description: 'Toggles by default; send `{ liked }` to set it. Returns the story’s new like count, which the next catalog also carries.',
        ...secured,
        params: z.object({ id: z.string().min(1).max(64) }),
        body: z.object({ liked: z.boolean().optional() }).default({}),
        response: { 200: LikeResult, ...errors },
      },
    },
    async (req) => {
      const user = requireUser(req);
      const postRef = db.collection(COL.posts).doc(req.params.id);
      return db.runTransaction(async (tx) => {
        const post = await tx.get(postRef);
        if (!post.exists || post.get('on') !== true) throw notFound('That story');
        const { me, create } = await readUserTx(tx, db, user);
        const was = me.liked.includes(post.id);
        const liked = req.body.liked ?? !was;
        const likes = Math.max(0, ((post.get('likes') as number | undefined) ?? 0) + (liked === was ? 0 : liked ? 1 : -1));
        if (liked !== was) {
          create();
          tx.update(postRef, { likes });
          tx.set(userRef(db, user.uid), { liked: liked ? FieldValue.arrayUnion(post.id) : FieldValue.arrayRemove(post.id) }, { merge: true });
          bumpCatalog(db, tx);
        }
        return { id: post.id, liked, likes };
      });
    },
  );

  app.post(
    '/issues',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['me'],
        summary: 'Report a problem (Fig’s submitIssue)',
        description: 'With an `orderId` of your own, the first report on that order adds $5 Fig credit. Without one, it is logged for the team.',
        ...secured,
        body: ReportGeneralIssue,
        response: { 200: IssueResult, ...errors },
      },
    },
    async (req) => reportIssue(db, requireUser(req), req.body.orderId, req.body, now()),
  );
};

export default meRoutes;
