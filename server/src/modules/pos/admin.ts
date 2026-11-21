import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { COL } from '../../lib/collections';
import { AppError, badRequest, conflict, notFound, unavailable } from '../../lib/errors';
import { orderRef, toOrder } from '../orders/service';

const capabilities = z.enum(['catalog.pull', 'inventory.read', 'inventory.write', 'orders.push', 'orders.status', 'receipts.print']);
const connectionInput = z.object({
  name: z.string().trim().min(2).max(80),
  provider: z.enum(['custom_webhook', 'local_bridge']),
  storeId: z.string().min(1).max(64),
  webhookUrl: z.url().max(2048).optional(),
  capabilities: z.array(capabilities).min(1).max(6),
  enabled: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.provider === 'custom_webhook' && !v.webhookUrl) ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'A webhook URL is required for cloud webhook connections.' });
  if (v.provider === 'local_bridge' && v.webhookUrl) ctx.addIssue({ code: 'custom', path: ['webhookUrl'], message: 'Local bridge connections do not use a public webhook URL.' });
});
const idParams = z.object({ id: z.string().min(1).max(100) });

function encryptionKey(value?: string) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw unavailable('pos_encryption_unavailable', 'POS_ENCRYPTION_KEY must be configured as 64 hexadecimal characters before POS connections can be saved.');
  return Buffer.from(value, 'hex');
}
function encryptSecret(secret: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { secretCiphertext: ciphertext.toString('base64'), secretIv: iv.toString('base64'), secretTag: cipher.getAuthTag().toString('base64') };
}
function decryptSecret(data: Record<string, unknown>, key: Buffer) {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(String(data.secretIv), 'base64'));
  decipher.setAuthTag(Buffer.from(String(data.secretTag), 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(String(data.secretCiphertext), 'base64')), decipher.final()]).toString('utf8');
}
function safeConnection(id: string, data: Record<string, any>) {
  return {
    id, name: data.name, provider: data.provider, storeId: data.storeId,
    webhookUrl: data.webhookUrl ?? null, capabilities: data.capabilities ?? [],
    enabled: data.enabled === true, createdAt: data.createdAt ?? null, updatedAt: data.updatedAt ?? null,
    lastSeenAt: data.lastSeenAt ?? null, lastError: data.lastError ?? null,
  };
}
function signature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex');
}
function equalHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

const posAdminRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config, now } = app.deps;
  const connections = db.collection('posConnections');
  const jobs = db.collection('posDispatchJobs');

  app.get('/connections', { schema: { tags: ['pos'], summary: 'List POS connections' } }, async () => {
    const snap = await connections.orderBy('createdAt', 'desc').limit(100).get();
    return { connections: snap.docs.map((d) => safeConnection(d.id, d.data())) };
  });

  app.post('/connections', { schema: { tags: ['pos'], summary: 'Create a capability-based POS connector', body: connectionInput } }, async (req, reply) => {
    const input = connectionInput.parse(req.body);
    const store = await db.collection(COL.brands).doc(input.storeId).get();
    if (!store.exists) throw badRequest('The selected kitchen/store does not exist.');
    const key = encryptionKey(config.POS_ENCRYPTION_KEY);
    const id = randomUUID();
    const sharedSecret = randomBytes(32).toString('base64url');
    const encrypted = encryptSecret(sharedSecret, key);
    const data = {
      ...input, ...encrypted, status: 'pending', createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), lastSeenAt: null, lastError: null,
    };
    await connections.doc(id).create(data);
    return reply.code(201).send({ connection: safeConnection(id, data), sharedSecret });
  });

  app.delete('/connections/:id', { schema: { tags: ['pos'], summary: 'Disable and remove a POS connection', params: idParams } }, async (req) => {
    const ref = connections.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw notFound('POS connection');
    await ref.update({ enabled: false, secretCiphertext: FieldValue.delete(), secretIv: FieldValue.delete(), secretTag: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    return { deleted: true };
  });

  app.post('/connections/:id/rotate-secret', { schema: { tags: ['pos'], summary: 'Rotate a POS webhook secret', params: idParams } }, async (req) => {
    const ref = connections.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) throw notFound('POS connection');
    const key = encryptionKey(config.POS_ENCRYPTION_KEY);
    const sharedSecret = randomBytes(32).toString('base64url');
    await ref.update({ ...encryptSecret(sharedSecret, key), updatedAt: FieldValue.serverTimestamp(), status: 'pending' });
    return { sharedSecret };
  });

  app.post('/connections/:id/dispatch-order', { schema: { tags: ['pos'], summary: 'Dispatch one order to a connected POS', params: idParams, body: z.object({ orderId: z.string().min(1).max(64) }) } }, async (req) => {
    const ref = connections.doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists || snap.get('enabled') !== true) throw notFound('Enabled POS connection');
    const data = snap.data()!;
    if (data.provider !== 'custom_webhook' || !data.webhookUrl) throw conflict('pos_transport_unavailable', 'This connection uses a local bridge; cloud webhook dispatch is not available for it yet.');
    if (!(data.capabilities as string[]).includes('orders.push')) throw conflict('pos_capability_missing', 'This POS connection does not advertise order dispatch.');
    const orderSnap = await orderRef(db, req.body.orderId).get();
    if (!orderSnap.exists) throw notFound('Order');
    const order = toOrder(orderSnap);
    if (order.stage === 'cancelled') throw conflict('order_cancelled', 'Cancelled orders cannot be sent to a POS.');
    if (!order.locations?.restaurants?.some((r) => r.id === data.storeId)) throw conflict('pos_store_mismatch', 'This order does not belong to the selected kitchen/store.');
    const jobId = `${req.params.id}__${order.id}`;
    const jobRef = jobs.doc(jobId);
    const existing = await jobRef.get();
    if (existing.exists && existing.get('status') === 'sent') return { jobId, status: 'sent', replay: true };
    const key = encryptionKey(config.POS_ENCRYPTION_KEY);
    const secret = decryptSecret(data, key);
    const eventId = randomUUID();
    const timestamp = String(now());
    const payload = {
      eventId, type: 'order.created', sentAt: Number(timestamp), storeId: data.storeId,
      order: {
        id: order.id, number: order.no, createdAt: order.placedAt, mode: order.mode,
        customer: { name: order.customer.name, phone: order.customer.phone },
        address: order.address ? { label: order.address.tag, line1: order.address.l1, line2: order.address.l2, note: order.address.note, latitude: order.address.latitude, longitude: order.address.longitude } : null,
        items: order.items.map((item) => ({ sku: item.id, name: item.name, quantity: item.q, unitPrice: item.unit, options: item.meta })),
        subtotal: order.subtotal, deliveryFee: order.fee, total: order.total, currency: config.CURRENCY || 'EGP',
        payment: { method: order.payment.method, status: order.payment.status }, note: order.note,
      },
    };
    const body = JSON.stringify(payload);
    const sig = signature(secret, timestamp, body);
    await jobRef.set({ connectionId: req.params.id, orderId: order.id, eventId, status: 'sending', attempts: FieldValue.increment(1), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      const response = await fetch(String(data.webhookUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tawseela-timestamp': timestamp, 'x-tawseela-signature': sig, 'x-tawseela-event-id': eventId },
        body, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`POS endpoint returned HTTP ${response.status}`);
      await jobRef.set({ status: 'sent', responseStatus: response.status, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await ref.update({ status: 'connected', lastSeenAt: FieldValue.serverTimestamp(), lastError: null, updatedAt: FieldValue.serverTimestamp() });
      return { jobId, status: 'sent', replay: false };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : 'POS dispatch failed';
      await jobRef.set({ status: 'failed', lastError: message, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await ref.update({ status: 'error', lastError: message, updatedAt: FieldValue.serverTimestamp() });
      throw new AppError(502, 'pos_dispatch_failed', 'Could not deliver this order to the POS. The dispatch can be retried safely.');
    }
  });

  app.get('/jobs', { schema: { tags: ['pos'], summary: 'Recent POS dispatch jobs', querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }) } }, async (req) => {
    const snap = await jobs.orderBy('updatedAt', 'desc').limit(req.query.limit).get();
    return { jobs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
  });
};

export default posAdminRoutes;
