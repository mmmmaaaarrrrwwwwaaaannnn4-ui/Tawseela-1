import { POINTS } from '@fig/shared';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
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
export async function createKashierDirectIntent(config: any, order: Order, savedCard = false) {
  requireKashier(config);
  if (!config.PUBLIC_API_URL) throw unavailable('payment_callback_unavailable', 'PUBLIC_API_URL must be configured before online payments are enabled.');
  const mode = config.KASHIER_MODE as 'test' | 'live';
  const amount = Number(order.total).toFixed(2);
  const currency = String(config.CURRENCY || 'EGP').toUpperCase();
  const path = `/?payment=${config.KASHIER_MERCHANT_ID}.${order.id}.${amount}.${currency}${savedCard ? `.${order.uid}` : ''}`;
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


/** Start a private Egyptian wallet R2P attempt. No wallet number is written to the order. */
export async function initiateKashierWallet(
  config: any,
  db: Firestore,
  orderId: string,
  uid: string,
  walletPhone: string,
  now: number,
) {
  requireKashier(config);
  if (!config.PUBLIC_API_URL) {
    throw unavailable('payment_callback_unavailable', 'PUBLIC_API_URL must be configured before online payments are enabled.');
  }

  const phone = String(walletPhone || '').replace(/[\s()-]/g, '');
  if (!/^01[0125]\d{8}$/.test(phone)) {
    throw new AppError(400, 'invalid_wallet_phone', 'Enter a valid Egyptian mobile wallet number.');
  }

  const orderRef = db.collection(COL.orders).doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists || orderSnap.get('uid') !== uid) {
    throw new AppError(404, 'order_not_found', 'Order not found.');
  }
  if (orderSnap.get('payment.method') !== 'wallet') {
    throw new AppError(409, 'invalid_payment_method', 'This order is not configured for wallet payment.');
  }
  if (orderSnap.get('stage') === 'cancelled' || orderSnap.get('payment.status') === 'paid') {
    throw new AppError(409, 'order_not_payable', 'This order cannot accept a new payment.');
  }

  const amount = Number(orderSnap.get('total'));
  const currency = String(config.CURRENCY || 'EGP').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(409, 'invalid_payment_amount', 'This order has an invalid payment amount.');
  }

  const previousReference = String(orderSnap.get('payment.walletAttemptId') || '');
  if (previousReference) {
    const previous = await db.collection(COL.paymentAttempts).doc(previousReference).get();
    if (previous.exists && ['initiating', 'pending'].includes(String(previous.get('status')))) {
      return { status: 'PENDING' as const };
    }
  }

  const mode = config.KASHIER_MODE as 'test' | 'live';
  const reference = `PM-${Date.now()}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const attemptRef = db.collection(COL.paymentAttempts).doc(reference);
  const path = `/?payment=${config.KASHIER_MERCHANT_ID}.${reference}.${amount.toFixed(2)}.${currency}`;
  const hash = createHmac('sha256', config.KASHIER_PAYMENT_API_KEY).update(path).digest('hex');
  const base = config.PUBLIC_API_URL.replace(/\/$/, '');

  const alreadyInProgress = await db.runTransaction(async (tx) => {
    const latest = await tx.get(orderRef);
    if (!latest.exists || latest.get('uid') !== uid || latest.get('payment.status') === 'paid' || latest.get('stage') === 'cancelled') {
      throw new AppError(409, 'order_not_payable', 'This order cannot accept a new payment.');
    }

    const existingReference = String(latest.get('payment.walletAttemptId') || '');
    if (existingReference) {
      const existingRef = db.collection(COL.paymentAttempts).doc(existingReference);
      const existingSnap = await tx.get(existingRef);
      if (existingSnap.exists && ['initiating', 'pending'].includes(String(existingSnap.get('status')))) {
        return true;
      }
    }

    tx.create(attemptRef, {
      orderId,
      uid,
      reference,
      walletPhone: phone,
      amount: amount.toFixed(2),
      currency,
      provider: 'kashier_wallet',
      status: 'initiating',
      createdAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(orderRef, {
      'payment.walletAttemptId': reference,
      'payment.provider': 'kashier_wallet',
      'payment.status': 'awaiting_payment',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return false;
  });

  if (alreadyInProgress) return { status: 'PENDING' as const };

  try {
    const endpoint = mode === 'live'
      ? 'https://fep.kashier.io/v3/orders/'
      : 'https://test-fep.kashier.io/v3/orders/';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Kashier-Hash': hash, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        apiOperation: 'INITIATE_R2P',
        paymentMethod: { type: 'wallet' },
        order: { reference, amount, currency },
        customer: { mobilePhone: phone },
        interactionSource: 'ECOMMERCE',
        reconciliation: { webhookUrl: `${base}/v1/webhooks/kashier` },
        merchantId: config.KASHIER_MERCHANT_ID,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const result: any = await response.json().catch(() => ({}));
    const data = result?.response ?? result?.data?.response ?? result?.data ?? result;
    const status = String(data?.status ?? result?.status ?? '').toUpperCase();
    const systemOrderId = String(data?.order?.systemOrderId ?? data?.systemOrderId ?? '');
    // Kashier documents transactionResponseCode (for example k_4/k_5), not only responseCode.
    const code = String(
      data?.transactionResponseCode ??
      data?.responseCode ??
      data?.code ??
      result?.transactionResponseCode ??
      result?.responseCode ??
      result?.code ??
      '',
    ).toLowerCase();
    const providerMessage = String(
      data?.transactionResponseMessage?.en ??
      data?.messages?.en ??
      data?.message ??
      result?.message ??
      '',
    ).slice(0, 240);

    if (!response.ok || status !== 'SUCCESS' || !systemOrderId) {
      await attemptRef.update({
        status: 'failed',
        providerCode: code || null,
        providerMessage: providerMessage || null,
        providerHttpStatus: response.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new AppError(502, 'wallet_initiation_failed',
        code === 'k_5'
          ? 'This number is not registered with a supported wallet provider.'
          : code === 'k_4'
            ? 'Kashier accepted the wallet request but returned an incomplete payment reference. Contact support before retrying.'
            : providerMessage
              ? `Kashier rejected the wallet request: ${providerMessage}`
              : `Kashier could not send the wallet payment request (HTTP ${response.status}${code ? `, code ${code}` : ''}).`);
    }

    await attemptRef.update({
      status: 'pending',
      systemOrderId,
      transactionId: String(data?.transactionId ?? ''),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { status: 'PENDING' as const };
  } catch (err) {
    const latest = await attemptRef.get();
    if (latest.exists && latest.get('status') === 'initiating') {
      await attemptRef.update({
        status: 'pending',
        initiationUncertain: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    throw err;
  }
}

/** Reconcile an existing wallet R2P attempt; only a verified SUCCESS can mark the order paid. */
export async function reconcileKashierWallet(
  config: any,
  db: Firestore,
  orderId: string,
  uid: string,
  now: number,
) {
  requireKashier(config);
  const orderRef = db.collection(COL.orders).doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists || orderSnap.get('uid') !== uid) {
    throw new AppError(404, 'order_not_found', 'Order not found.');
  }

  const reference = String(orderSnap.get('payment.walletAttemptId') || '');
  if (!reference) return { status: 'NOT_STARTED' as const };

  const attemptRef = db.collection(COL.paymentAttempts).doc(reference);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists || attemptSnap.get('orderId') !== orderId || attemptSnap.get('uid') !== uid) {
    throw new AppError(409, 'wallet_attempt_not_found', 'Wallet payment attempt was not found.');
  }

  const current = String(attemptSnap.get('status') || '').toLowerCase();
  if (current === 'paid') return { status: 'SUCCESS' as const };
  if (current === 'failed') return { status: 'FAILURE' as const };

  const systemOrderId = String(attemptSnap.get('systemOrderId') || '');
  if (!systemOrderId) return { status: 'PENDING' as const };

  const mode = config.KASHIER_MODE as 'test' | 'live';
  const endpoint = mode === 'live' ? 'https://fep.kashier.io' : 'https://test-fep.kashier.io';
  const response = await fetch(`${endpoint}/v3/orders/${encodeURIComponent(systemOrderId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      apiOperation: 'RECONCILE_WALLET',
      paymentMethod: { type: 'wallet' },
      merchantId: config.KASHIER_MERCHANT_ID,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const result: any = await response.json().catch(() => ({}));
  const data = result?.response ?? result?.data?.response ?? result?.data ?? result;
  const status = String(data?.status ?? result?.status ?? '').toUpperCase();

  if (status === 'SUCCESS' && response.ok) {
    const reportedAmount = data?.totalCapturedAmount ?? data?.amount ?? data?.order?.amount;
    const expectedAmount = Number(attemptSnap.get('amount'));
    const expectedCurrency = String(attemptSnap.get('currency') || '').toUpperCase();
    const configuredCurrency = String(config.CURRENCY || 'EGP').toUpperCase();

    if (
      reportedAmount == null ||
      !Number.isFinite(Number(reportedAmount)) ||
      !Number.isFinite(expectedAmount) ||
      Math.abs(Number(reportedAmount) - expectedAmount) > 0.009 ||
      !expectedCurrency ||
      expectedCurrency !== configuredCurrency ||
      ((data?.currency ?? data?.order?.currency) != null &&
        String(data.currency ?? data.order.currency).toUpperCase() !== expectedCurrency)
    ) {
      throw new AppError(409, 'payment_mismatch', 'Kashier wallet payment details do not match this order.');
    }

    await applyWalletAttemptPaid(
      db,
      attemptRef,
      orderRef,
      reference,
      orderId,
      now,
      String(data?.transactionId ?? attemptSnap.get('transactionId') ?? reference),
    );
    return { status: 'SUCCESS' as const };
  }

  if (['FAILURE', 'FAILED'].includes(status)) {
    await attemptRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() });
    if (String(orderSnap.get('payment.walletAttemptId') || '') === reference &&
        orderSnap.get('payment.status') !== 'paid') {
      await orderRef.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
    }
    return { status: 'FAILURE' as const };
  }

  if (!response.ok && status !== 'PENDING') {
    throw new AppError(502, 'wallet_reconcile_failed', 'Could not verify the wallet payment with Kashier.');
  }

  await attemptRef.update({ status: 'pending', updatedAt: FieldValue.serverTimestamp() });
  return { status: 'PENDING' as const };
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

