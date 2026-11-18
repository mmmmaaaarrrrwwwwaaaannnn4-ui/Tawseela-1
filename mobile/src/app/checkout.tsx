import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { WebView } from 'react-native-webview';

import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo, WalletProviderLogo } from '@/components/account/brand-logos';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { placeOrder } from '@/lib/checkout';
import { API_URL, api } from '@/lib/api';
import { cardBrandOf } from '@/data/seed';
import { useApp } from '@/store/app-store';
import { family } from '@/theme/typography';

/* ───────── Design tokens (taken from the screenshots, 3x px ÷ 3 = pt) ───────── */
const OLIVE = '#3E4A1D';          // اللون الزيتي الغامق (بدل البنفسجي)
const OLIVE_SOFT = '#EEF0E4';
const BG = '#FFFFFF';
const BAND = '#F2F3F5';           // الشريط الرمادي الفاصل بين الأقسام
const BORDER = '#E1E3E6';
const TEXT = '#1F1F1F';
const MUTED = '#777777';
const GREEN = '#2E7D32';          // علامة الصح + وقت التوصيل
const RED = '#D92D20';

const SERVICE_FEE = 5;            // رسوم خدمة ثابتة على كل الأوردرات
const MASK_WALLET_PHONE = true;   // false = يعرض رقم المحفظة كامل
const TIP_OPTIONS = [10, 15, 20];

const egp = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} ج.م`;

function clock(d: Date) {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'م' : 'ص'}`;
}

function distanceBetweenKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type Wallet = { id: string; provider: string; phone: string; name: string; isDefault: boolean };

export default function CheckoutScreen() {
  return (
    <RevealScope>
      <Checkout />
    </RevealScope>
  );
}

