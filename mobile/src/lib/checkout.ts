import type { CreateOrder, CreateOrderResult, Order, PayMethod } from '@fig/shared';

import { useApp, WALLET } from '@/store/app-store';
import { useSession } from '@/store/session';

import { api, ApiError, errorMessage, newIdempotencyKey, request } from './api';
import { round2 } from './pricing';
import { syncCatalog, syncMe } from './sync';

/*
 * Checkout. The server prices the cart again from the live menu; the app sends the total it showed and
 * an Idempotency-Key, so a dropped connection can be retried without placing a second order.
 */

/** payM → the API payment method. */
export const methodOf = (payM: number): PayMethod =>
  payM === 2 ? 'cash' : payM === 3 ? 'wallet' : 'card';

/** What the server needs to price and place the cart. */
export function buildOrderRequest(): CreateOrder {
  const s = useApp.getState();
  const pickup = s.mode === 'pickup';
  const a = s.addrs[s.addr] ?? s.addrs[0];
  const phone = (a?.phone || useSession.getState().user?.phone || '').trim();
  const method = methodOf(s.payM);
  return {
    items: s.cart.map(({ id, s: size, ex, q, deal, dealPct, voucher }) => ({
      id,
      s: size,
      ex,
      q,
      ...(deal ? { deal, dealPct } : {}),
      ...(voucher ? { voucher } : {}),
    })),
    mode: s.mode,
    speed: pickup ? 0 : s.speed,
    // the call center rings this number to confirm the order
    address: pickup || !a ? null : { tag: a.tag, l1: a.l1, l2: a.l2, note: a.note ?? '', door: a.door, ...(phone ? { phone } : {}) },
    note: s.note.trim(),
    promo: s.promo?.code ?? null,
    method,
    payLabel: method === 'cash' ? 'Cash' : method === 'wallet' ? 'Mobile Wallet' : WALLET,
    useCredit: false,
    expectedTotal: round2(s.totals().total),
  };
}

export type CheckoutResult =
  | { ok: true; order: Order }
  /** `priceChanged`: the menu changed under the customer — it has been reloaded, so show the new total */
  | { ok: false; cancelled?: boolean; priceChanged?: boolean; total?: number; message: string };

let last: { sig: string; key: string } | null = null;

/**
 * One checkout attempt: place the order (cash goes straight to the kitchen), or for a card or wallet
 * submit card details to the payment processor, then wait for the signed confirmation.
 */
export type CardDetails = { number: string; name: string; month: string; year: string; cvv: string } | { token: string; cvv: string };

