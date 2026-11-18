import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { blankCard, CardSheet } from '@/components/account/card-sheet';
import { PaymentNetworkLogo } from '@/components/account/brand-logos';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { money, orderTime } from '@/lib/format';
import { api } from '@/lib/api';
import { cardBrandOf } from '@/data/seed';
import { selectMyOrders, useApp, type NewCard } from '@/store/app-store';
import { useSession } from '@/store/session';

/* ───────────────────────── constants & helpers ───────────────────────── */

// عدّل المسارات دي حسب الـ routes الموجودة عندك.
const ROUTES = { topUp: '/top-up', support: '/support', more: '/menu' } as const;
// قيم payM: 1 = بطاقة (زي الكود القديم). القيمة التانية للمحفظة، عدّلها لو عندك قيمة مختلفة.
const PAY_CARD = 1;
const PAY_WALLET = 2;

const GREEN = '#153222';
const LIME = '#CDEB3B';
const CREAM = '#F4F0E4';
const BORDER = '#DADDE1';
const NETWORKS = ['MADA', 'VISA', 'AMEX', 'MASTERCARD', 'DISCOVER'];

type ServerCard = { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string };
type SavedWallet = { id: string; provider: 'insta' | 'orange' | 'we' | 'etisalat' | 'vodafone'; phone: string; name: string; isDefault: boolean };

const WALLET_INFO = {
  insta: { label: 'InstaPay', logo: require('../assets/payments/instapay.png') },
  orange: { label: 'Orange Cash', logo: require('../assets/payments/orange-cash.png') },
  we: { label: 'WE Pay', logo: require('../assets/payments/we-pay.png') },
  etisalat: { label: 'Etisalat Cash', logo: require('../assets/payments/etisalat-cash.png') },
  vodafone: { label: 'Vodafone Cash', logo: require('../assets/payments/vodafone-cash.png') },
} as const;

const PROVIDER_BY_LABEL: Record<string, SavedWallet['provider']> = {
  InstaPay: 'insta',
  'Orange Cash': 'orange',
  'WE Pay': 'we',
  'Etisalat Cash': 'etisalat',
  'Vodafone Cash': 'vodafone',
};

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

