import { POINTS } from '@fig/shared';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { COL } from '../../lib/collections';
import { AppError, unavailable } from '../../lib/errors';
import type { AuthUser } from '../../plugins/auth';
import type { Order } from '@fig/shared';
import { award } from '../me/service';

const apiBase = (mode: 'test' | 'live') => mode === 'live' ? 'https://api.kashier.io' : 'https://test-api.kashier.io';
export function requireKashier(config: { KASHIER_MERCHANT_ID?: string; KASHIER_PAYMENT_API_KEY?: string; KASHIER_SECRET_KEY?: string }) {
  if (!config.KASHIER_MERCHANT_ID || !config.KASHIER_PAYMENT_API_KEY || !config.KASHIER_SECRET_KEY) {
    throw unavailable('payments_unavailable', 'Kashier is not configured on the server.');
  }
}

export async function createKashierSession(config: any, order: Order, user: AuthUser) {
  requireKashier(config);
  if (!config.PUBLIC_API_URL) throw unavailable('payment_callback_unavailable', 'PUBLIC_API_URL must be configured before online payments are enabled.');
  const mode = config.KASHIER_MODE as 'test' | 'live';
  const merchantRedirect = encodeURIComponent(`${config.PUBLIC_API_URL.replace(/\/$/, '')}/v1/payments/kashier/return?orderId=${encodeURIComponent(order.id)}`);
  const body = {
    expireAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    maxFailureAttempts: 3,
    paymentType: 'credit',
    amount: Number(order.total).toFixed(2),
    currency: config.CURRENCY || 'EGP',
    order: order.id,
    merchantRedirect,
    display: 'ar',
    type: 'one-time',
    allowedMethods: 'card,wallet',
    merchantId: config.KASHIER_MERCHANT_ID,
    failureRedirect: true,
    description: `Tawseela order ${order.no}`.slice(0, 119),
    customer: { email: user.email || order.customer.email || 'customer@tawseela.app', reference: user.uid },
    interactionSource: 'ECOMMERCE',
    enable3DS: true,
    serverWebhook: `${config.PUBLIC_API_URL.replace(/\/$/, '')}/v1/webhooks/kashier`,
  };
  const response = await fetch(`${apiBase(mode)}/v3/payment/sessions`, {
    method: 'POST',
    headers: { Authorization: config.KASHIER_SECRET_KEY, 'api-key': config.KASHIER_PAYMENT_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data.sessionUrl || !data._id) {
    throw new AppError(502, 'kashier_session_failed', 'Kashier could not create a checkout session.');
  }
  return { sessionId: String(data._id), sessionUrl: String(data.sessionUrl) };
}



/** Create a Direct API payment intent. Amount and order reference always come from Firestore. */
export async function createKashierDirectIntent(config: any, order: Order) {
  requireKashier(config);
  if (!config.PUBLIC_API_URL) throw unavailable('payment_callback_unavailable', 'PUBLIC_API_URL must be configured before online payments are enabled.');
  const mode = config.KASHIER_MODE as 'test' | 'live';
  const amount = Number(order.total).toFixed(2);
  const currency = String(config.CURRENCY || 'EGP').toUpperCase();
  const path = `/?payment=${config.KASHIER_MERCHANT_ID}.${order.id}.${amount}.${currency}`;
  const hash = createHmac('sha256', config.KASHIER_PAYMENT_API_KEY).update(path).digest('hex');
  const base = config.PUBLIC_API_URL.replace(/\/$/, '');
  return {
    hash,
    endpoint: mode === 'live' ? 'https://fep.kashier.io/v3/orders/' : 'https://test-fep.kashier.io/v3/orders/',
    merchantId: config.KASHIER_MERCHANT_ID,
    reference: order.id,
    amount,
    currency,
    customerReference: order.uid,
    webhookUrl: `${base}/v1/webhooks/kashier`,
    merchantRedirect: encodeURIComponent(`${base}/v1/payments/kashier/return?orderId=${encodeURIComponent(order.id)}`),
  };
}

function safeEqualHex(a: string, b: string) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), 'hex'), Buffer.from(b.toLowerCase(), 'hex'));
}

