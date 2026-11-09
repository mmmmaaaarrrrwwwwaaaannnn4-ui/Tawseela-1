import type { FastifyPluginAsync } from 'fastify';
import { applyKashierWebhook } from './kashier';

const webhookRoutes: FastifyPluginAsync = async (app) => {
  const { db, config, now } = app.deps;
  app.get('/payments/kashier/return', { schema: { hide: true } }, async (req, reply) => {
    const orderId = String((req.query as any)?.orderId ?? '');
    if (!orderId || orderId.length > 64) return reply.code(400).send('Invalid order reference');
    return reply.redirect(`tawseela://payment-return?orderId=${encodeURIComponent(orderId)}`);
  });
  app.post('/webhooks/kashier', { schema: { hide: true }, config: { rateLimit: false } }, async (req, reply) => {
    try {
      await applyKashierWebhook(config, db, req.body, req.headers['x-kashier-signature'] as string | undefined, now());
      return reply.code(200).send();
    } catch (err: any) {
      req.log.warn({ err }, 'Kashier webhook rejected');
      return reply.code(err?.status === 409 ? 409 : 400).send();
    }
  });
};
export default webhookRoutes;
