import { createHmac, timingSafeEqual, createDecipheriv } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { AppError, badRequest, notFound } from '../../lib/errors';

const eventSchema = z.object({
  eventId: z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/),
  type: z.enum(['inventory.snapshot', 'inventory.delta', 'product.upsert', 'order.acknowledged', 'order.status']),
  storeId: z.string().min(1).max(64),
  occurredAt: z.number().int().optional(),
  orderId: z.string().min(1).max(64).optional(),
  externalStatus: z.string().max(80).optional(),
  items: z.array(z.object({
    sku: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,100}$/),
    dishId: z.string().max(64).optional(),
    name: z.string().max(120).optional(),
    barcode: z.string().max(80).optional(),
    quantity: z.number().int().min(-100000).max(100000),
    price: z.number().min(0).max(100000).optional(),
    currency: z.string().length(3).optional(),
  })).max(1000).optional(),
}).superRefine((event, ctx) => {
  const skus = (event.items ?? []).map((item) => item.sku);
  if (new Set(skus).size !== skus.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'An event may include each SKU only once.' });
});

function equalHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function decryptSecret(data: Record<string, unknown>, rawKey?: string) {
  if (!rawKey || !/^[a-f0-9]{64}$/i.test(rawKey)) throw new AppError(503, 'pos_encryption_unavailable', 'POS encryption is not configured.');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(rawKey, 'hex'), Buffer.from(String(data.secretIv), 'base64'));
  decipher.setAuthTag(Buffer.from(String(data.secretTag), 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(String(data.secretCiphertext), 'base64')), decipher.final()]).toString('utf8');
}

const posWebhookRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config, now } = app.deps;
  app.post('/:connectionId/events', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: { hide: true, params: z.object({ connectionId: z.string().min(1).max(100) }), body: eventSchema },
  }, async (req, reply) => {
    const timestamp = String(req.headers['x-tawseela-timestamp'] || '');
    const suppliedSignature = String(req.headers['x-tawseela-signature'] || '');
    const timestampMs = Number(timestamp);
    if (!/^\d{13}$/.test(timestamp) || !Number.isFinite(timestampMs) || Math.abs(now() - timestampMs) > 5 * 60_000) {
      throw new AppError(401, 'pos_timestamp_invalid', 'POS webhook timestamp is missing, expired or invalid.');
    }
    const ref = db.collection('posConnections').doc(req.params.connectionId);
    const connection = await ref.get();
    if (!connection.exists || connection.get('enabled') !== true) throw notFound('POS connection');
    const data = connection.data()!;
    const secret = decryptSecret(data, config.POS_ENCRYPTION_KEY);
    const body = JSON.stringify(req.body);
    const expected = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
    if (!equalHex(expected, suppliedSignature)) throw new AppError(401, 'pos_signature_invalid', 'POS webhook signature is invalid.');
    const event = eventSchema.parse(req.body);
    if (event.storeId !== data.storeId) throw new AppError(403, 'pos_store_mismatch', 'POS event store does not match this connection.');
    if (['inventory.snapshot', 'inventory.delta', 'product.upsert'].includes(event.type) && !(data.capabilities as string[]).includes('inventory.write')) {
      throw new AppError(403, 'pos_capability_missing', 'This POS connection is not allowed to update inventory.');
    }
    if (['order.acknowledged', 'order.status'].includes(event.type) && !(data.capabilities as string[]).includes('orders.status')) {
      throw new AppError(403, 'pos_capability_missing', 'This POS connection is not allowed to send order status events.');
    }
    if (['inventory.snapshot', 'inventory.delta', 'product.upsert'].includes(event.type) && !event.items?.length) throw badRequest('Product and inventory events must include at least one item.');
    const eventRef = db.collection('posWebhookEvents').doc(`${req.params.connectionId}__${event.eventId}`);
    const seen = await eventRef.get();
    if (seen.exists) return reply.code(200).send({ accepted: true, replay: true });

    await db.runTransaction(async (tx) => {
      const duplicate = await tx.get(eventRef);
      if (duplicate.exists) return;
      if (event.type === 'inventory.snapshot' || event.type === 'inventory.delta' || event.type === 'product.upsert') {
        const items = event.items ?? [];
        const inventoryRefs = items.map((item) => db.collection('posInventory').doc(`${event.storeId}__${item.sku}`));
        const inventorySnaps = event.type.startsWith('inventory.') ? await Promise.all(inventoryRefs.map((inventoryRef) => tx.get(inventoryRef))) : [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const productRef = db.collection('posProducts').doc(`${req.params.connectionId}__${item.sku}`);
          const inventoryRef = inventoryRefs[index];
          const current = inventorySnaps[index];
          const currentQty = Number(current?.get('onHand') ?? 0);
          const eventTime = event.occurredAt ?? now();
          const currentEventTime = Number(current?.get('sourceOccurredAt') ?? 0);
          const stale = event.type.startsWith('inventory.') && currentEventTime > eventTime;
          const nextQty = event.type === 'inventory.delta' ? currentQty + item.quantity : item.quantity;
          if (event.type.startsWith('inventory.') && nextQty < 0) throw new AppError(409, 'pos_inventory_negative', `Inventory for SKU ${item.sku} would become negative.`);
          if (event.type === 'product.upsert' || item.name || item.barcode || item.price !== undefined || item.dishId) {
            tx.set(productRef, {
              connectionId: req.params.connectionId, storeId: event.storeId, sku: item.sku,
              ...(item.dishId ? { dishId: item.dishId } : {}),
              ...(item.name ? { name: item.name } : {}),
              ...(item.barcode ? { barcode: item.barcode } : {}),
              ...(item.price !== undefined ? { price: item.price, currency: item.currency || 'EGP' } : {}),
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
          if (event.type.startsWith('inventory.') && !stale) {
            tx.set(inventoryRef, {
              connectionId: req.params.connectionId, storeId: event.storeId, sku: item.sku,
              onHand: nextQty, updatedAt: FieldValue.serverTimestamp(),
              sourceEventId: event.eventId, sourceOccurredAt: eventTime,
            }, { merge: true });
          }
        }
      } else if (event.type === 'order.acknowledged' || event.type === 'order.status') {
        if (!event.orderId) throw badRequest('Order status events must include orderId.');
        tx.set(db.collection('posOrderEvents').doc(`${req.params.connectionId}__${event.eventId}`), {
          connectionId: req.params.connectionId, storeId: event.storeId, orderId: event.orderId,
          type: event.type, externalStatus: event.externalStatus ?? 'acknowledged',
          occurredAt: event.occurredAt ?? now(), receivedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.create(eventRef, {
        connectionId: req.params.connectionId, storeId: event.storeId, type: event.type,
        receivedAt: FieldValue.serverTimestamp(), occurredAt: event.occurredAt ?? null,
      });
      tx.update(ref, { status: 'connected', lastSeenAt: FieldValue.serverTimestamp(), lastError: null, updatedAt: FieldValue.serverTimestamp() });
    });
    return reply.code(202).send({ accepted: true, replay: false });
  });
};

export default posWebhookRoutes;