export async function placeOrder(card?: CardDetails, walletPhone?: string, openThreeDS?: (url: string) => Promise<void>): Promise<CheckoutResult> {
  const req = buildOrderRequest();
  if (!req.items.length) return { ok: false, message: 'Your cart is empty.' };
  // the same key while the request is unchanged: a retry returns the same order
  const sig = JSON.stringify(req);
  if (!last || last.sig !== sig) last = { sig, key: newIdempotencyKey() };

  let result: CreateOrderResult;
  try {
    const res = await request<CreateOrderResult>('/v1/orders', { method: 'POST', body: req, idempotencyKey: last.key, timeoutMs: 25_000 });
    result = res.data!;
  } catch (e) {
    if (e instanceof ApiError && e.code === 'price_changed') {
      last = null;
      await syncCatalog({ force: true });
      const total = (e.details as { total?: number } | undefined)?.total ?? useApp.getState().totals().total;
      return { ok: false, priceChanged: true, total, message: e.message };
    }
    // the cart is out of date with the menu: reload it so the screens show what changed
    if (e instanceof ApiError && ['item_unavailable', 'store_closed'].includes(e.code)) void syncCatalog({ force: true });
    if (e instanceof ApiError && ['voucher_invalid', 'promo_invalid'].includes(e.code)) {
      if (e.code === 'promo_invalid') useApp.getState().removePromo();
      void syncMe();
    }
    const retryable = e instanceof ApiError && (e.offline || e.status >= 500);
    // a request the server refused for good gets a fresh key next time
    if (!retryable) last = null;
    return { ok: false, message: errorMessage(e) };
  }

  const { order } = result;
  if (order.payment.method === 'cash') return done(order);

  if (order.payment.method === 'wallet') {
    const phone = String(walletPhone || '').replace(/[\s()-]/g, '');
    if (!/^01[0125]\d{8}$/.test(phone)) {
      return { ok: false, message: 'أدخل رقم محفظة مصري صحيح مكوّن من 11 رقمًا.' };
    }

    try {
      await request<{ status: 'PENDING' }>(
        `/v1/orders/${encodeURIComponent(order.id)}/payment/wallet/initiate`,
        { method: 'POST', body: { walletPhone: phone }, timeoutMs: 25_000 },
      );

      for (let i = 0; i < 45; i++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const current = await api.post<Order>(
          `/v1/orders/${encodeURIComponent(order.id)}/payment/sync`,
        ).catch(() => null);

        if (current?.payment.status === 'paid') return done(current);
        if (current?.payment.status === 'failed') {
          return { ok: false, message: 'لم تتم الموافقة على طلب الدفع من المحفظة. يمكنك المحاولة مرة أخرى.' };
        }
      }

      return {
        ok: false,
        message: 'تم إرسال طلب الدفع إلى المحفظة، لكن لم يصل التأكيد بعد. افتح تطبيق المحفظة وراجع طلب الدفع قبل إعادة المحاولة.',
      };
    } catch (e) {
      return { ok: false, message: errorMessage(e, 'تعذر إرسال طلب الدفع إلى المحفظة.') };
    }
  }

  if (!card) return { ok: false, message: 'أدخل بيانات البطاقة لإتمام الدفع.' };

  try {
    const intent = await api.post<{
      hash: string; endpoint: string; merchantId: string; reference: string; amount: string; currency: string;
      customerReference: string; webhookUrl: string; merchantRedirect: string;
    }>(`/v1/orders/${encodeURIComponent(order.id)}/payment/direct-intent`, { savedCard: 'token' in card });

    const cardFields = 'token' in card
      ? { cardToken: card.token, securityCode: card.cvv, enable3DS: true }
      : { number: card.number.replace(/\\s/g, ''), nameOnCard: card.name.trim(), expiry: { month: card.month.padStart(2, '0'), year: card.year.length === 2 ? card.year : card.year.slice(-2) }, securityCode: card.cvv, enable3DS: true };

    // Card data is sent directly to the payment processor; it is never sent to Tawseela's API.
    const paymentResponse = await fetch(intent.endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'Kashier-Hash': intent.hash },
      body: JSON.stringify({
        apiOperation: 'PAY',
        paymentMethod: { type: 'CARD', card: {
          number: card.number.replace(/\s/g, ''), nameOnCard: card.name.trim(),
          expiry: { month: card.month.padStart(2, '0'), year: card.year.length === 2 ? card.year : card.year.slice(-2) },
          securityCode: card.cvv, enable3DS: true,
        } },
        order: { reference: intent.reference, amount: intent.amount, currency: intent.currency, description: `Tawseela order ${order.no}` },
        ...( 'token' in card ? { customer: { reference: intent.customerReference } } : {}),
        interactionSource: 'ECOMMERCE',
        reconciliation: { webhookUrl: intent.webhookUrl, merchantRedirect: intent.merchantRedirect, redirect: true },
        merchantId: intent.merchantId, newPaymentUI: true,
      }),
    });
    const gateway: any = await paymentResponse.json().catch(() => ({}));

    console.log('[Payment diagnostic]', {
      httpStatus: paymentResponse.status,
      httpOk: paymentResponse.ok,
      status: gateway?.status,
      responseStatus: gateway?.response?.status,
      code: gateway?.code ?? gateway?.response?.code,
      messages: gateway?.messages,
      responseMessage: gateway?.response?.message,
    });
    if (!paymentResponse.ok || gateway?.status === 'FAILURE' || gateway?.response?.status === 'FAILURE') {
      last = null;
      return { ok: false, message: gateway?.messages?.ar || gateway?.messages?.en || 'تعذر إتمام الدفع. راجع بيانات البطاقة وحاول مرة أخرى.' };
    }
    const redirectUrl = gateway?.response?.authentication?.redirectUrl;
    if (typeof redirectUrl === 'string' && redirectUrl.startsWith('https://')) {
      if (!openThreeDS) return { ok: false, message: 'يلزم إكمال تحقق البنك داخل التطبيق قبل تأكيد الدفع.' };
      await openThreeDS(redirectUrl);
    }

    // Only the signed payment confirmation can mark this order as paid. The app response is not trusted.
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const current = await api.post<Order>(`/v1/orders/${encodeURIComponent(order.id)}/payment/sync`).catch(() => null);
      if (current?.payment.status === 'paid') return done(current);
      if (current?.payment.status === 'failed') break;
    }
    return { ok: false, message: 'عملية الدفع لم يصل تأكيدها بعد. لا تحاول الدفع مرة ثانية؛ حدّث حالة الطلب أو تواصل مع الدعم.' };
  } catch (e) {
    return { ok: false, message: errorMessage(e, 'تعذر بدء عملية الدفع. حاول مرة أخرى.') };
  }
}

function done(order: Order): CheckoutResult {
  last = null;
  useApp.getState().orderPlaced(order);
  // points for the order, vouchers spent
  void syncMe();
  return { ok: true, order };
}