function validCardExpiry(value: string) {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return false;
  const month = Number(value.slice(0, 2));
  const year = 2000 + Number(value.slice(3, 5));
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

// تحويل واحد فقط لرد /v1/me/cards (كان متكرر 3 مرات وبنتايج مختلفة).
function mapCard(x: ServerCard) {
  const b = cardBrandOf(x.number.replace(/\D/g, ''));
  const exp = x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '';
  return { id: x.id, brand: b.name !== 'CARD' ? b.name : (x.brand || b.name), num: x.number, exp, bg: b.bg, nick: '', name: x.name };
}

const last4 = (v: string) => v.replace(/\D/g, '').slice(-4);
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const fmtBalance = (v: unknown) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ───────────────────────── icons (كلها مرسومة بالكود) ───────────────────────── */

const P = {
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  card: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 10h18M7 15h4',
  headset: 'M5 14v-2a7 7 0 0 1 14 0v2M5 14h2v5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zM19 14h-2v5h2a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1zM19 19v.5a2.5 2.5 0 0 1-2.5 2.5H13',
};

function Ic({ d, size = 20, color = '#111', sw = 2 }: { d: string; size?: number; color?: string; sw?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function MoreDots({ color = GREEN }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2.3} fill={color} />
      <Circle cx={12} cy={12} r={2.3} fill={color} />
      <Circle cx={19} cy={12} r={2.3} fill={color} />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={LIME} strokeWidth={2} />
      <Path d="M12 11v6" stroke={LIME} strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={12} cy={7.3} r={1.3} fill={LIME} />
    </Svg>
  );
}

function ChipArt() {
  const s = '#B6B6AE';
  return (
    <Svg width={49} height={35} viewBox="0 0 49 35" fill="none">
      <Rect x={0.5} y={0.5} width={48} height={34} rx={6} fill="#F1F1ED" stroke="#C9C9C2" />
      <Rect x={14} y={7} width={21} height={21} rx={6} stroke={s} />
      <Path d="M0.5 12h14M0.5 23h14M34 12h14.5M34 23h14.5M24.5 0.5v6.5M24.5 28v6.5" stroke={s} />
    </Svg>
  );
}

function ContactlessArt() {
  return (
    <Svg width={26} height={36} viewBox="0 0 26 36" fill="none">
      <Path d="M2 11A9 9 0 0 1 2 25" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M8 7A15 15 0 0 1 8 29" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M14 3A21 21 0 0 1 14 33" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function EmptyCardsArt() {
  return (
    <Svg width={61} height={48} viewBox="0 0 61 48">
      <Defs>
        <SvgGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#E3E3E3" />
          <Stop offset="1" stopColor="#B9B9B9" />
        </SvgGradient>
      </Defs>
      <Rect x={10} y={9} width={51} height={39} rx={8} fill="#D3D3D3" />
      <Rect x={0} y={0} width={51} height={37} rx={7} fill="url(#g1)" />
      <Rect x={0} y={9} width={51} height={5} fill="#F2F2F2" opacity={0.55} />
    </Svg>
  );
}

function ReceiptArt() {
  const dark = '#1F4D2B';
  return (
    <Svg width={100} height={106} viewBox="0 0 100 106" fill="none">
      <Ellipse cx={50} cy={97} rx={40} ry={6} fill="#E8F5C8" />
      <G rotation={-8} origin="50, 52">
        <Path
          d="M27 20 Q27 10 39 11 L70 13 Q79 14 78 24 L73 80 L67 86 L61 80 L55 86 L49 80 L43 86 L37 80 L31 86 L27 80 Z"
          fill="#F7F6EE"
          stroke={dark}
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <Path d="M22 30 C20 16 32 8 42 13 L40 27 Z" fill={dark} />
        <Circle cx={42} cy={38} r={6} fill="#B4E34A" />
        <Rect x={52} y={35} width={19} height={6} rx={3} fill={dark} />
        <Rect x={36} y={50} width={36} height={7} rx={3.5} fill={dark} />
        <Rect x={40} y={63} width={32} height={7} rx={3.5} fill={dark} />
      </G>
      <Path d="M66 31A10 10 0 0 1 76 41" stroke="#A8DC3A" strokeWidth={5} strokeLinecap="round" />
      <Path d="M66 20A21 21 0 0 1 87 41" stroke="#A8DC3A" strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Logo() {
  return (
    <View style={styles.logo}>
      <View style={styles.logoPill}>
        <Text style={styles.logoPillTxt}>باي</Text>
      </View>
      <Text style={styles.logoTxt}>توصيلة</Text>
      <View style={styles.logoStreak} />
    </View>
  );
}

function HeroCard({ brand, digits }: { brand: string; digits: string }) {
  return (
    <View style={styles.heroWrap}>
      <LinearGradient colors={['#5CC38F', '#2F7A56', '#0B2C1A']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroLogo}>توصيلة</Text>
        <View style={styles.heroStreak} />
        <View style={styles.heroChip}><ChipArt /></View>
        <View style={styles.heroNfc}><ContactlessArt /></View>
        <View style={styles.heroDigits}>
          <Txt s={21} w={400} color="#FFFFFF" tabular>{`•• ${digits}`}</Txt>
        </View>
        <Text style={[styles.heroBrand, brand.length > 6 && { fontSize: 17 }]}>{brand}</Text>
      </LinearGradient>
    </View>
  );
}

function CheckCircle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <PressableScale scaleTo={0.9} onPress={onPress} style={[styles.chk, on ? styles.chkOn : styles.chkOff]}>
      <Ic d={P.check} size={13} color={on ? '#1F7A2A' : '#B5B9BF'} sw={2.6} />
    </PressableScale>
  );
}

function MethodRow(props: {
  logo: ReactNode;
  title: string;
  subtitle: string;
  isDefault: boolean;
  onSelect?: () => void;
  onDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <PressableScale scaleTo={0.99} onPress={props.onSelect ?? (() => {})} style={styles.row}>
      <PressableScale scaleTo={0.9} onPress={props.onDelete} style={styles.delBtn}>
        <Ic d={P.trash} size={14} color="#D93A3A" />
      </PressableScale>
      <CheckCircle on={props.isDefault} onPress={props.onDefault} />
      <View style={styles.vDiv} />
      <View style={styles.rowText}>
        <Txt s={13} w={600} color="#222222" align="right" numberOfLines={1}>{props.title}</Txt>
        <Txt s={13} color="#666666" align="right" tabular numberOfLines={1}>{props.subtitle}</Txt>
      </View>
      <View style={[styles.vDiv, { marginLeft: 0 }]} />
      <View style={styles.logoBlock}>{props.logo}</View>
    </PressableScale>
  );
}

function HistoryRow({ refund, title, subtitle, amount }: { refund: boolean; title: string; subtitle: string; amount: string }) {
  return (
    <View style={[styles.row, { paddingLeft: 14 }]}>
      <Txt s={13.5} w={700} color={refund ? '#1E9E6A' : '#111111'} tabular>{amount}</Txt>
      <View style={[styles.vDiv, { marginLeft: 12 }]} />
      <View style={styles.rowText}>
        <Txt s={13} w={600} color="#222222" align="right" numberOfLines={1}>{title}</Txt>
        <Txt s={12} color="#666666" align="right" numberOfLines={1}>{subtitle}</Txt>
      </View>
      <View style={[styles.vDiv, { marginLeft: 0 }]} />
      <View style={styles.logoBlock}>
        <View style={styles.histIcon}>
          <Ic d={refund ? P.undo : P.receipt} size={17} color="#1F4D2B" />
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────── screen ───────────────────────── */

export default function PaymentsScreen() {
  useStatusBar();
  const insets = useSafeAreaInsets();
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
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(true);

  const loadCards = useCallback(async () => {
    const res = await api.get<{ cards: ServerCard[] }>('/v1/me/cards');
    const next = (res.cards ?? []).map(mapCard);
    const current = useApp.getState().defCard;
    useApp.setState({ cards: next, defCard: next.some((x) => x.id === current) ? current : (next[0]?.id ?? '') });
    return next;
  }, []);

  const loadWallets = useCallback(async () => {
    const res = await api.get<{ wallets: SavedWallet[] }>('/v1/me/wallets');
    setSavedWallets(Array.isArray(res.wallets) ? res.wallets : []);
  }, []);

  useEffect(() => {
    loadCards()
      .then((next) => {
        const d = useApp.getState().defCard;
        setIdx(Math.max(0, next.findIndex((x) => x.id === d)));
      })
      .catch(() => useApp.setState({ cards: [], defCard: '' }))
      .finally(() => setCardsLoading(false));
    loadWallets().catch(() => setSavedWallets([])).finally(() => setWalletsLoading(false));
  }, [loadCards, loadWallets]);

  const hasCards = !cardsLoading && cards.length > 0;
  const cur = hasCards ? cards[Math.min(idx, cards.length - 1)] : undefined;
  const hasWallets = savedWallets.length > 0;
  const noMethods = !cardsLoading && !walletsLoading && !hasCards && !hasWallets;

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
      const before = new Set(useApp.getState().cards.map((x) => x.id));
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
      const next = await loadCards();
      // البطاقة الجديدة = اللي id بتاعها مش موجود قبل الحفظ (مش لازم id = token).
      const added = next.find((x) => !before.has(x.id)) ?? next[next.length - 1];
      if (added) {
        setIdx(Math.max(0, next.findIndex((x) => x.id === added.id)));
        if (draft.def) useApp.setState({ defCard: added.id, payM: PAY_CARD });
      }
      setErr(false); setFlip(false); setOpen(false); setDraft(blankCard());
      useApp.getState().showToast('تم حفظ البطاقة', 'تقدر تستخدمها في الدفع بعد كده.', 'check_circle');
      router.replace('/checkout');
    } catch (error) {
      setErr(true);
      useApp.getState().showToast('تعذر حفظ البطاقة', errMsg(error, 'راجع بيانات البطاقة أو حاول مرة أخرى بعد قليل.'), 'error');
    } finally { setSaving(false); }
  };

  const deleteCard = (id: string) => {
    api.delete(`/v1/me/cards/${encodeURIComponent(id)}`)
      .then(async () => { await loadCards(); setIdx(0); })
      .catch((e) => useApp.getState().showToast('تعذر حذف البطاقة', errMsg(e, 'حاول مرة أخرى.'), 'error'));
  };

  const deleteWallet = (id: string) => {
    api.delete(`/v1/me/wallets/${encodeURIComponent(id)}`)
      .then(loadWallets)
      .catch((e) => useApp.getState().showToast('تعذر حذف المحفظة', errMsg(e, 'حاول مرة أخرى.'), 'error'));
  };

  // ملاحظة: الـ endpoint ده لازم يكون موجود في الباك إند (غيّره لو اسمه مختلف).
  const makeWalletDefault = (id: string) => {
    api.post(`/v1/me/wallets/${encodeURIComponent(id)}/default`, {})
      .then(async () => { await loadWallets(); useApp.setState({ payM: PAY_WALLET }); })
      .catch((e) => useApp.getState().showToast('تعذر تعيين المحفظة كافتراضية', errMsg(e, 'حاول مرة أخرى.'), 'error'));
  };

  const onSaveWallet = (provider: string, phone: string, name: string, save: boolean) => {
    if (!save) {
      useApp.getState().showToast('لم يتم حفظ المحفظة', 'فعّل خيار حفظ المحفظة لاستخدامها لاحقًا.', 'info');
      return;
    }
    api.post('/v1/me/wallets', { provider: PROVIDER_BY_LABEL[provider] ?? 'vodafone', phone, name, isDefault: true })
      .then(async () => {
        await loadWallets();
        useApp.getState().showToast('تم حفظ المحفظة', 'اتحفظت وظهرت ضمن وسائل الدفع المحفوظة.', 'check_circle');
        setOpen(false);
      })
      .catch((e) => useApp.getState().showToast('تعذر حفظ المحفظة', errMsg(e, 'حاول مرة أخرى.'), 'error'));
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        {/* ───── الهيدر ───── */}
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headTop}>
            <View style={styles.headBtns}>
              <PressableScale scaleTo={0.92} onPress={() => router.push(ROUTES.support as never)} style={[styles.circle, { backgroundColor: '#FFFFFF' }]}>
                <Ic d={P.headset} size={18} color={GREEN} />
              </PressableScale>
              <PressableScale scaleTo={0.92} onPress={() => router.push(ROUTES.more as never)} style={[styles.circle, { backgroundColor: '#FFFFFF' }]}>
                <MoreDots />
              </PressableScale>
            </View>
            <Logo />
          </View>

          <View style={styles.headBottom}>
            <View style={styles.quick}>
              <PressableScale scaleTo={0.94} onPress={startCard} style={styles.quickCol}>
                <View style={[styles.quickCircle, { backgroundColor: CREAM }]}>
                  <Ic d={P.card} size={17} color={GREEN} sw={2.2} />
                </View>
                <Txt s={11} w={500} color={CREAM} align="center">البطاقات المحفوظة</Txt>
              </PressableScale>
              <PressableScale scaleTo={0.94} onPress={() => router.push(ROUTES.topUp as never)} style={styles.quickCol}>
                <View style={[styles.quickCircle, { backgroundColor: LIME }]}>
                  <Ic d={P.plus} size={18} color={GREEN} sw={2.2} />
                </View>
                <Txt s={11} w={500} color={CREAM} align="center">إضافة إلى الرصيد</Txt>
              </PressableScale>
            </View>

            <View style={styles.balanceBox}>
              <View style={styles.balanceLbl}>
                <InfoIcon />
                <Txt s={16} w={500} color={CREAM} align="right">رصيدك هو</Txt>
              </View>
              <View style={styles.balanceAmt}>
                <Txt s={22} w={700} color={CREAM}>ج.م</Txt>
                <Txt s={26} w={700} color={LIME} tabular>{fmtBalance(credit)}</Txt>
              </View>
            </View>
          </View>
        </View>

        {/* ───── البطاقة الكبيرة / الحالة الفاضية ───── */}
        {hasCards && cur ? (
          <HeroCard brand={String(cur.brand).toUpperCase()} digits={last4(cur.num)} />
        ) : (
          <View style={styles.emptyHero}>
            {!cardsLoading ? (
              <>
                <EmptyCardsArt />
                <View style={{ marginTop: 17 }}>
                  <Txt s={20} w={800} color="#1B1B1B" align="center">ليس هناك بطاقات محفوظة</Txt>
                </View>
                <View style={{ marginTop: 9, paddingHorizontal: 30 }}>
                  <Txt s={13} color="#666666" align="center">يمكنك حفظ بطاقة خصم او ائتمان بكل امان لإجراء طلباتك بشكل اسرع.</Txt>
                </View>
              </>
            ) : null}
          </View>
        )}

        {/* ───── طريقة الدفع ───── */}
        <View style={styles.sectionHead}>
          <Txt s={19} w={800} color="#111111" align="right">طريقة الدفع</Txt>
          <Txt s={13} color="#333333" align="right">بيانات بطاقتك مشفرة ومحمية معنا</Txt>
        </View>

        <View style={{ paddingHorizontal: 12, marginTop: 9 }}>
          {hasCards ? cards.map((x, i) => {
            const brand = String(x.brand).toUpperCase();
            return (
              <View key={x.id} style={{ marginBottom: i === cards.length - 1 ? 0 : 8 }}>
                <MethodRow
                  logo={NETWORKS.includes(brand) ? <PaymentNetworkLogo brand={brand as any} width={42} height={31} /> : <Ic d={P.card} size={26} color="#555" />}
                  title={x.name || brand}
                  subtitle={`•••• •••• •••• ${last4(x.num)}`}
                  isDefault={payM === PAY_CARD && defCard === x.id}
                  onSelect={() => setIdx(i)}
                  onDefault={() => useApp.getState().makeDefaultCard(x.id)}
                  onDelete={() => deleteCard(x.id)}
                />
              </View>
            );
          }) : null}

          {hasWallets ? (
            <>
              <View style={styles.sep}>
                <View style={styles.sepLine} />
                <Txt s={13} w={700} color="#333333">محافظ إلكترونية</Txt>
                <View style={styles.sepLine} />
              </View>
              {savedWallets.map((w, i) => {
                const info = WALLET_INFO[w.provider] ?? WALLET_INFO.vodafone;
                return (
                  <View key={w.id} style={{ marginBottom: i === savedWallets.length - 1 ? 0 : 8 }}>
                    <MethodRow
                      logo={<Image source={info.logo} resizeMode="contain" style={styles.walletLogo} />}
                      title={w.name || info.label}
                      subtitle={`•••• •••• •••• ${last4(w.phone)}`}
                      isDefault={payM !== PAY_CARD && w.isDefault}
                      onDefault={() => makeWalletDefault(w.id)}
                      onDelete={() => deleteWallet(w.id)}
                    />
                  </View>
                );
              })}
            </>
          ) : null}
        </View>

        {noMethods ? (
          <PressableScale scaleTo={0.98} onPress={startCard} style={styles.addBox}>
            <Ic d={P.plus} size={20} color="#111111" sw={1.8} />
            <Txt s={14} w={700} color="#111111" align="center">أضف بطاقة جديدة</Txt>
          </PressableScale>
        ) : null}

        {/* ───── معاملات رصيد طلبات ───── */}
        <View style={[styles.sectionHead, { marginTop: noMethods ? 20 : 12 }]}>
          <Txt s={19} w={800} color="#111111" align="right">معاملات رصيد طلبات ·</Txt>
        </View>

        {history.length ? (
          <View style={{ paddingHorizontal: 12, marginTop: 12, gap: 8 }}>
            {history.map((o) => {
              const refund = o.step === 4;
              return (
                <HistoryRow
                  key={o.no}
                  refund={refund}
                  title={`${refund ? 'استرداد' : 'طلب'} ${o.no}`}
                  subtitle={`${orderTime(o.placedAt)} · ${o.pay}`}
                  amount={(refund ? '+' : '−') + money(o.total)}
                />
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyHistory}>
            <ReceiptArt />
            <View style={{ marginTop: 14 }}>
              <Txt s={20} w={800} color="#1B1B1B" align="center">لا توجد معاملات حتى الآن</Txt>
            </View>
            <View style={{ marginTop: 8, paddingHorizontal: 24 }}>
              <Txt s={13} color="#666666" align="center">ستجد جميع دفعاتك من الاستردادات وشحن الرصيد وغيرها هنا</Txt>
            </View>
          </View>
        )}
      </ScrollView>

      <CardSheet
        visible={open}
        value={draft}
        onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
        showErrors={err}
        flipped={flip}
        onFlip={setFlip}
        onSave={() => void saveCard()}
        saving={saving}
        onSaveWallet={onSaveWallet}
        onClose={() => {
          setOpen(false);
          setFlip(false);
          setDraft(blankCard());
        }}
      />
    </View>
  );
}

/* ───────────────────────── styles ───────────────────────── */

const styles = StyleSheet.create({
  // direction: 'ltr' عشان الترتيب الفيزيائي يفضل زي الصورة سواء الجهاز RTL أو لأ.
  root: { flex: 1, backgroundColor: '#FFFFFF', direction: 'ltr' },

  header: { backgroundColor: GREEN, paddingBottom: 9, paddingRight: 10, paddingLeft: 14 },
  headTop: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headBtns: { flexDirection: 'row', gap: 7.5 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headBottom: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  quick: { flexDirection: 'row', marginLeft: -9 },
  quickCol: { width: 44, alignItems: 'center', gap: 4 },
  quickCircle: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  balanceBox: { alignItems: 'flex-end', gap: 4, paddingTop: 2 },
  balanceLbl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceAmt: { flexDirection: 'row', alignItems: 'center', gap: 6.5 },

  logo: { width: 121, height: 30, justifyContent: 'center', alignItems: 'flex-end' },
  logoPill: { position: 'absolute', left: 0, top: 4, height: 24, paddingHorizontal: 10, borderRadius: 13, backgroundColor: '#F4F0E4', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-5deg' }] },
  logoPillTxt: { color: GREEN, fontWeight: '900', fontSize: 14, fontStyle: 'italic' },
  logoTxt: { color: LIME, fontWeight: '900', fontSize: 30, fontStyle: 'italic', lineHeight: 34 },
  logoStreak: { position: 'absolute', left: 32, right: 0, bottom: 0, height: 4, borderRadius: 2, backgroundColor: LIME, transform: [{ rotate: '-2deg' }] },

  heroWrap: { marginTop: 7, marginHorizontal: 25 },
  hero: { aspectRatio: 1.586, borderRadius: 27, overflow: 'hidden', borderWidth: 1, borderColor: '#4DB588' },
  heroLogo: { position: 'absolute', left: 18, top: 5, color: '#E3F54A', fontWeight: '900', fontSize: 30, fontStyle: 'italic', transform: [{ rotate: '-7deg' }] },
  heroStreak: { position: 'absolute', left: 1, top: 38, width: 116, height: 4.5, borderRadius: 3, backgroundColor: '#D6F03C', opacity: 0.9, transform: [{ rotate: '-13deg' }] },
  heroChip: { position: 'absolute', left: 19, top: 90 },
  heroNfc: { position: 'absolute', left: 80, top: 89 },
  heroDigits: { position: 'absolute', left: 20, bottom: 13 },
  heroBrand: { position: 'absolute', right: 14, bottom: 12, color: '#FFFFFF', fontWeight: '900', fontStyle: 'italic', fontSize: 26 },

  emptyHero: { marginTop: 7, height: 214.5, paddingTop: 57, alignItems: 'center' },

  sectionHead: { marginTop: 10.5, paddingHorizontal: 12, gap: 3, alignItems: 'flex-end' },

  row: { minHeight: 43, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BORDER, borderRadius: 12, backgroundColor: '#FFFFFF', paddingLeft: 11, overflow: 'hidden' },
  delBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#FBE3E6', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  chk: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  chkOn: { backgroundColor: '#DDF0D2' },
  chkOff: { borderWidth: 1.3, borderColor: '#C6CACF', backgroundColor: '#FFFFFF' },
  vDiv: { width: 1, height: 26, backgroundColor: '#D5D8DC', marginLeft: 11 },
  rowText: { flex: 1, paddingHorizontal: 12, alignItems: 'flex-end', justifyContent: 'center', minHeight: 40 },
  logoBlock: { width: 66, alignItems: 'center', justifyContent: 'center' },
  walletLogo: { width: 44, height: 34 },
  histIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF8D8', alignItems: 'center', justifyContent: 'center' },

  sep: { height: 24, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 7 },
  sepLine: { flex: 1, height: 1, backgroundColor: '#D5D8DC' },

  addBox: { marginTop: 19, marginHorizontal: 15, height: 83, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', gap: 12 },

  emptyHistory: { alignItems: 'center', marginTop: 4, paddingBottom: 8 },
});