export function verifyKashierWebhook(payload: any, signature: string | undefined, paymentApiKey: string) {
  const data = payload?.data;
  const keys = data?.signatureKeys;
  if (!data || !Array.isArray(keys) || !keys.every((k: unknown) => typeof k === 'string') || !signature) return false;
  const canonical = [...keys].sort().map((key: string) => `${key}=${encodeURIComponent(data[key] == null ? 'null' : String(data[key]))}`).join('&');
  const expected = createHmac('sha256', paymentApiKey).update(canonical).digest('hex');
  return safeEqualHex(expected, signature);
}

async function applyPaid(db: Firestore, orderId: string, now: number, eventId?: string) {
  const ref = db.collection(COL.orders).doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    if (snap.get('payment.status') === 'paid' || snap.get('payment.status') === 'refunded') return;
    const cancelled = snap.get('stage') === 'cancelled';
    const awardNow = !cancelled && snap.get('pointsAwarded') !== true;
    tx.update(ref, {
      'payment.status': 'paid', 'payment.paidAt': now,
      ...(eventId ? { 'payment.lastEvent': eventId } : {}),
      ...(cancelled ? { 'payment.manualReview': 'Payment completed after order cancellation; refund review required.' } : { live: false, kitchenAt: now }),
      ...(awardNow ? { pointsAwarded: true } : {}), updatedAt: FieldValue.serverTimestamp(),
    });
    if (awardNow) award(tx, db, snap.get('uid') as string, Math.floor(snap.get('subtotal') as number) * POINTS.perDollar);
  });
}

export async function verifyKashierSession(config: any, db: Firestore, orderId: string, now: number) {
  requireKashier(config);
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  const sessionId = snap.get('payment.kashierSessionId') as string | undefined;
  if (!snap.exists || !sessionId) return;
  const response = await fetch(`${apiBase(config.KASHIER_MODE)}/v3/payment/sessions/${encodeURIComponent(sessionId)}/payment`, {
    headers: { Authorization: config.KASHIER_SECRET_KEY }, signal: AbortSignal.timeout(15_000),
  });
  const result: any = await response.json().catch(() => ({}));
  const data = result?.data ?? result;
  if (!response.ok) throw new AppError(502, 'kashier_verify_failed', 'Could not verify the payment with Kashier.');
  const amount = Number(data.amount);
  if (String(data.merchantOrderId ?? data.order) !== orderId || Math.abs(amount - Number(snap.get('total'))) > 0.009 || String(data.currency).toUpperCase() !== String(config.CURRENCY).toUpperCase()) {
    throw new AppError(409, 'payment_mismatch', 'Kashier payment details do not match this order.');
  }
  if (['SUCCESS', 'PAID', 'CAPTURED'].includes(String(data.status).toUpperCase())) await applyPaid(db, orderId, now, String(data.transactionId ?? sessionId));
  else if (['FAILURE', 'FAILED', 'DECLINED'].includes(String(data.status).toUpperCase())) await ref.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
}

export async function applyKashierWebhook(config: any, db: Firestore, payload: any, signature: string | undefined, now: number) {
  if (!config.KASHIER_PAYMENT_API_KEY || !verifyKashierWebhook(payload, signature, config.KASHIER_PAYMENT_API_KEY)) {
    throw new AppError(400, 'invalid_signature', 'Invalid Kashier webhook signature.');
  }
  const data = payload.data;
  const orderId = String(data.merchantOrderId ?? data.order ?? '');
  if (!orderId) return;
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  if (Math.abs(Number(data.amount) - Number(snap.get('total'))) > 0.009 || String(data.currency).toUpperCase() !== String(config.CURRENCY).toUpperCase()) {
    throw new AppError(409, 'payment_mismatch', 'Kashier webhook amount or currency does not match the order.');
  }
  const status = String(data.status).toUpperCase();
  if (status === 'SUCCESS') await applyPaid(db, orderId, now, String(data.transactionId ?? ''));
  else if (['FAILURE', 'FAILED'].includes(status)) await ref.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
  // PENDING is not proof of payment; keep the order awaiting_payment.
}

/** Kashier refunds are deliberately not auto-marked as refunded here; use the Kashier dashboard until a refund API workflow is configured. */
export async function refundOrder(_config: any, db: Firestore, orderId: string): Promise<boolean> {
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('payment.method') === 'cash' || snap.get('payment.status') !== 'paid') return false;
  await ref.update({
    'payment.refundStatus': 'manual_required',
    'payment.manualReview': 'Issue this refund from the Kashier dashboard and reconcile it here.',
    updatedAt: FieldValue.serverTimestamp(),
  });
  return false;
}