function Checkout() {
  useStatusBar();
  const insets = useSafeAreaInsets();
  const s = useApp(
    useShallow((st) => ({
      mode: st.mode,
      prep: st.prep,
      brands: st.brands,
      customerLocation: st.customerLocation,
      addr: st.addrs[st.addr] ?? st.addrs[0],
      payM: st.payM,
      cards: st.cards,
      defCard: st.defCard,
      note: st.note,
      cart: st.cart,
      promo: st.promo,
    })),
  );
  const t = useApp((st) => st.totals)();
  const set = useApp((st) => st.setCheckout);
  const toast = useApp.getState().showToast;

  /* ───────── وقت التوصيل: تحضير المطعم + 5 دقايق لكل كيلو ───────── */
  const cartBrandId = s.cart[0] ? useApp.getState().dishOf(s.cart[0].id).brand : '';
  const restaurant = s.brands.find((b) => b.id === cartBrandId);
  const distanceKm =
    restaurant?.lat != null && restaurant?.lng != null && s.customerLocation
      ? distanceBetweenKm(s.customerLocation.latitude, s.customerLocation.longitude, restaurant.lat, restaurant.lng)
      : null;
  const etaMinutes = restaurant
    ? Math.max(1, Math.ceil((restaurant.prepTime || s.prep) + (distanceKm == null ? 0 : distanceKm * 5)))
    : s.prep;
  const etaFrom = new Date(Date.now() + etaMinutes * 60000);
  const etaTo = new Date(Date.now() + (etaMinutes + 10) * 60000);

  /* ───────── أول طلب؟ (التوصيل مجاني لأول طلب فقط) ───────── */
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .get<{ orders: unknown[] }>('/v1/me/orders')
      .then((r) => { if (active) setIsFirstOrder(Array.isArray(r.orders) && r.orders.length === 0); })
      .catch(() => { if (active) setIsFirstOrder(false); });
    return () => { active = false; };
  }, []);

  /* ───────── الإكرامية + كود الخصم ───────── */
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState(false);
  const [promoText, setPromoText] = useState('');

  /* ───────── الحسابات ───────── */
  const isDelivery = s.mode !== 'pickup';
  const baseDelivery = isDelivery ? t.fee : 0;
  const delivery = isDelivery && isFirstOrder ? 0 : baseDelivery;
  const discount = s.promo ? t.disc : 0;
  const total = Math.max(0, t.sub - discount + delivery + SERVICE_FEE + tip);

  /* ───────── طرق الدفع ───────── */
  const [paying, setPaying] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);
  const [payPicked, setPayPicked] = useState<'cash' | 'online' | null>(null);
  const [savedCardCvv, setSavedCardCvv] = useState('');
  const [walletPhone, setWalletPhone] = useState('');
  const [walletProvider, setWalletProvider] = useState('');
  const [savedWallets, setSavedWallets] = useState<Wallet[]>([]);
  const [paymentSheet, setPaymentSheet] = useState(false);
  const [sheetSelection, setSheetSelection] = useState('');
  const [sheetError, setSheetError] = useState(false);
  const sheetErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    useApp.setState({ cards: [], defCard: '' });
    let active = true;
    api
      .get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards')
      .then((result) => {
        if (!active) return;
        const next = result.cards.map((x) => {
          const b = cardBrandOf(x.number.replace(/\D/g, ''));
          return {
            id: x.id,
            brand: b.name !== 'CARD' ? b.name : x.brand || b.name,
            num: x.number,
            exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '',
            bg: b.bg,
            nick: '',
            name: x.name,
          };
        });
        const cur = useApp.getState().defCard;
        useApp.setState({ cards: next, defCard: next.some((x) => x.id === cur) ? cur : next[0]?.id ?? '' });
      })
      .catch(() => { if (active) useApp.setState({ cards: [], defCard: '' }); })
      .finally(() => { if (active) setCardsReady(true); });
    return () => { active = false; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      api
        .get<{ wallets: Wallet[] }>('/v1/me/wallets')
        .then((r) => { if (active) setSavedWallets(Array.isArray(r.wallets) ? r.wallets : []); })
        .catch(() => { if (active) setSavedWallets([]); });
      return () => { active = false; };
    }, []),
  );
  useEffect(() => () => { if (sheetErrorTimer.current) clearTimeout(sheetErrorTimer.current); }, []);

  const flashSheetError = () => {
    setSheetError(true);
    if (sheetErrorTimer.current) clearTimeout(sheetErrorTimer.current);
    sheetErrorTimer.current = setTimeout(() => setSheetError(false), 3000); // 3 ثواني
  };

  const openPaymentSheet = () => { setSheetSelection(''); setSheetError(false); setPaymentSheet(true); };

  const chooseCash = () => {
    set({ payM: 2 });
    setPayPicked('cash');
    setPaymentSheet(false);
    setSheetError(false);
  };

  const confirmPaymentSelection = () => {
    if (!sheetSelection) { flashSheetError(); return; }
    if (sheetSelection.startsWith('card:')) {
      useApp.getState().makeDefaultCard(sheetSelection.slice(5));
      set({ payM: 1 });
      setWalletProvider('');
      setWalletPhone('');
    } else {
      const wallet = savedWallets.find((w) => w.id === sheetSelection.slice(7));
      if (!wallet) { flashSheetError(); return; }
      set({ payM: 3 });
      setWalletProvider(wallet.name);
      setWalletPhone(wallet.phone);
    }
    setPayPicked('online');
    setPaymentSheet(false);
    setSheetError(false);
  };

  // افترضت إن الـ API فيه DELETE على نفس المسارين — عدّل المسار لو مختلف
  const removeMethod = async (kind: 'card' | 'wallet', id: string) => {
    try {
      await api.delete(kind === 'card' ? `/v1/me/cards/${id}` : `/v1/me/wallets/${id}`);
      if (kind === 'card') {
        const cards = useApp.getState().cards.filter((c) => c.id !== id);
        useApp.setState({ cards, defCard: cards[0]?.id ?? '' });
      } else {
        setSavedWallets((w) => w.filter((x) => x.id !== id));
      }
      if (sheetSelection.endsWith(id)) setSheetSelection('');
    } catch {
      toast('تعذر الحذف', 'حاول مرة أخرى.', 'error');
    }
  };

  /* ───────── 3DS ───────── */
  const [threeDSUrl, setThreeDSUrl] = useState<string | null>(null);
  const [threeDSError, setThreeDSError] = useState(false);
  const [threeDSReload, setThreeDSReload] = useState(0);
  const challengeResolver = useRef<(() => void) | null>(null);
  const finishThreeDS = () => {
    setThreeDSUrl(null);
    challengeResolver.current?.();
    challengeResolver.current = null;
  };

  /* ───────── تنفيذ الطلب ───────── */
  const pay = async () => {
    if (paying || !s.cart.length) return;
    if (!payPicked) { toast('اختار طريقة دفع', 'اختار الدفع عند الاستلام أو بطاقة / محفظة.', 'error'); return; }
    if (s.payM !== 2 && s.payM !== 3 && !cardsReady) { toast('انتظر قليلًا', 'جارٍ تحميل بطاقات الدفع المحفوظة.', 'info'); return; }
    if (s.payM === 3 && !/^01[0125]\d{8}$/.test(walletPhone.replace(/[\s()-]/g, ''))) {
      toast('رقم المحفظة غير صحيح', 'أدخل رقم محفظة مصريًا صحيحًا يبدأ بـ 010 أو 011 أو 012 أو 015.', 'error');
      return;
    }
    const selectedCard = s.cards.find((c) => c.id === s.defCard);
    if ((s.payM === 0 || s.payM === 1) && (!selectedCard || !/^\d{3,4}$/.test(savedCardCvv))) {
      toast('أدخل رمز الأمان', 'اختر بطاقة محفوظة وأدخل رمز الأمان CVV لإتمام الدفع.', 'error');
      return;
    }
    setPaying(true);
    // ملحوظة: الإكرامية (tip) محتاجة تتبعت للسيرفر داخل placeOrder — شوف الملاحظات
    const r = await placeOrder(
      s.payM === 0 || s.payM === 1 ? { token: selectedCard!.id, cvv: savedCardCvv } : undefined,
      s.payM === 3 ? walletPhone : undefined,
      (url) => new Promise<void>((resolve) => {
        challengeResolver.current = resolve;
        setThreeDSError(false);
        setThreeDSUrl(url);
      }),
    );
    setSavedCardCvv('');
    setWalletPhone('');
    setPaying(false);
    if (r.ok) router.replace('/success');
    else if (r.priceChanged) toast('تم تحديث الأسعار', `السعر الجديد ${egp(r.total ?? total)}`, 'sync');
    else if (r.cancelled) toast('تم إلغاء الدفع', r.message, 'info');
    else toast('لم يتم تنفيذ الطلب', r.message, 'error');
  };

  const selectedCard = s.cards.find((c) => c.id === s.defCard);
  const last4 = (v: string) => v.replace(/\D/g, '').slice(-4);
  const payBtnLabel = paying
    ? s.payM === 2 ? 'جارٍ تأكيد الطلب…' : s.payM === 3 ? 'في انتظار موافقة المحفظة…' : 'جارٍ معالجة البطاقة…'
    : 'تنفيذ الطلب';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ───────── الهيدر ───────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.backSpacer} />
        <Txt s={19} w={600} style={{ color: TEXT }}>تنفيذ الطلب</Txt>
        <PressableScale onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Icon name="chevron_right" size={26} color={OLIVE} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 200 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* ───────── وقت التوصيل ───────── */}
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <PressableScale onPress={() => toast('قريبًا', 'جدولة الطلب هتتوفر قريبًا.', 'info')}>
              <Txt s={16} w={600} style={{ color: OLIVE }}>اختر موعد آخر</Txt>
            </PressableScale>
            <Txt s={22} w={800} style={styles.title}>{isDelivery ? 'وقت التوصيل' : 'وقت الاستلام'}</Txt>
          </View>
          <View style={styles.etaRow}>
            <Txt s={16} w={600} style={{ color: GREEN }}>
              {`سيصل ${clock(etaFrom)} - ${clock(etaTo)}`}
            </Txt>
            <Txt s={16} w={700} style={{ color: TEXT }}> ·  أسرع وقت</Txt>
            <Icon name="schedule" size={24} color={TEXT} />
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── العنوان + تعليمات المندوب ───────── */}
        <View style={styles.section}>
          <Txt s={22} w={800} style={styles.title}>{isDelivery ? 'عنوان التوصيل' : 'الاستلام من'}</Txt>
          {isDelivery ? (
            <PressableScale onPress={() => router.push('/addresses')} style={styles.addrRow}>
              <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                <Txt s={17} w={700} style={{ color: TEXT }}>{s.addr.tag}</Txt>
                <Txt s={15} style={{ color: MUTED }} numberOfLines={1}>{s.addr.l1}</Txt>
              </View>
              <Icon name="location_on" size={26} color={TEXT} />
            </PressableScale>
          ) : (
            <View style={styles.addrRow}>
              <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                <Txt s={17} w={700} style={{ color: TEXT }}>{restaurant?.name ?? ''}</Txt>
                <Txt s={15} style={{ color: MUTED }}>{`جاهز خلال ~${s.prep} دقيقة`}</Txt>
              </View>
              <Icon name="storefront" size={26} color={TEXT} />
            </View>
          )}
          <TextInput
            value={s.note}
            onChangeText={(v) => set({ note: v })}
            placeholder={isDelivery ? 'إضافة تعليمات للمندوب' : 'إضافة ملاحظة للمطعم'}
            placeholderTextColor={MUTED}
            multiline
            style={[styles.input, { fontFamily: family(500) }]}
          />
        </View>
        <View style={styles.band} />

        {/* ───────── الدفع ───────── */}
        <View style={styles.section}>
          <Txt s={22} w={800} style={styles.title}>الدفع</Txt>

          <PressableScale onPress={chooseCash} scaleTo={0.98} style={[styles.payOpt, payPicked === 'cash' && styles.payOptOn]}>
            <Dot on={payPicked === 'cash'} />
            <View style={styles.payOptLabel}>
              <Txt s={16} w={600} style={{ color: TEXT }}>الدفع عند الاستلام</Txt>
              <Icon name="payments" size={26} color={TEXT} />
            </View>
          </PressableScale>

          <PressableScale onPress={openPaymentSheet} scaleTo={0.98} style={[styles.payOpt, payPicked === 'online' && styles.payOptOn]}>
            <Dot on={payPicked === 'online'} />
            <View style={styles.payOptLabel}>
              <Txt s={16} w={600} style={{ color: TEXT }}>بطاقة ائتمان / محفظة كاش</Txt>
              <Icon name="credit_card" size={26} color={TEXT} />
            </View>
          </PressableScale>

          {payPicked === 'online' && s.payM === 3 ? (
            <View style={styles.pickedBox}>
              <Txt s={14} w={700} style={{ color: TEXT }}>{walletProvider || 'محفظة الموبايل'}</Txt>
              <Txt s={14} style={{ color: MUTED }}>{walletPhone}</Txt>
            </View>
          ) : null}

          {payPicked === 'online' && s.payM !== 3 && selectedCard ? (
            <View style={styles.pickedBox}>
              <Txt s={14} w={700} style={{ color: TEXT }}>{`${selectedCard.name || 'بطاقة محفوظة'} · •••• ${last4(selectedCard.num)}`}</Txt>
              <TextInput
                value={savedCardCvv}
                onChangeText={(v) => setSavedCardCvv(v.replace(/[^0-9]/g, '').slice(0, 4))}
                placeholder="رمز الأمان CVV"
                placeholderTextColor={MUTED}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                style={[styles.input, { minHeight: 52, fontFamily: family(500), marginTop: 6 }]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.band} />

        {/* ───────── أقساط بنكية + رصيد توصيلة (شكل فقط) ───────── */}
        <View style={styles.section}>
          <PressableScale onPress={() => toast('قريبًا', 'الأقساط البنكية هتتوفر قريبًا.', 'info')} style={styles.installCard}>
            <View style={styles.minChip}>
              <Txt s={13} style={{ color: MUTED }}>الحد الأدنى للطلب 500 ج.م</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.newBadge}><Txt s={14} w={600} style={{ color: '#1F7A7A' }}>New!</Txt></View>
              <Txt s={17} w={700} style={{ color: TEXT }}>أقساط بنكية</Txt>
              <Icon name="storefront" size={28} color={TEXT} />
            </View>
          </PressableScale>

          <View style={styles.balRow}>
            <Switch
              value={false}
              onValueChange={() => toast('رصيدك 0 ج.م', 'مفيش رصيد متاح في توصيلة دلوقتي.', 'info')}
              trackColor={{ false: '#B7B9BD', true: OLIVE }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#B7B9BD"
            />
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Txt s={16} w={700} style={{ color: TEXT }}>استخدم رصيد توصيلة</Txt>
              <Txt s={16} style={{ color: MUTED }}>{egp(0)}</Txt>
            </View>
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── الإكرامية ───────── */}
        {isDelivery ? (
          <>
            <View style={styles.section}>
              <Txt s={22} w={800} style={styles.title}>قدم الشكر بإكرامية</Txt>
              <Txt s={16} style={[styles.title, { color: MUTED, fontWeight: '400' }]}>سيحصل مندوب التوصيل على المبلغ بأكمله.</Txt>
              <View style={styles.chips}>
                <PressableScale
                  onPress={() => { setCustomTip(true); setTip(0); }}
                  style={[styles.chip, { minWidth: 62 }, customTip && styles.chipOn]}
                >
                  <Txt s={17} w={700} style={{ color: TEXT }}>آخر</Txt>
                </PressableScale>
                {[...TIP_OPTIONS].reverse().map((v) => (
                  <PressableScale
                    key={v}
                    onPress={() => { setCustomTip(false); setTip(tip === v ? 0 : v); }}
                    style={[styles.chip, { flex: 1 }, !customTip && tip === v && styles.chipOn]}
                  >
                    <Txt s={17} w={700} style={{ color: TEXT }}>{egp(v)}</Txt>
                  </PressableScale>
                ))}
              </View>
              {customTip ? (
                <TextInput
                  value={tip ? String(tip) : ''}
                  onChangeText={(v) => setTip(Number(v.replace(/[^0-9]/g, '').slice(0, 3)) || 0)}
                  placeholder="اكتب مبلغ الإكرامية"
                  placeholderTextColor={MUTED}
                  keyboardType="number-pad"
                  style={[styles.input, { minHeight: 52, fontFamily: family(500) }]}
                />
              ) : null}
            </View>
            <View style={styles.band} />
          </>
        ) : null}

        {/* ───────── كود الخصم ───────── */}
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <PressableScale onPress={() => toast('قريبًا', 'برنامج المكافآت هيتوفر قريبًا.', 'info')}>
              <Txt s={17} w={700} style={{ color: OLIVE }}>مكافآت برنامج توصيلة</Txt>
            </PressableScale>
            <Txt s={22} w={800} style={styles.title}>كود الخصم</Txt>
          </View>
          <View style={styles.promoBox}>
            <PressableScale onPress={() => { if (promoText.trim()) set({ promo: promoText.trim() } as never); }}>
              <Txt s={17} w={700} style={{ color: promoText.trim() ? OLIVE : MUTED }}>تفعيل</Txt>
            </PressableScale>
            <TextInput
              value={promoText}
              onChangeText={setPromoText}
              placeholder="اكتب كود الخصم هنا"
              placeholderTextColor={MUTED}
              autoCapitalize="characters"
              style={[styles.promoInput, { fontFamily: family(500) }]}
            />
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── ملخص الدفع ───────── */}
        <View style={[styles.section, { gap: 20 }]}>
          <Row label="المجموع" value={egp(t.sub)} />
          {discount > 0 ? <Row label="خصم" value={`− ${egp(discount)}`} valueColor={GREEN} /> : null}
          {isDelivery ? (
            isFirstOrder ? (
              <Row
                label="توصيل مجاني"
                tag="أول طلب"
                value={egp(0)}
                strike={baseDelivery > 0 ? egp(baseDelivery) : undefined}
              />
            ) : (
              <Row label="التوصيل" value={egp(baseDelivery)} />
            )
          ) : null}
          <Row label="رسوم الخدمة" value={egp(SERVICE_FEE)} />
          {tip > 0 ? <Row label="إكرامية المندوب" value={egp(tip)} /> : null}
        </View>
      </ScrollView>

      {/* ───────── البار السفلي: المجموع الكلي + زر التنفيذ ───────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={{ gap: 4 }}>
          <View style={styles.totalRow}>
            <Txt s={26} w={800} style={{ color: TEXT }}>{egp(total)}</Txt>
            <Txt s={22} w={800} style={{ color: TEXT }}>المجموع الكلي</Txt>
          </View>
          {/* شكل فقط: النسبة 1.4 تقريبية من الصورة، اربطها بنظام النقاط الحقيقي بعدين */}
          <View style={styles.pointsRow}>
            <Txt s={17} style={{ color: MUTED }}>{`ستكسب ${Math.round(total * 1.4)} من النقاط`}</Txt>
            <View style={styles.pointsDot}><Icon name="star" size={12} color="#FFFFFF" /></View>
          </View>
        </View>
        <PressableScale onPress={() => void pay()} style={[styles.cta, paying && { opacity: 0.85 }]}>
          {paying ? <ActivityIndicator color="#FFFFFF" style={{ marginEnd: 10 }} /> : null}
          <Txt s={19} w={700} color="#FFFFFF">{payBtnLabel}</Txt>
        </PressableScale>
      </View>

      {/* ───────── Bottom sheet: وسائل الدفع المحفوظة ───────── */}
      <Modal visible={paymentSheet} transparent animationType="slide" onRequestClose={chooseCash}>
        <View style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />
          <Txt s={20} w={700} style={{ color: TEXT, textAlign: 'right' }}>اختار طريقة الدفع</Txt>

          <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: 10 }} showsVerticalScrollIndicator={false}>
            {s.cards.map((card) => (
              <MethodRow
                key={card.id}
                selected={sheetSelection === 'card:' + card.id}
                onSelect={() => { setSheetSelection('card:' + card.id); setSheetError(false); }}
                onDelete={() => void removeMethod('card', card.id)}
                title={card.name || 'بطاقة محفوظة'}
                sub={`•••• •••• •••• ${last4(card.num)}`}
                logo={<PaymentNetworkLogo brand={card.brand} width={70} height={42} />}
              />
            ))}

            {savedWallets.length ? (
              <View style={styles.divLabelRow}>
                <View style={styles.divLine} />
                <Txt s={16} w={700} style={{ color: OLIVE }}>محافظ إلكترونية</Txt>
                <View style={styles.divLine} />
              </View>
            ) : null}

            {savedWallets.map((w) => (
              <MethodRow
                key={w.id}
                selected={sheetSelection === 'wallet:' + w.id}
                onSelect={() => { setSheetSelection('wallet:' + w.id); setSheetError(false); }}
                onDelete={() => void removeMethod('wallet', w.id)}
                title={w.name}
                sub={MASK_WALLET_PHONE ? `•••• •••• •••• ${last4(w.phone || '')}` : w.phone}
                logo={<WalletProviderLogo provider={w.name} width={70} height={52} />}
              />
            ))}

            {/* إضافة طريقة دفع: نفس التصميم وعلامة + مكان اللوجو */}
            <PressableScale
              style={styles.method}
              onPress={() => { setPaymentSheet(false); router.push('/payments'); }}
            >
              <View style={{ width: 40 + 8 + 38 }} />
              <View style={styles.vDiv} />
              <View style={styles.methodText}>
                <Txt s={16} w={700} style={{ color: TEXT }}>إضافة طريقة دفع</Txt>
              </View>
              <View style={styles.vDiv} />
              <View style={styles.logoBox}>
                <Icon name="add" size={34} color={TEXT} />
              </View>
            </PressableScale>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
            <PressableScale
              onPress={confirmPaymentSelection}
              style={[styles.sheetBtn, { backgroundColor: sheetError ? RED : OLIVE, borderColor: sheetError ? RED : OLIVE }]}
            >
              <Txt s={16} w={700} color="#FFFFFF">{sheetError ? 'اختار طريقة دفع' : 'متابعة'}</Txt>
            </PressableScale>
            <PressableScale
              onPress={chooseCash}
              style={[styles.sheetBtn, { backgroundColor: '#FFFFFF', borderColor: '#E6E8E6' }]}
            >
              <Txt s={16} w={700} style={{ color: TEXT }}>رجوع</Txt>
            </PressableScale>
          </View>
        </View>
      </Modal>

      {/* ───────── 3DS ───────── */}
      <Modal visible={!!threeDSUrl} transparent animationType="slide" onRequestClose={finishThreeDS}>
        <View style={styles.threeDSRoot}>
          <View style={styles.threeDSSheet}>
            <View style={styles.threeDSHeader}>
              <PressableScale onPress={finishThreeDS} style={styles.threeDSClose} accessibilityRole="button" accessibilityLabel="إغلاق التحقق">
                <Icon name="close" size={21} color={TEXT} />
              </PressableScale>
              <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Txt s={16} w={700}>التحقق من البنك</Txt>
                <Txt s={11.5} color={MUTED}>أدخل رمز التأكيد داخل التطبيق</Txt>
              </View>
              <View style={styles.threeDSEmpty} />
            </View>
            {threeDSUrl ? (
              <WebView
                key={threeDSReload}
                source={{ uri: threeDSUrl }}
                style={styles.threeDSWebView}
                javaScriptEnabled
                domStorageEnabled
                sharedCookiesEnabled={false}
                thirdPartyCookiesEnabled
                setSupportMultipleWindows={false}
                originWhitelist={['https://*']}
                onShouldStartLoadWithRequest={(request) => {
                  let returnUrl = '';
                  try { returnUrl = decodeURIComponent(new URL(threeDSUrl).searchParams.get('merchantRedirect') || ''); } catch {}
                  const target = request.url;
                  const isReturn =
                    target.startsWith(API_URL + '/v1/payments/kashier/return') ||
                    (returnUrl.length > 0 && target.startsWith(returnUrl));
                  if (isReturn) { finishThreeDS(); return false; }
                  return target.startsWith('https://');
                }}
                onError={() => setThreeDSError(true)}
                onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) setThreeDSError(true); }}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.threeDSLoading}><Txt s={13} color={MUTED}>جارٍ تحميل صفحة التحقق الآمنة…</Txt></View>
                )}
              />
            ) : null}
            {threeDSError ? (
              <View style={styles.threeDSError}>
                <Txt s={13} w={600} color={RED}>تعذر تحميل صفحة البنك. تحقق من اتصال الإنترنت وحاول مرة أخرى.</Txt>
                <PressableScale onPress={() => { setThreeDSError(false); setThreeDSReload((v) => v + 1); }}>
                  <Txt s={13} w={700} color={OLIVE}>إعادة المحاولة</Txt>
                </PressableScale>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ───────── مكونات صغيرة ───────── */

function Dot({ on }: { on: boolean }) {
  return (
    <View style={[styles.dot, on && { borderColor: OLIVE }]}>
      {on ? <View style={styles.dotInner} /> : null}
    </View>
  );
}

function Row({ label, value, tag, strike, valueColor }: { label: string; value: string; tag?: string; strike?: string; valueColor?: string }) {
  return (
    <View style={styles.sumRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {strike ? <Txt s={17} style={{ color: MUTED, textDecorationLine: 'line-through' }}>{strike}</Txt> : null}
        <Txt s={17} style={{ color: valueColor ?? TEXT }}>{value}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {tag ? (
          <View style={styles.tag}><Txt s={13} w={700} style={{ color: OLIVE }}>{tag}</Txt></View>
        ) : null}
        <Txt s={17} style={{ color: TEXT }}>{label}</Txt>
      </View>
    </View>
  );
}

/** صف وسيلة دفع في الـ Sheet: [حذف][صح] | الاسم + الرقم | اللوجو */
function MethodRow({
  selected, onSelect, onDelete, title, sub, logo,
}: { selected: boolean; onSelect: () => void; onDelete: () => void; title: string; sub: string; logo: React.ReactNode }) {
  return (
    <PressableScale style={[styles.method, selected && { borderColor: OLIVE, backgroundColor: OLIVE_SOFT }]} onPress={onSelect}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PressableScale onPress={onDelete} style={styles.trash} accessibilityRole="button" accessibilityLabel="حذف">
          <Icon name="delete" size={20} color="#E11D1D" />
        </PressableScale>
        <View style={[styles.check, selected && styles.checkOn]}>
          <Icon name="check" size={20} color={selected ? GREEN : '#C4C8C6'} />
        </View>
      </View>
      <View style={styles.vDiv} />
      <View style={styles.methodText}>
        <Txt s={17} w={800} style={{ color: TEXT }}>{title}</Txt>
        <Txt s={15} style={{ color: MUTED, letterSpacing: 0.5 }}>{sub}</Txt>
      </View>
      <View style={styles.vDiv} />
      <View style={styles.logoBox}>{logo}</View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, backgroundColor: BG },
  back: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  backSpacer: { width: 44, height: 44 },

  band: { height: 16, backgroundColor: BAND },
  installCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 66, borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 16, backgroundColor: '#FFFFFF' },
  newBadge: { backgroundColor: '#EAF4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  minChip: { backgroundColor: BAND, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointsDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: OLIVE, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, paddingVertical: 22, gap: 14 },
  title: { textAlign: 'right', alignSelf: 'stretch', color: TEXT },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },

  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16, minHeight: 58, fontSize: 16, color: TEXT, textAlign: 'right', textAlignVertical: 'top', backgroundColor: '#FFFFFF' },

  payOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF' },
  payOptOn: { borderColor: OLIVE, backgroundColor: OLIVE_SOFT },
  payOptLabel: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#CFD2D6', alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: OLIVE },
  pickedBox: { borderRadius: 14, backgroundColor: BAND, padding: 14, gap: 4, alignItems: 'flex-end' },

  chips: { flexDirection: 'row', gap: 10, marginTop: 4 },
  chip: { height: 43, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: OLIVE, backgroundColor: OLIVE_SOFT },

  promoBox: { flexDirection: 'row', alignItems: 'center', height: 58, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, gap: 12 },
  promoInput: { flex: 1, fontSize: 17, color: TEXT, textAlign: 'right', paddingVertical: 0 },

  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { backgroundColor: OLIVE_SOFT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cta: { height: 56, borderRadius: 14, backgroundColor: OLIVE, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },

  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#C9C9C9', marginBottom: 4 },
  method: { minHeight: 80, borderRadius: 18, borderWidth: 1, borderColor: '#E1E3E6', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF' },
  trash: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FBE4E4', alignItems: 'center', justifyContent: 'center' },
  check: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: '#C4C8C6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkOn: { backgroundColor: '#E3F4DC', borderColor: '#E3F4DC' },
  vDiv: { width: 1, height: 44, backgroundColor: '#D8DDD9' },
  methodText: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  logoBox: { width: 76, alignItems: 'center', justifyContent: 'center' },
  divLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  divLine: { flex: 1, height: 1, backgroundColor: '#D5D8DC' },
  sheetBtn: { flex: 1, height: 54, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  threeDSRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  threeDSSheet: { height: '94%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', paddingTop: 12, backgroundColor: BG },
  threeDSHeader: { minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BAND, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  threeDSClose: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  threeDSEmpty: { width: 40, height: 40 },
  threeDSWebView: { flex: 1, backgroundColor: '#FFFFFF' },
  threeDSLoading: { position: 'absolute', top: '48%', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  threeDSError: { position: 'absolute', bottom: 20, left: 16, right: 16, padding: 14, borderRadius: 16, gap: 10, backgroundColor: BAND },
});
