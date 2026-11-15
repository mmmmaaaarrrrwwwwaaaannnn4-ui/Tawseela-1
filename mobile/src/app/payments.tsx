import { useEffect, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
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

function luhnValidCardNumber(value: string) {
  let sum = 0;
  let double = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return value.length > 0 && sum % 10 === 0;
}

type SavedWallet = { id: string; provider: 'insta' | 'orange' | 'we' | 'etisalat' | 'vodafone'; phone: string; name: string; isDefault: boolean };

const WALLET_INFO = {
  insta: { label: 'InstaPay', logo: require('../../assets/payments/instapay.png') },
  orange: { label: 'Orange Cash', logo: require('../../assets/payments/orange-cash.png') },
  we: { label: 'WE Pay', logo: require('../../assets/payments/we-pay.png') },
  etisalat: { label: 'Etisalat Cash', logo: require('../../assets/payments/etisalat-cash.png') },
  vodafone: { label: 'Vodafone Cash', logo: require('../../assets/payments/vodafone-cash.png') },
} as const;

function validCardExpiry(value: string) {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return false;
  const month = Number(value.slice(0, 2));
  const year = 2000 + Number(value.slice(3, 5));
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

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
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setWalletsLoading(true);
    api.get<{ wallets: SavedWallet[] }>('/v1/me/wallets')
      .then((result) => { if (active) setSavedWallets(Array.isArray(result.wallets) ? result.wallets : []); })
      .catch(() => { if (active) setSavedWallets([]); })
      .finally(() => { if (active) setWalletsLoading(false); });
    return () => { active = false; };
  }, []);

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
    const brand = cardBrandOf(digits).name;
    const validLength = brand === 'AMEX' ? digits.length === 15
      : brand === 'VISA' ? [13, 16, 19].includes(digits.length)
      : ['MASTERCARD', 'MEEZA'].includes(brand) && digits.length === 16;
    const validExpiry = validCardExpiry(draft.exp);
    const validCvv = brand === 'AMEX' ? /^\d{4}$/.test(draft.cvv) : /^\d{3}$/.test(draft.cvv);
    if (!validLength || !luhnValidCardNumber(digits) || !draft.name.trim() || !validExpiry || !validCvv) { setErr(true); return; }
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
      await api.post('/v1/me/cards', { cardToken: token }, { idempotencyKey: `saved-card-${Crypto.randomUUID()}` });
      const saved = await api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards');
      const next = saved.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; });
      const currentDefault = useApp.getState().defCard;
      useApp.setState({ cards: next, defCard: draft.def ? token : (next.some((x) => x.id === currentDefault) ? currentDefault : (next[0]?.id ?? '')), payM: 1 });
      setIdx(Math.max(0, next.findIndex((x) => x.id === token)));
      setErr(false); setFlip(false); setOpen(false); setDraft(blankCard());
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

          <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
            <View style={styles.historyHead}><Txt s={19} w={800} color="#111111">المحافظ المحفوظة</Txt><Txt s={12} color="#777777">{savedWallets.length} وسيلة</Txt></View>
            {walletsLoading ? <Txt s={13} color="#888888" align="right">جاري تحميل المحافظ...</Txt> : null}
            {!walletsLoading && savedWallets.length === 0 ? <Txt s={13} color="#888888" align="right">لا توجد محافظ محفوظة حتى الآن.</Txt> : null}
            {savedWallets.map((wallet) => {
              const info = WALLET_INFO[wallet.provider];
              return (
                <View key={wallet.id} style={styles.savedWalletRow}>
                  <Image source={info.logo} resizeMode="contain" style={styles.savedWalletLogo} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt s={14} w={700} color="#183D30">{info.label}</Txt>
                    <Txt s={13} color="#777777" tabular>{wallet.phone.replace(/(\\d{3})\\d{4}(\\d{4})/, '$1 •••• $2')}</Txt>
                    <Txt s={11} color="#888888">{wallet.name}{wallet.isDefault ? ' · افتراضية' : ''}</Txt>
                  </View>
                  <PressableScale onPress={() => { void api.delete(`/v1/me/wallets/${encodeURIComponent(wallet.id)}`).then(async () => { const fresh = await api.get<{ wallets: SavedWallet[] }>('/v1/me/wallets'); setSavedWallets(fresh.wallets ?? []); }).catch((error) => useApp.getState().showToast('تعذر حذف المحفظة', error instanceof Error ? error.message : 'حاول مرة أخرى.', 'error')); }} style={styles.walletDelete}>
                    <Icon name="delete" size={19} color="#D04444" />
                  </PressableScale>
                </View>
              );
            })}
          </View>

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
          saving={saving}
          onSaveWallet={(provider, phone, name, save) => {
            if (!save) {
              useApp.getState().showToast('لم يتم حفظ المحفظة', 'فعّل خيار حفظ المحفظة لاستخدامها لاحقًا.', 'info');
              return;
            }
            void api.post<{ saved: boolean; wallet: { id: string; provider: string; phone: string; name: string; isDefault: boolean } | null }>('/v1/me/wallets', {
              provider: provider === 'InstaPay' ? 'insta' : provider === 'Orange Cash' ? 'orange' : provider === 'WE Pay' ? 'we' : provider === 'Etisalat Cash' ? 'etisalat' : 'vodafone',
              phone,
              name,
              isDefault: true,
            }).then(async () => {
              const fresh = await api.get<{ wallets: SavedWallet[] }>('/v1/me/wallets');
              setSavedWallets(fresh.wallets ?? []);
              useApp.getState().showToast('تم حفظ المحفظة', 'اتحفظت وظهرت ضمن وسائل الدفع المحفوظة.', 'check_circle');
              setOpen(false);
            }).catch((error) => {
              useApp.getState().showToast('تعذر حفظ المحفظة', error instanceof Error ? error.message : 'حاول مرة أخرى.', 'error');
            });
          }}
          onClose={() => {
            setOpen(false);
            setFlip(false);
            setDraft(blankCard());
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
  savedWalletRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E6EAE8' },
  savedWalletLogo: { width: 62, height: 48 },
  walletDelete: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF2F2' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
});
