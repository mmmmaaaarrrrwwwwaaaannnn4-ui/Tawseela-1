import { FieldValue } from 'firebase-admin/firestore';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { ApiError } from '@fig/shared';
import { requireAdmin } from '../../plugins/auth';

const errors = { 400: ApiError, 401: ApiError, 403: ApiError, 502: ApiError };
const input = z.object({
  title: z.string().trim().min(2).max(90),
  body: z.string().trim().min(2).max(500),
  audience: z.enum(['all', 'customers', 'team']).default('customers'),
  category: z.enum(['general', 'offer', 'important']).default('general'),
  sound: z.boolean().default(true),
});
const isExpoToken = (value: unknown): value is string =>
  typeof value === 'string' && /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(value);

const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, now } = app.deps;

  app.post(
    '/notifications/send',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        summary: 'Send a push notification to registered Tawseela devices',
        body: input,
        response: { 200: z.object({ campaignId: z.string(), audienceCount: z.number(), deviceCount: z.number(), sent: z.number(), failed: z.number() }), ...errors },
      },
    },
    async (req, reply) => {
      const admin = requireAdmin(req);
      const payload = input.parse(req.body);
      const users = await db.collection(COL.users).limit(5000).get();
      const recipients = users.docs.filter((doc) => {
        if (doc.get('disabled') === true) return false;
        const role = String(doc.get('role') || 'user');
        if (payload.audience === 'customers') return role === 'user';
        if (payload.audience === 'team') return role !== 'user';
        return true;
      });
      const tokens = [...new Set(recipients.flatMap((doc) => {
        const value = doc.get('pushTokens');
        return Array.isArray(value) ? value.filter(isExpoToken) : [];
      }))];

      const campaign = db.collection(COL.notifications).doc();
      await campaign.set({
        title: payload.title,
        body: payload.body,
        audience: payload.audience,
        category: payload.category,
        sound: payload.sound,
        status: 'sending',
        audienceCount: recipients.length,
        deviceCount: tokens.length,
        sent: 0,
        failed: 0,
        createdBy: admin.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      let sent = 0;
      let failed = 0;
      for (let offset = 0; offset < tokens.length; offset += 100) {
        const messages = tokens.slice(offset, offset + 100).map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          sound: payload.sound ? 'default' : undefined,
          priority: payload.category === 'important' ? 'high' : 'default',
          channelId: 'default',
          data: { type: 'admin_broadcast', category: payload.category, campaignId: campaign.id },
        }));
        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json', 'accept-encoding': 'gzip, deflate' },
            body: JSON.stringify(messages),
            signal: AbortSignal.timeout(20_000),
          });
          const result: any = await response.json().catch(() => null);
          if (!response.ok || !Array.isArray(result?.data)) {
            failed += messages.length;
            req.log.error({ status: response.status, result }, 'Expo push batch failed');
            continue;
          }
          for (const ticket of result.data) {
            if (ticket?.status === 'ok') sent += 1;
            else failed += 1;
          }
        } catch (err) {
          failed += messages.length;
          req.log.error({ err }, 'Expo push request failed');
        }
      }

      const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial';
      await campaign.update({ status, sent, failed, completedAt: FieldValue.serverTimestamp() });
      return reply.send({ campaignId: campaign.id, audienceCount: recipients.length, deviceCount: tokens.length, sent, failed });
    },
  );

  app.get(
    '/notifications/history',
    {
      schema: {
        summary: 'Recent admin push campaigns',
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
      },
    },
    async (req) => {
      const snap = await db.collection(COL.notifications).orderBy('createdAt', 'desc').limit(req.query.limit).get();
      return {
        campaigns: snap.docs.map((doc) => {
          const value = doc.data();
          return {
            id: doc.id,
            title: String(value.title || ''),
            body: String(value.body || ''),
            audience: String(value.audience || 'customers'),
            category: String(value.category || 'general'),
            status: String(value.status || 'unknown'),
            audienceCount: Number(value.audienceCount || 0),
            deviceCount: Number(value.deviceCount || 0),
            sent: Number(value.sent || 0),
            failed: Number(value.failed || 0),
            createdAt: value.createdAt?.toMillis?.() ?? null,
          };
        }),
      };
    },
  );
};

export default notificationRoutes;
