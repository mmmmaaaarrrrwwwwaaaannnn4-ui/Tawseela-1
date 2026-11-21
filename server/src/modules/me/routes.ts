import { ApiError, IssueResult, LikeResult, Me, REWARDS, ReportGeneralIssue, UpdateMe } from '@fig/shared';
import { FieldValue } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { randomUUID, createHmac } from 'node:crypto';
import { z } from 'zod';

import { COL, bumpCatalog } from '../../lib/collections';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { forgetAccess } from '../../lib/roles';
import { requireUser } from '../../plugins/auth';
import { reportIssue } from '../orders/service';
import { ensureUser, readUserTx, toMe, userRef } from './service';

const secured = { security: [{ firebase: [] }] };
const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 404: ApiError, 409: ApiError };

/** Persist and return only a masked PAN; the full card number and CVV never enter Firestore. */
const maskCardNumber = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? '•••• •••• •••• ' + digits.slice(-4) : '••••';
};

const meRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, auth, now, config } = app.deps;

  // before body validation, so a signed-out caller gets 401 rather than details about the payload
  app.addHook('preValidation', async (req) => {
    requireUser(req);
  });

  // Kashier card vault: PAN/CVV go directly from the device to Kashier, never through this API.
  const tokenBase = () => config.KASHIER_MODE === 'live' ? 'https://fep.kashier.io' : 'https://test-fep.kashier.io';
  const tokenHash = (uid: string) => {
    // Config values are optional at the type level; validate them here as well as at each route.
    const paymentApiKey = config.KASHIER_PAYMENT_API_KEY;
    const merchantId = config.KASHIER_MERCHANT_ID;
    if (!paymentApiKey || !merchantId) {
      throw new AppError(503, 'payments_unavailable', 'Kashier card saving is not configured.');
    }
    return createHmac('sha256', paymentApiKey)
      .update(`/?tokenization=${merchantId}.${uid}`)
      .digest('hex');
  };

  app.get('/me/cards/tokenization-intent', { schema: { tags: ['payments'], summary: 'Create a short-lived Kashier card-tokenization hash', ...secured } }, async (req) => {
    const user = requireUser(req);
    if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY) throw new AppError(503, 'payments_unavailable', 'Kashier card saving is not configured.');
    return { endpoint: `${tokenBase()}/v3/cards/tokens`, merchantId: config.KASHIER_MERCHANT_ID, customerReference: user.uid, hash: tokenHash(user.uid) };
  });

  app.get('/me/cards', { schema: { tags: ['payments'], summary: 'List this customer’s Kashier saved cards', ...secured } }, async (req) => {
    const user = requireUser(req);
    if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY || !config.KASHIER_SECRET_KEY) {
      throw new AppError(503, 'payments_unavailable', 'Kashier card saving is not configured.');
    }

    // Kashier is the source of truth: this also finds cards saved before this app recorded local metadata.
    const url = `${tokenBase()}/v3/cards/customer?customerReference=${encodeURIComponent(user.uid)}&merchantId=${encodeURIComponent(config.KASHIER_MERCHANT_ID)}`;
    const response = await fetch(url, {
      headers: { 'Kashier-Hash': tokenHash(user.uid), accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    const body: any = await response.json().catch(() => ({}));
    const noCards = response.status === 400 && /no cards/i.test(JSON.stringify(body));
    if (!response.ok && !noCards) {
      throw new AppError(502, 'card_list_failed', 'Could not retrieve saved cards from Kashier.');
    }

    const providerMethods = Array.isArray(body?.response?.paymentMethods) ? body.response.paymentMethods : [];
    const providerCards = providerMethods
      .filter((method: any) => String(method?.type || '').toUpperCase() === 'CARD' && method?.card?.cardToken)
      .map((method: any) => method.card);

    // Merge the verified local cache as a fallback, without hiding cards found in Kashier.
    const snap = await userRef(db, user.uid).get();
    const stored = snap.get('paymentMethods.cards');
    const localCards = stored && typeof stored === 'object' && !Array.isArray(stored)
      ? Object.entries(stored as Record<string, any>)
          .filter(([token, value]) => token && value && typeof value === 'object' && value.token === token)
          .map(([token, value]) => ({ cardToken: token, ...value }))
      : [];
    const byToken = new Map<string, any>();
    for (const card of localCards) byToken.set(String(card.cardToken), card);
    for (const card of providerCards) byToken.set(String(card.cardToken), card);

    const defaultCardToken = String(snap.get('paymentMethods.defaultCardToken') || '');
    return {
      cards: [...byToken.values()].map((card: any) => ({
        id: String(card.cardToken),
        token: String(card.cardToken),
        number: maskCardNumber(card.number),
        name: String(card.nameOnCard || card.name || ''),
        expiry: card.expiry ? { month: String(card.expiry.month || ''), year: String(card.expiry.year || '') } : null,
        brand: String(card.brand || card.scheme || 'CARD'),
        isDefault: String(card.cardToken) === defaultCardToken,
      })),
    };
  });

  app.post('/me/cards', { schema: { tags: ['payments'], summary: 'Verify and register a Kashier card token for this customer', ...secured, body: z.object({ cardToken: z.string().min(8).max(200) }) } }, async (req) => {
    const user = requireUser(req);
    if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY || !config.KASHIER_SECRET_KEY) throw new AppError(503, 'payments_unavailable', 'Kashier is not configured.');
    const url = `${tokenBase()}/v3/cards/tokens/${encodeURIComponent(req.body.cardToken)}?merchantId=${encodeURIComponent(config.KASHIER_MERCHANT_ID)}&customerReference=${encodeURIComponent(user.uid)}`;
    const response = await fetch(url, { headers: { 'Kashier-Hash': tokenHash(user.uid), accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body: any = await response.json().catch(() => ({}));
    const card = body?.response?.paymentMethod?.card;
    if (!response.ok || !card?.cardToken || card.cardToken !== req.body.cardToken) throw new AppError(400, 'card_token_invalid', 'Kashier could not verify this saved card.');
    const profileRef = userRef(db, user.uid);
    await db.runTransaction(async (tx) => {
      const profile = await tx.get(profileRef);
      const currentDefault = String(profile.get('paymentMethods.defaultCardToken') || '');
      tx.set(profileRef, {
        paymentMethods: {
          cards: { [req.body.cardToken]: { token: req.body.cardToken, number: maskCardNumber(card.number), name: String(card.nameOnCard || ''), expiry: card.expiry || null, brand: String(card.brand || card.scheme || 'CARD'), savedAt: now() } },
          ...(!currentDefault ? { defaultCardToken: req.body.cardToken } : {}),
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { saved: true, card: { id: String(card.cardToken), number: maskCardNumber(card.number), name: String(card.nameOnCard || ''), expiry: card.expiry || null, brand: String(card.brand || card.scheme || 'CARD') } };
  });

  app.delete('/me/cards/:token', { schema: { tags: ['payments'], summary: 'Delete a saved Kashier card token', ...secured, params: z.object({ token: z.string().min(8).max(200) }) } }, async (req) => {
    const user = requireUser(req);
    if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY || !config.KASHIER_SECRET_KEY) throw new AppError(503, 'payments_unavailable', 'Kashier is not configured.');
    const url = `${tokenBase()}/v3/cards/tokens/${encodeURIComponent(req.params.token)}?customerReference=${encodeURIComponent(user.uid)}&merchantId=${encodeURIComponent(config.KASHIER_MERCHANT_ID)}`;
    const response = await fetch(url, { method: 'DELETE', headers: { 'Kashier-Hash': tokenHash(user.uid), accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new AppError(502, 'card_delete_failed', 'Kashier could not remove this card.');
    const profileRef = userRef(db, user.uid);
    await db.runTransaction(async (tx) => {
      const profile = await tx.get(profileRef);
      const stored = profile.get('paymentMethods.cards');
      const cards = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, any>) } : {};
      delete cards[req.params.token];
      const currentDefault = String(profile.get('paymentMethods.defaultCardToken') || '');
      const nextDefault = currentDefault === req.params.token ? (Object.keys(cards)[0] || '') : currentDefault;
      tx.set(profileRef, {
        paymentMethods: { cards, defaultCardToken: nextDefault },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { deleted: true };
  });

  app.post('/me/cards/:token/default', { schema: { tags: ['payments'], summary: 'Set the default saved Kashier card', ...secured, params: z.object({ token: z.string().min(8).max(200) }) } }, async (req) => {
    const user = requireUser(req);
    if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY) throw new AppError(503, 'payments_unavailable', 'Kashier card saving is not configured.');
    const url = `${tokenBase()}/v3/cards/tokens/${encodeURIComponent(req.params.token)}?merchantId=${encodeURIComponent(config.KASHIER_MERCHANT_ID)}&customerReference=${encodeURIComponent(user.uid)}`;
    const response = await fetch(url, { headers: { 'Kashier-Hash': tokenHash(user.uid), accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const body: any = await response.json().catch(() => ({}));
    if (!response.ok || body?.response?.paymentMethod?.card?.cardToken !== req.params.token) throw new AppError(404, 'card_not_found', 'This saved card does not belong to your account.');
    await userRef(db, user.uid).set({ paymentMethods: { defaultCardToken: req.params.token }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { defaultCardToken: req.params.token };
  });

  // Customer-owned wallet contacts are stored in users/{uid}, never in Kashier.
  const walletInput = z.object({
    provider: z.enum(['insta', 'orange', 'we', 'etisalat', 'vodafone']),
    phone: z.string().regex(/^01[0125]\d{8}$/, 'Enter a valid Egyptian mobile number.'),
    name: z.string().trim().min(2).max(100),
    isDefault: z.boolean().optional().default(false),
  });

  app.get('/me/wallets', { schema: { tags: ['payments'], summary: 'List this customer’s saved wallet contacts', ...secured } }, async (req) => {
    const user = requireUser(req);
    const snap = await userRef(db, user.uid).get();
    const stored = snap.get('paymentMethods.wallets');
    const wallets = stored && typeof stored === 'object' && !Array.isArray(stored)
      ? Object.entries(stored as Record<string, any>).filter(([id, value]) => id && value && typeof value === 'object' && value.id === id).map(([, value]) => value)
      : [];
    return { wallets: wallets.map((w: any) => ({ id: String(w.id), provider: String(w.provider), phone: String(w.phone), name: String(w.name), isDefault: w.isDefault === true, createdAt: w.createdAt ?? null })) };
  });

  app.post('/me/wallets', { schema: { tags: ['payments'], summary: 'Save or update a wallet contact for this customer', ...secured, body: walletInput } }, async (req) => {
    const user = requireUser(req);
    const input = walletInput.parse(req.body);
    const ref = userRef(db, user.uid);
    const id = randomUUID();
    const savedAt = now();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.get('paymentMethods.wallets');
      const wallets = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Record<string, any> : {};
      const same = Object.values(wallets).find((w: any) => w?.provider === input.provider && w?.phone === input.phone) as any;
      const walletId = same?.id || id;
      const next = Object.fromEntries(Object.entries(wallets).map(([key, value]: [string, any]) => [key, { ...value, ...(input.isDefault ? { isDefault: false } : {}) }]));
      next[walletId] = { id: walletId, provider: input.provider, phone: input.phone, name: input.name, isDefault: input.isDefault || (!Object.keys(next).length), createdAt: same?.createdAt ?? savedAt, updatedAt: savedAt };
      tx.set(ref, { paymentMethods: { wallets: next }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    const latest = await ref.get();
    const stored = latest.get('paymentMethods.wallets') || {};
    const wallet = Object.values(stored).find((w: any) => w?.provider === input.provider && w?.phone === input.phone) as any;
    return { saved: true, wallet: wallet ? { id: wallet.id, provider: wallet.provider, phone: wallet.phone, name: wallet.name, isDefault: wallet.isDefault === true } : null };
  });

  app.post('/me/wallets/:id/default', { schema: { tags: ['payments'], summary: 'Set the default saved wallet contact', ...secured, params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const ref = userRef(db, user.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.get('paymentMethods.wallets');
      const wallets = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, any>) } : {};
      if (!wallets[req.params.id]) throw notFound('Saved wallet');
      for (const [id, value] of Object.entries(wallets)) wallets[id] = { ...(value as Record<string, unknown>), isDefault: id === req.params.id };
      tx.set(ref, { paymentMethods: { wallets, defaultWalletId: req.params.id }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return { defaultWalletId: req.params.id };
  });

  app.delete('/me/wallets/:id', { schema: { tags: ['payments'], summary: 'Delete one of this customer’s saved wallet contacts', ...secured, params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const user = requireUser(req);
    const ref = userRef(db, user.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const stored = snap.get('paymentMethods.wallets');
      const wallets = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, any>) } : {};
      if (!wallets[req.params.id]) throw notFound('Saved wallet');
      const wasDefault = wallets[req.params.id]?.isDefault === true;
      delete wallets[req.params.id];
      if (wasDefault) {
        const first = Object.keys(wallets)[0];
        if (first) wallets[first] = { ...wallets[first], isDefault: true };
      }
      tx.update(ref, { 'paymentMethods.wallets': wallets, updatedAt: FieldValue.serverTimestamp() });
    });
    return { deleted: true };
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