async function applyWalletAttemptPaid(
  db: Firestore,
  attemptRef: FirebaseFirestore.DocumentReference,
  orderRef: FirebaseFirestore.DocumentReference,
  reference: string,
  orderId: string,
  now: number,
  transactionId: string,
) {
  await db.runTransaction(async (tx) => {
    const [attempt, order] = await Promise.all([
      tx.get(attemptRef),
      tx.get(orderRef),
    ]);

    if (!attempt.exists || !order.exists) return;
    if (attempt.get('orderId') !== orderId ||
        attempt.get('provider') !== 'kashier_wallet' ||
        attempt.get('uid') !== order.get('uid')) {
      throw new AppError(409, 'wallet_attempt_mismatch', 'Kashier wallet attempt does not match its order.');
    }

    if (attempt.get('status') !== 'paid') {
      tx.update(attemptRef, {
        status: 'paid',
        transactionId,
        paidAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // A superseded attempt may have received money, but must not pay this order.
    if (String(order.get('payment.walletAttemptId') || '') !== reference) {
      tx.update(attemptRef, {
        manualReview: 'Payment succeeded for a superseded wallet attempt; refund review required.',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (order.get('payment.status') === 'paid' ||
        order.get('payment.status') === 'refunded') return;

    const cancelled = order.get('stage') === 'cancelled';
    const awardNow = !cancelled && order.get('pointsAwarded') !== true;

    tx.update(orderRef, {
      'payment.status': 'paid',
      'payment.paidAt': now,
      'payment.lastEvent': transactionId,
      ...(cancelled
        ? { 'payment.manualReview': 'Payment completed after order cancellation; refund review required.' }
        : { live: false, kitchenAt: now }),
      ...(awardNow ? { pointsAwarded: true } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (awardNow) {
      award(tx, db, order.get('uid') as string,
        Math.floor(order.get('subtotal') as number) * POINTS.perDollar);
    }
  });
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

/** Verify a Direct API card order from Kashier's reconciliation records (never trust WebView redirects). */
export async function verifyKashierDirectOrder(config: any, db: Firestore, orderId: string, now: number) {
  requireKashier(config);
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const response = await fetch(`${apiBase(config.KASHIER_MODE)}/v3/payment/orders?search=${encodeURIComponent(orderId)}&page=1&limit=20`, {
    headers: { Authorization: config.KASHIER_SECRET_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new AppError(502, 'kashier_verify_failed', 'Could not verify the card payment with Kashier.');
  const rows = Array.isArray(result?.data) ? result.data : [];
  const data = rows.find((x: any) => String(x?.merchantOrderId ?? '') === orderId);
  if (!data) return;
  // The reconciliation list response does not expose amount/currency in its documented shape.
  // The amount is already bound to this merchant reference by the server-generated HMAC.
  if (data.amount != null && Math.abs(Number(data.amount) - Number(snap.get('total'))) > 0.009) {
    throw new AppError(409, 'payment_mismatch', 'Kashier payment amount does not match this order.');
  }
  if (data.currency != null && String(data.currency).toUpperCase() !== String(config.CURRENCY || 'EGP').toUpperCase()) {
    throw new AppError(409, 'payment_mismatch', 'Kashier payment currency does not match this order.');
  }
  const status = String(data.status ?? '').toUpperCase();
  if (status === 'CAPTURED') await applyPaid(db, orderId, now, String(data.transactions?.find((x: any) => x.operation === 'pay')?.transactionId ?? data.orderId ?? orderId));
  else if (['FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)) {
    if (snap.get('payment.status') !== 'paid') await ref.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
  }
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
  const merchantReference = String(data.merchantOrderId ?? data.orderReference ?? '');
  if (!merchantReference) return;

  // Wallet webhooks use the private PM reference, not the public order ID.
  const attemptRef = db.collection(COL.paymentAttempts).doc(merchantReference);
  const attemptSnap = await attemptRef.get();

  if (attemptSnap.exists) {
    const orderId = String(attemptSnap.get('orderId') || '');
    const orderRef = db.collection(COL.orders).doc(orderId);
    const orderSnap = await orderRef.get();

    if (
      !orderId ||
      !orderSnap.exists ||
      attemptSnap.get('provider') !== 'kashier_wallet' ||
      attemptSnap.get('uid') !== orderSnap.get('uid')
    ) {
      throw new AppError(409, 'wallet_attempt_mismatch', 'Kashier wallet attempt does not match its order.');
    }

    const amount = Number(data.amount);
    const expectedAmount = Number(attemptSnap.get('amount'));
    const currency = String(data.currency ?? '').toUpperCase();
    const expectedCurrency = String(attemptSnap.get('currency') ?? '').toUpperCase();

    if (
      !Number.isFinite(amount) ||
      !Number.isFinite(expectedAmount) ||
      Math.abs(amount - expectedAmount) > 0.009 ||
      !currency ||
      currency !== expectedCurrency ||
      currency !== String(config.CURRENCY || 'EGP').toUpperCase()
    ) {
      throw new AppError(409, 'payment_mismatch', 'Kashier wallet webhook amount or currency does not match the attempt.');
    }

    const status = String(data.status ?? '').toUpperCase();
    if (status === 'SUCCESS') {
      const incomingSystemId = String(data.kashierOrderId ?? '');
      const savedSystemId = String(attemptSnap.get('systemOrderId') ?? '');
      if (incomingSystemId && savedSystemId && incomingSystemId !== savedSystemId) {
        throw new AppError(409, 'wallet_transaction_mismatch', 'Kashier wallet transaction does not match the attempt.');
      }

      await applyWalletAttemptPaid(
        db,
        attemptRef,
        orderRef,
        merchantReference,
        orderId,
        now,
        String(data.transactionId ?? merchantReference),
      );
    } else if (['FAILURE', 'FAILED'].includes(status)) {
      if (attemptSnap.get('status') !== 'paid') {
        await attemptRef.update({ status: 'failed', updatedAt: FieldValue.serverTimestamp() });
        if (
          String(orderSnap.get('payment.walletAttemptId') || '') === merchantReference &&
          orderSnap.get('payment.status') !== 'paid'
        ) {
          await orderRef.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
        }
      }
    }
    // PENDING and unknown statuses never mark an order as paid or failed.
    return;
  }

  // Preserve the existing card/session webhook flow.
  const orderId = merchantReference;
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) return;

  if (
    Math.abs(Number(data.amount) - Number(snap.get('total'))) > 0.009 ||
    String(data.currency).toUpperCase() !== String(config.CURRENCY || 'EGP').toUpperCase()
  ) {
    throw new AppError(409, 'payment_mismatch', 'Kashier webhook amount or currency does not match the order.');
  }

  const status = String(data.status).toUpperCase();
  if (status === 'SUCCESS') {
    await applyPaid(db, orderId, now, String(data.transactionId ?? ''));
  } else if (['FAILURE', 'FAILED'].includes(status)) {
    await ref.update({ 'payment.status': 'failed', updatedAt: FieldValue.serverTimestamp() });
  }
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
