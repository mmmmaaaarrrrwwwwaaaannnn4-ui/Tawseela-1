import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { blankCard, CardSheet } from '@/components/account/card-sheet';
import { IconTile } from '@/components/account/rows';
import { Wallet } from '@/components/account/wallet';
import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo } from '@/components/account/brand-logos';
import { AccentFill } from '@/components/ui/buttons';
import { PagerDots } from '@/components/ui/controls';
import { ListCard, ScreenHeader, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { money, orderTime } from '@/lib/format';
import { api } from '@/lib/api';
import { cardBrandOf } from '@/data/seed';
import { selectMyOrders, useApp, type NewCard } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function PaymentsScreen() {
  const { c } = useTheme();
  const chrome = useChrome();
  useStatusBar();
  const cards = useApp((s) => s.cards);
  const defCard = useApp((s) => s.defCard);
  const payM = useApp((s) => s.payM);
  const credit = useApp((s) => s.credit);
  const user = useSession((s) => s.user);
  const history = useApp(useShallow((s) => selectMyOrders(s).slice(0, 4)));
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewCard>(() => blankCard());
  const [err, setErr] = useState(false);
  const [flip, setFlip] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    useApp.setState({ cards: [], defCard: '' });
    let active = true;
    api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards')
      .then((result) => { if (!active) return; const next = result.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: b.name !== 'CARD' ? b.name : (x.brand || b.name), num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; }); useApp.setState({ cards: next, defCard: useApp.getState().defCard && next.some((x) => x.id === useApp.getState().defCard) ? useApp.getState().defCard : (next[0]?.id ?? '') }); })
      .catch(() => { if (active) useApp.setState({ cards: [], defCard: '' }); });
    return () => { active = false; };
  }, []);

  const cur = cards[Math.min(idx, cards.length - 1)];
  const curIsDef = !!cur && payM === 1 && defCard === cur.id;

  const startCard = () => {
    setDraft(blankCard(user?.name ?? ''));
    setErr(false);
    setFlip(false);
    setOpen(true);
  };
  const saveCard = async () => {
    const digits = draft.num.replace(/\D/g, '');
    const validExpiry = /^(0[1-9]|1[0-2])\/\d{2}$/.test(draft.exp);
    const validCvv = /^\d{3,4}$/.test(draft.cvv);
    if (digits.length < 15 || !draft.name.trim() || !validExpiry || !validCvv) { setErr(true); return; }
    if (saving) return;
    setSaving(true);
    try {
      const intent = await api.get<{ endpoint: string; merchantId: string; customerReference: string; hash: string }>('/v1/me/cards/tokenization-intent');
      const response = await fetch(intent.endpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'Kashier-Hash': intent.hash },
        body: JSON.stringify({
          merchantId: intent.merchantId,
          customerReference: intent.customerReference,
          paymentMethod: { type: 'CARD', card: { number: digits, nameOnCard: draft.name.trim(), expiry: { month: draft.exp.slice(0, 2), year: draft.exp.slice(-2) }, securityCode: draft.cvv } },
          customer: { reference: intent.customerReference },
        }),
      });
      const result: any = await response.json().catch(() => ({}));
      const token = result?.response?.paymentMethod?.card?.cardToken ?? result?.response?.paymentMethod?.card?.cardDataToken;
      if (!response.ok || result?.status !== 'SUCCESS' || typeof token !== 'string') throw new Error(result?.messages?.ar || result?.messages?.en || 'تعذر تأكيد البطاقة. راجع البيانات وحاول مرة أخرى.');
      const cardFingerprint = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, digits);
      await api.post('/v1/me/cards', { cardToken: token }, { idempotencyKey: `saved-card-${cardFingerprint}` });
      const saved = await api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards');
      const next = saved.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; });
      const currentDefault = useApp.getState().defCard;
      useApp.setState({ cards: next, defCard: draft.def ? token : (next.some((x) => x.id === currentDefault) ? currentDefault : (next[0]?.id ?? '')), payM: 1 });
      setIdx(Math.max(0, next.findIndex((x) => x.id === token)));
      setErr(false); setFlip(false); setOpen(false);
      useApp.getState().showToast('تم حفظ البطاقة', 'تقدر تستخدمها في الدفع بعد كده.', 'check_circle');
      router.replace('/checkout');
    } catch (error) {
      setErr(true);
      useApp.getState().showToast('تعذر حفظ البطاقة', 'راجع بيانات البطاقة أو حاول مرة أخرى بعد قليل.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: chrome.underHeader, paddingBottom: 40, gap: 0 }}>
          <View style={styles.walletHero}>
            <View style={styles.heroMint} />
            <View style={styles.balanceCard}>
              <Txt s={15} w={500} color="#333333">الرصيد ⓘ</Txt>
              <Txt s={34} w={700} color="#111111" tabular>{money(credit)}</Txt>
            </View>
          </View>
          <View style={styles.titleRow}>
            <Txt s={20} w={800} color="#111111">طرق الدفع الخاصة بي</Txt>
            <PressableScale onPress={startCard} style={styles.manageLink}>
              <Txt s={14} w={500} color="#777777">إدارة</Txt>
              <Icon name="arrow_back_ios_new" size={18} color="#777777" />
            </PressableScale>
          </View>

          {cards.length ? (
            <>
              <Reveal i={0}>
                <Wallet cards={cards} index={idx} defId={payM === 1 ? defCard : null} holder={user?.name ?? 'Alex Morgan'} onIndex={setIdx} />
              </Reveal>
              <PagerDots count={cards.length} index={Math.min(idx, cards.length - 1)} onPick={setIdx} activeWidth={20} />
              <View style={styles.actions}>
                {curIsDef ? (
                  <View style={[styles.action, { backgroundColor: c.accentSoft }]}>
                    <Icon name="verified" size={21} fill color={c.accentText} />
                    <Txt s={12} w={700} color={c.accentText}>
                      Default card
                    </Txt>
                  </View>
                ) : (
                  <PressableScale
                    scaleTo={0.96}
                    onPress={() => cur && useApp.getState().makeDefaultCard(cur.id)}
                    style={[styles.action, { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface1 }]}
                  >
                    <Icon name="check_circle" size={21} color={c.accent} />
                    <Txt s={12} w={700}>
                      Make default
                    </Txt>
                  </PressableScale>
                )}
                <PressableScale scaleTo={0.96} onPress={startCard} style={styles.action}>
                  <AccentFill radius={20} />
                  <Icon name="add_card" size={21} color={c.accentInk} />
                  <Txt s={12} w={700} color={c.accentInk}>
                    Add card
                  </Txt>
                </PressableScale>
                <PressableScale
                  scaleTo={0.96}
                  onPress={() => {
                    if (cur) void api.delete(`/v1/me/cards/${encodeURIComponent(cur.id)}`).then(async () => { const saved = await api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards'); const next = saved.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; }); useApp.setState({ cards: next, defCard: next[0]?.id ?? '' }); setIdx(0); }).catch((e) => useApp.getState().showToast('تعذر حذف البطاقة', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error'));
                  }}
                  style={[styles.action, { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface1 }]}
                >
                  <Icon name="delete" size={21} color={c.err} />
                  <Txt s={12} w={700} color={c.err}>
                    Remove
                  </Txt>
                </PressableScale>
              </View>
            </>
          ) : (
            <View style={[styles.firstCard, { backgroundColor: '#F4F5F9', borderColor: '#F4F5F9' }]}>
              <View style={styles.networks}>
                <PaymentNetworkLogo brand="MADA" width={40} height={35} />
                <PaymentNetworkLogo brand="VISA" width={42} height={31} />
                <PaymentNetworkLogo brand="AMEX" width={38} height={31} />
                <PaymentNetworkLogo brand="MASTERCARD" width={40} height={31} />
                <PaymentNetworkLogo brand="DISCOVER" width={42} height={31} />
              </View>
              <Txt s={14} w={500} color="#777777" align="center">لم تضف طريقة دفع بعد؟</Txt>
              <Txt s={13} color="#777777" align="center">انقر لإضافة طريقة دفع.</Txt>
              <PressableScale scaleTo={0.97} onPress={startCard} style={styles.addCardButton}>
                <Txt s={15} w={700} color="#111111">إضافة طريقة دفع</Txt>
              </PressableScale>
            </View>
          )}

          <View style={{ height: 28, backgroundColor: "#F1F2F5" }} />
          <View style={{ paddingHorizontal: 20, gap: 8, paddingTop: 22 }}>
            <View style={styles.historyHead}><Txt s={20} w={800} color="#111111">المعاملات الأخيرة</Txt><Txt s={14} color="#777777">عرض الكل ‹</Txt></View>

            {history.length ? (
              <ListCard radius={20}>
                {history.map((o, i) => {
                  const refund = o.step === 4;
                  return (
                    <View key={o.no} style={[styles.pay, { borderBottomColor: c.line, borderBottomWidth: i === history.length - 1 ? 0 : 1 }]}>
                      <IconTile icon={refund ? 'undo' : 'receipt_long'} size={36} radius={11} iconSize={19} />
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Txt s={13.5} w={700}>{refund ? 'Refund' : 'Order'} {o.no}</Txt>
                        <Txt s={11.5} color={c.text3} numberOfLines={1}>{orderTime(o.placedAt)} · {o.pay}</Txt>
                      </View>
                      <Txt s={14} w={700} color={refund ? c.ok : c.text1}>{(refund ? '+' : '−') + money(o.total)}</Txt>
                    </View>
                  );
                })}
              </ListCard>
            ) : (
              <View style={styles.emptyHistory}>
                <Txt s={14} w={500} color="#8A8A8A">لا توجد معلومات ذات صلة متاحة</Txt>
              </View>
            )}
          </View>


        </ScrollView>
        <ScreenHeader title="المحفظة" />
        <CardSheet
          visible={open}
          value={draft}
          onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          showErrors={err}
          flipped={flip}
          onFlip={setFlip}
          onSave={() => void saveCard()}
          onSaveWallet={(provider, phone, name, save) => {
            // Kashier wallet R2P is order-scoped; this screen has no order/payment amount.
            // Do not persist wallet PII or report a successful add without a provider token.
            void phone;
            void name;
            useApp.getState().showToast(
              save ? 'حفظ المحفظة غير متاح حاليًا' : 'الدفع بالمحفظة متاح عند إتمام الطلب',
              save
                ? 'بوابة Kashier الحالية لا توفر Token لحفظ المحافظ كوسيلة دفع دائمة.'
                : 'اختَر المحفظة من صفحة إتمام الطلب حتى يتم إنشاء عملية دفع مرتبطة بطلب فعلي.',
              'info',
            );
          }}
          onClose={() => {
            setOpen(false);
            setFlip(false);
          }}
        />
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  walletHero: { height: 300, backgroundColor: '#FFE51A', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, justifyContent: 'flex-end', overflow: 'hidden' },
  heroMint: { position: 'absolute', right: -85, top: -62, width: 190, height: 430, backgroundColor: '#15C99A', borderRadius: 95, transform: [{ rotate: '34deg' }] },
  balanceCard: { minHeight: 132, borderRadius: 26, backgroundColor: '#FFFFFF', paddingHorizontal: 22, paddingVertical: 18, alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
  titleRow: { minHeight: 78, paddingHorizontal: 22, paddingTop: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF' },
  manageLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  action: { flex: 1, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
  firstCard: { marginHorizontal: 18, minHeight: 246, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18 },
  networks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FFFFFF', borderRadius: 28, paddingHorizontal: 8, paddingVertical: 7, marginBottom: 8 },
  addCardButton: { marginTop: 12, width: '72%', minHeight: 54, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  historyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54 },
  emptyHistory: { minHeight: 210, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
});
