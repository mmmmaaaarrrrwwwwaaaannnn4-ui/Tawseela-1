/** Legacy hosted-session helper retained for older app builds; current checkout uses Direct API. */
import * as Linking from 'expo-linking';
import { api, ApiError } from './api';
import type { KashierCheckoutInit } from './contract';

export type CheckoutResult = { ok: true } | { ok: false; cancelled?: boolean; message: string };

export async function payWithKashier(init: KashierCheckoutInit, orderId: string): Promise<CheckoutResult> {
  try {
    await Linking.openURL(init.sessionUrl);
    for (let i = 0; i < 45; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const order = await api.post<any>(`/v1/orders/${encodeURIComponent(orderId)}/payment/sync`);
        if (order?.payment?.status === 'paid') return { ok: true };
        if (['failed', 'canceled'].includes(order?.payment?.status)) return { ok: false, message: 'لم تكتمل عملية الدفع.' };
      } catch (e) {
        if (!(e instanceof ApiError && e.offline)) console.warn('[kashier] legacy payment status check failed');
      }
    }
    return { ok: false, message: 'لم يصل تأكيد الدفع بعد.' };
  } catch {
    return { ok: false, cancelled: true, message: 'تعذر فتح صفحة الدفع.' };
  }
}
