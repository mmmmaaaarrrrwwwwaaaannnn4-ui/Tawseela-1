import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useShallow } from 'zustand/react/shallow';
import { Map as MapLibre, Camera as MapCamera, GeoJSONSource, Layer, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Image } from 'expo-image';
import { Camera, ImagePlus, Mic, X } from 'lucide-react-native';

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
import { useSession } from '@/store/session';
import { family } from '@/theme/typography';

/* ───────── الألوان: مستخرجة من لوجو توصيلة ───────── */
const BRAND = '#12291F';        // الأخضر الغامق (خلفية اللوجو)
const BRAND_SOFT = '#EAF0EB';
const LIME = '#D4EA45';         // الأخضر الليموني (كلمة توصيلة)
const BG = '#FFFFFF';
const BAND = '#F2F3F5';
const BORDER = '#E1E3E6';
const TEXT = '#1F1F1F';
const MUTED = '#7A7A7A';
const GREEN = '#2E7D32';
const RED = '#D92D20';

const SERVICE_FEE = 5;
const TIP_OPTIONS = [10, 20, 30];

/** خط واحد لكل حقول الإدخال (نفس خط باقي نصوص الصفحة) */
const INPUT_FONT = { fontFamily: family(500), fontSize: 14, color: TEXT } as const;

const egp = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} ج.م`;
const egp2 = (n: number) => `${n.toFixed(2)} ج.م`;

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

/** يحدد شبكة البطاقة من اسم الـ brand أو من أول أرقام البطاقة */
function networkOf(brand: string, num: string): 'visa' | 'mastercard' | 'meeza' | 'amex' {
  const b = (brand || '').toLowerCase();
  if (b.includes('amex') || b.includes('american')) return 'amex';
  if (b.includes('master')) return 'mastercard';
  if (b.includes('visa')) return 'visa';
  if (b.includes('meeza') || b.includes('ميزة')) return 'meeza';
  const d = (num || '').replace(/\D/g, '');
  if (/^3[47]/.test(d)) return 'amex';
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'mastercard';
  if (/^507803/.test(d)) return 'meeza';
  return 'mastercard';
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
      speed: st.speed,
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
  const [roadDistanceKm, setRoadDistanceKm] = useState<number | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const customerPhoto = useSession((st) => st.user?.photo ?? null);

  /* ───────── وقت التوصيل ───────── */
  const restaurants = s.cart.reduce<typeof s.brands>((list, item) => {
    const brandId = useApp.getState().dishOf(item.id).brand;
    const brand = s.brands.find((candidate) => candidate.id === brandId);
    if (brand && !list.some((candidate) => candidate.id === brand.id)) list.push(brand);
    return list;
  }, []);
  const restaurant = restaurants[0];
  const isDelivery = s.mode !== 'pickup';
  // A saved delivery address is authoritative. Never draw a route to the phone's live location instead.
  const deliveryPoint = isDelivery && s.addr?.latitude != null && s.addr?.longitude != null
    ? { latitude: s.addr.latitude, longitude: s.addr.longitude }
    : null;
  const allRestaurantsPinned = restaurants.length > 0 && restaurants.every((item) => item.lat != null && item.lng != null);
  const routeStops = deliveryPoint && allRestaurantsPinned ? restaurants : [];
  const routeKey = routeStops.map((item) => `${item.id}:${item.lat}:${item.lng}`).join('|') + `|${deliveryPoint?.latitude ?? ''}:${deliveryPoint?.longitude ?? ''}`;
  useEffect(() => {
    let active = true;
    if (!isDelivery || routeStops.length === 0 || !deliveryPoint) {
      setRoadDistanceKm(null);
      setRouteCoordinates([]);
      return () => { active = false; };
    }
    setRoadDistanceKm(null);
    setRouteCoordinates([]);
    const stops = [...routeStops.map((item) => [item.lng!, item.lat!] as [number, number]), [deliveryPoint.longitude, deliveryPoint.latitude] as [number, number]];
    const coordinates = stops.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    fetch(url)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Route unavailable')))
      .then((data: { routes?: { distance?: number; geometry?: { coordinates?: [number, number][] } }[] }) => {
        const route = data.routes?.[0];
        const meters = route?.distance;
        if (active && typeof meters === 'number' && Number.isFinite(meters) && meters > 0) setRoadDistanceKm(meters / 1000);
        if (active && Array.isArray(route?.geometry?.coordinates) && route.geometry.coordinates.length > 1) setRouteCoordinates(route.geometry.coordinates);
      })
      .catch(() => { if (active) { setRoadDistanceKm(null); setRouteCoordinates([]); } });
    return () => { active = false; };
  }, [routeKey, isDelivery]);
  const distanceKm = roadDistanceKm;
  const hasMapRoute = isDelivery && routeStops.length > 0 && !!deliveryPoint;
  const mapCenter: [number, number] | null = hasMapRoute
    ? [(routeStops.reduce((sum, item) => sum + item.lng!, deliveryPoint!.longitude) / (routeStops.length + 1)), (routeStops.reduce((sum, item) => sum + item.lat!, deliveryPoint!.latitude) / (routeStops.length + 1))]
    : null;
  const routeFeature = routeCoordinates.length > 1 ? {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: routeCoordinates },
  } : null;
  /* ───────── أول طلب ───────── */
  const [isFirstOrder, setIsFirstOrder] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .get<{ orders: unknown[] }>('/v1/me/orders')
      .then((r) => { if (active) setIsFirstOrder(Array.isArray(r.orders) && r.orders.length === 0); })
      .catch(() => { if (active) setIsFirstOrder(false); });
    return () => { active = false; };
  }, []);

  /* ───────── إكرامية + كود خصم ───────── */
  const [tip, setTip] = useState(0);
  const [customTip, setCustomTip] = useState(false);
  const [deliveryInstruction, setDeliveryInstruction] = useState<'call' | 'no_bell' | 'reception' | 'ring' | null>('call');
  const [saveDeliveryInstruction, setSaveDeliveryInstruction] = useState(false);
  const [instructionReady, setInstructionReady] = useState(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('tawseela.checkout.delivery-instruction').then((raw) => {
      if (!active || !raw) return;
      try {
        const saved = JSON.parse(raw) as { instruction?: typeof deliveryInstruction; enabled?: boolean };
        if (saved.instruction) setDeliveryInstruction(saved.instruction);
        setSaveDeliveryInstruction(saved.enabled === true);
      } catch { /* Ignore an invalid local preference. */ }
    }).finally(() => { if (active) setInstructionReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!instructionReady) return;
    if (saveDeliveryInstruction && deliveryInstruction) {
      void AsyncStorage.setItem('tawseela.checkout.delivery-instruction', JSON.stringify({ instruction: deliveryInstruction, enabled: true }));
    } else {
      void AsyncStorage.removeItem('tawseela.checkout.delivery-instruction');
    }
  }, [deliveryInstruction, saveDeliveryInstruction, instructionReady]);
  const [promoText, setPromoText] = useState('');
  const [scheduleSheet, setScheduleSheet] = useState(false);
  const [scheduleOffsetMinutes, setScheduleOffsetMinutes] = useState(0);
  const scheduleWheelRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const rushDelivery = s.speed === 1;
  const [noteImages, setNoteImages] = useState<string[]>([]);
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(s.note);
  const noteDraftRef = useRef(s.note);
  const [speechActive, setSpeechActive] = useState(false);
  const [speechProcessing, setSpeechProcessing] = useState(false);
  const speechBaseRef = useRef('');
  const speechFinalRef = useRef('');
  const pendingNoteSaveRef = useRef(false);
  const updateNoteDraft = (value: string) => { noteDraftRef.current = value; setNoteDraft(value); };
  const closeNoteSheet = () => {
    if (speechActive) ExpoSpeechRecognitionModule.abort();
    setSpeechActive(false);
    setSpeechProcessing(false);
    pendingNoteSaveRef.current = false;
    Keyboard.dismiss();
    setNoteSheetOpen(false);
  };
  const saveNoteDraft = () => {
    if (speechActive) {
      pendingNoteSaveRef.current = true;
      setSpeechProcessing(true);
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    useApp.getState().setCheckout({ note: noteDraftRef.current });
    Keyboard.dismiss();
    setNoteSheetOpen(false);
  };
  const toggleNoteSpeech = async () => {
    if (speechActive) {
      setSpeechProcessing(true);
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        toast('إذن الميكروفون مطلوب', 'اسمح لتوصيلة باستخدام الميكروفون والتعرف على الكلام لتحويل صوتك إلى نص.', 'error');
        return;
      }
      speechBaseRef.current = noteDraftRef.current.trim();
      speechFinalRef.current = '';
      setSpeechProcessing(false);
      ExpoSpeechRecognitionModule.start({
        lang: 'ar-EG',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: true,
        recordingOptions: { persist: false },
      });
    } catch {
      setSpeechActive(false);
      setSpeechProcessing(false);
      toast('التعرف الصوتي غير متاح', 'تعذر تشغيل التعرف الصوتي المحلي على هذا الجهاز. يمكنك كتابة الملاحظة يدويًا.', 'error');
    }
  };
  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener('start', () => {
      setSpeechActive(true);
      setSpeechProcessing(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      const transcript = event.results?.[0]?.transcript?.trim() ?? '';
      if (!transcript) return;
      if (event.isFinal) {
        speechFinalRef.current = [speechFinalRef.current, transcript].filter(Boolean).join(' ');
        updateNoteDraft([speechBaseRef.current, speechFinalRef.current].filter(Boolean).join(' '));
      } else {
        updateNoteDraft([speechBaseRef.current, speechFinalRef.current, transcript].filter(Boolean).join(' '));
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
      setSpeechActive(false);
      setSpeechProcessing(false);
      if (pendingNoteSaveRef.current) {
        pendingNoteSaveRef.current = false;
        useApp.getState().setCheckout({ note: noteDraftRef.current });
        Keyboard.dismiss();
        setNoteSheetOpen(false);
      }
    });
    const errorListener = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      setSpeechActive(false);
      setSpeechProcessing(false);
      if (event.error !== 'aborted') {
        toast('تعذر تحويل الصوت', 'لم نتمكن من التعرف على الكلام. جرّب مرة أخرى أو اكتب الملاحظة.', 'error');
      }
    });
    return () => {
      startListener.remove();
      resultListener.remove();
      endListener.remove();
      errorListener.remove();
      ExpoSpeechRecognitionModule.abort();
    };
  }, []);
  const scheduledFrom = new Date(Date.now() + ((restaurant?.prepTime ?? s.prep) + (distanceKm == null ? 0 : distanceKm * 5 * (s.speed === 1 ? 0.5 : 1)) + scheduleOffsetMinutes) * 60000);
  const scheduledTo = new Date(scheduledFrom.getTime() + 10 * 60000);
  

  /* ───────── الحسابات ───────── */
  const baseDelivery = isDelivery ? t.fee : 0;
  const delivery = isDelivery && isFirstOrder ? 0 : baseDelivery;
  const discount = s.promo ? t.disc : 0;
  const total = Math.max(0, t.sub - discount + delivery + (t.speedFee ?? 0) + SERVICE_FEE + tip);
  const savings = discount + (isDelivery && isFirstOrder ? baseDelivery : 0);

  /* ───────── الدفع ───────── */
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
    sheetErrorTimer.current = setTimeout(() => setSheetError(false), 3000);
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
    // Persist the selected doorstep instruction in the order note without changing the customer's saved free-text note.
    const originalNote = useApp.getState().note;
    const instructionLabels = { call: 'اتصل عند الوصول', no_bell: 'لا تطرق الجرس', reception: 'اتركه بالاستقبال', ring: 'اطرق الجرس' } as const;
    if (isDelivery && deliveryInstruction) useApp.getState().setCheckout({ note: [originalNote, instructionLabels[deliveryInstruction]].filter(Boolean).join(' · ') });
    // ملحوظة: الإكرامية (tip) لازم تتبعت للسيرفر داخل placeOrder
    const r = await placeOrder(
      s.payM === 0 || s.payM === 1 ? { token: selectedCard!.id, cvv: savedCardCvv } : undefined,
      s.payM === 3 ? walletPhone : undefined,
      (url) => new Promise<void>((resolve) => {
        challengeResolver.current = resolve;
        setThreeDSError(false);
        setThreeDSUrl(url);
      }),
    );
    useApp.getState().setCheckout({ note: originalNote });
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

  const cardLogo = (brand: string, num: string, id: string, w: number, h: number) => {
    const raw = (brand || '').toLowerCase();
    let network = networkOf(brand, num);
    if (!/visa|master|meeza|amex/i.test(raw) && !/^(4|3[47]|(5[1-5]|2[2-7])|507803)/.test((num || '').replace(/\\D/g, ''))) {
      const hash = [...id].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
      network = (['visa', 'mastercard', 'meeza'] as const)[hash % 3];
    }
    return <PaymentNetworkLogo brand={network.toUpperCase()} width={w} height={h} />;
  };
  const walletLogo = (name: string, phone: string, w: number, h: number) => (
    <WalletProviderLogo provider={name} phone={phone} width={w} height={h} />
  );
  const pickNoteImage = async (camera: boolean) => {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast('الإذن مطلوب', camera ? 'اسمح لتوصيلة باستخدام الكاميرا لإضافة صورة للمندوب.' : 'اسمح لتوصيلة بالوصول إلى الصور لإرفاق صورة للمندوب.', 'error');
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      setNoteImages((items) => [...items, result.assets[0].uri].slice(0, 4));
      setNoteSheetOpen(true);
    }
  };

  const soon = (title: string) => () => toast('قريبًا', `${title} هتتوفر قريبًا.`, 'info');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ───────── الهيدر ───────── */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.backSpacer} />
        <Txt s={16} w={600} style={{ color: TEXT }}>تنفيذ الطلب</Txt>
        <PressableScale onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="رجوع">
          <Icon name="chevron_right" size={22} color={BRAND} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 170 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {/* العنوان والخريطة: لا نعرض مسارًا إلا من إحداثيات العنوان المحفوظ والمطعم الفعلية */}
        {isDelivery ? (
          <View style={styles.section}>
            <View style={styles.checkoutCard}>
              {hasMapRoute && mapCenter ? (
                <View style={styles.orderMap}>
                  <MapLibre mapStyle="https://tiles.openfreemap.org/styles/liberty" attribution logo={false} compass style={StyleSheet.absoluteFill}>
                    <MapCamera initialViewState={{ center: mapCenter, zoom: 12, pitch: 0, bearing: 0 }} />
                    {routeFeature ? <GeoJSONSource data={{ type: 'FeatureCollection', features: [routeFeature] }}><Layer type="line" paint={{ "line-color": "#4C5B42", "line-width": 5, "line-opacity": 0.95 }} layout={{ "line-cap": "round", "line-join": "round" }} /></GeoJSONSource> : null}
                    {routeStops.map((stop) => (
                      <ViewAnnotation key={stop.id} lngLat={[stop.lng!, stop.lat!]} anchor="bottom">
                        <View style={styles.tawseelaPin}>
                          <View style={styles.tawseelaPinPhotoFrame}><Image source={{ uri: stop.img }} style={styles.tawseelaPinPhoto} contentFit="cover" /></View>
                          <View style={styles.tawseelaPinTail} />
                        </View>
                      </ViewAnnotation>
                    ))}
                    <ViewAnnotation lngLat={[deliveryPoint!.longitude, deliveryPoint!.latitude]} anchor="bottom">
                      <View style={styles.tawseelaPin}>
                        <View style={styles.tawseelaPinPhotoFrame}><Image source={customerPhoto ? { uri: customerPhoto } : require('../../assets/images/icon.png')} style={styles.tawseelaPinPhoto} contentFit="cover" /></View>
                        <View style={styles.tawseelaPinTail} />
                      </View>
                    </ViewAnnotation>
                  </MapLibre>
                </View>
              ) : (
                <View style={[styles.orderMap, styles.mapUnavailable]}>
                  <Icon name="location_on" size={28} color={MUTED} />
                  <Txt s={13} w={600} color={TEXT}>لا يمكن رسم الطريق بعد</Txt>
                  <Txt s={11.5} color={MUTED}>اختر عنوانًا محفوظًا بموقع محدد، وتأكد من إضافة موقع المطعم من لوحة الإدارة.</Txt>
                </View>
              )}
              <View style={styles.addressDetails}>
                <View style={{ flex: 1, gap: 4, alignItems: 'flex-end' }}>
                  <Txt s={16} w={700} color={TEXT}>{s.addr?.tag ?? 'عنوان التوصيل'}</Txt>
                  <Txt s={13} w={500} color={MUTED} style={{ textAlign: 'right' }}>{s.addr?.l1 || 'لم يتم تحديد الشارع'}</Txt>
                  <Txt s={12} color={MUTED} style={{ textAlign: 'right' }}>{s.addr?.l2 || 'لم يتم تحديد المنطقة والمدينة'}</Txt>
                  {s.addr?.phone ? <Txt s={12} color={MUTED}>{s.addr.phone}</Txt> : null}
                </View>
                <Icon name="location_on" size={22} color={BRAND} />
              </View>
              <View style={styles.addressActions}>
                <PressableScale onPress={() => router.push('/addresses')}><Txt s={13} w={700} color={BRAND}>تغيير العنوان</Txt></PressableScale>
                {routeCoordinates.length > 1 ? <Txt s={11.5} color={MUTED}>{roadDistanceKm != null ? `المسافة عبر الطريق ${roadDistanceKm.toFixed(1)} كم` : 'مسار الطرق متاح'}</Txt> : <Txt s={11.5} color={MUTED}>المسار الفعلي غير متاح حاليًا</Txt>}
              </View>
              {!deliveryPoint ? <View style={styles.addressWarning}><Txt s={12} color={TEXT}>العنوان لا يحتوي على إحداثيات دقيقة. افتح تغيير العنوان وحدد نقطة التوصيل على الخريطة.</Txt></View> : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.checkoutCard}>
              <Txt s={16} w={700} color={TEXT}>{restaurant?.name ?? 'مكان الاستلام'}</Txt>
              <Txt s={13} color={MUTED}>{restaurant?.address || `جاهز خلال حوالي ${s.prep} دقيقة`}</Txt>
            </View>
          </View>
        )}
        {/* ───────── وقت التوصيل ───────── */}
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <PressableScale onPress={() => setScheduleSheet(true)}>
              <Txt s={13} w={600} style={{ color: TEXT }}>اختر موعد آخر</Txt>
            </PressableScale>
            <Txt s={17} w={700} style={styles.titleInline}>{isDelivery ? 'وقت التوصيل' : 'وقت الاستلام'}</Txt>
          </View>
          <View style={styles.etaRow}>
            <Txt s={14} w={600} style={{ color: GREEN }}>{`سيصل ${clock(scheduledFrom)} - ${clock(scheduledTo)}`}</Txt>
            <Icon name="schedule" size={20} color={TEXT} />
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── الإكرامية ───────── */}
        {isDelivery ? (
          <>
            <View style={styles.section}>
              <Txt s={17} w={700} style={styles.title}>قدم الشكر بإكرامية</Txt>
              <Txt s={13} w={500} style={[styles.title, { color: MUTED }]}>سيحصل مندوب التوصيل على المبلغ بأكمله.</Txt>
              <View style={styles.chips}>
                <PressableScale onPress={() => { setCustomTip(true); setTip(0); }} style={[styles.chip, { minWidth: 56 }, customTip && styles.chipOn]}>
                  <Txt s={14} w={700} style={{ color: TEXT }}>آخر</Txt>
                </PressableScale>
                {[...TIP_OPTIONS].reverse().map((v) => (
                  <PressableScale
                    key={v}
                    onPress={() => { setCustomTip(false); setTip(tip === v ? 0 : v); }}
                    style={[styles.chip, { flex: 1 }, !customTip && tip === v && styles.chipOn]}
                  >
                    <Txt s={14} w={700} style={{ color: TEXT }}>{egp(v)}</Txt>
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
                  style={[styles.input, INPUT_FONT, { minHeight: 46 }]}
                />
              ) : null}
            </View>
            <View style={styles.band} />
          </>
        ) : null}


        {/* تعليمات التوصيل */}
        {isDelivery ? (
          <View style={styles.section}>
            <View style={styles.checkoutCard}>
              <Txt s={17} w={700} color={TEXT}>تعليمات التوصيل</Txt>
              <View style={styles.instructionGrid}>
                {([
                  ['call', 'اتصل عند الوصول', 'call'],
                  ['no_bell', 'لا تطرق الجرس', 'notifications'],
                  ['reception', 'اتركه بالاستقبال', 'room_service'],
                  ['ring', 'اطرق الجرس', 'notifications'],
                ] as const).map(([key, label, icon]) => (
                  <PressableScale key={key} onPress={() => setDeliveryInstruction(key)} style={[styles.instructionTile, deliveryInstruction === key && styles.instructionTileOn]}>
                    <Icon name={icon} size={23} color={deliveryInstruction === key ? BRAND : TEXT} />
                    <Txt s={13} w={700} color={TEXT} style={{ textAlign: 'center' }}>{label}</Txt>
                  </PressableScale>
                ))}
              </View>
              <PressableScale onPress={() => setSaveDeliveryInstruction((v) => !v)} style={styles.saveInstruction}>
                <View style={[styles.instructionCheck, saveDeliveryInstruction && styles.instructionCheckOn]}>{saveDeliveryInstruction ? <Icon name="check" size={13} color="#FFFFFF" /> : null}</View>
                <Txt s={13} color={TEXT}>استخدم تعليماتي لهذا العنوان في المرة القادمة</Txt>
              </PressableScale>
            </View>
          </View>
        ) : null}

        {/* طرق الدفع بنفس ترتيب المرجع */}
        <View style={styles.section}>
          <Txt s={18} w={800} color={TEXT} style={styles.title}>الدفع من خلال</Txt>
          <View style={styles.paymentCard}>
            <PressableScale onPress={soon('Apple Pay')} style={styles.paymentRow}>
              <Dot on={false} />
              <View style={styles.payOptLabel}><Txt s={15} w={600} color={TEXT}>Apple Pay</Txt><View style={styles.applePayMark}><Txt s={10} w={700} color={TEXT}>Pay</Txt></View></View>
            </PressableScale>
            <View style={styles.paymentDivider} />
            <PressableScale onPress={() => { setPayPicked('online'); openPaymentSheet(); }} style={styles.paymentRow}>
              <Dot on={payPicked === 'online'} />
              <View style={styles.payOptLabel}><Txt s={15} w={700} color={TEXT}>أضف بطاقة جديدة / محفظة</Txt><Icon name="add_card" size={23} color={TEXT} /></View>
            </PressableScale>
            <View style={styles.paymentDivider} />
            <PressableScale onPress={chooseCash} style={styles.paymentRow}>
              <Dot on={payPicked === 'cash'} />
              <View style={styles.payOptLabel}><Txt s={15} w={700} color={TEXT}>نقدًا</Txt><Icon name="payments" size={23} color={TEXT} /></View>
            </PressableScale>
            <View style={styles.pciStrip}><Icon name="info" size={17} color="#1266B3" /><Txt s={12} w={600} color="#1266B3">مؤمّن وفق معايير حماية بيانات الدفع (PCI)</Txt><Icon name="shield_lock" size={18} color="#1266B3" /></View>
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── رصيد توصيلة ───────── */}
        <View style={[styles.section, { paddingVertical: 14 }]}>
          <View style={styles.balRow}>
            <Switch
              value={false}
              onValueChange={() => toast('رصيدك 0 ج.م', 'مفيش رصيد متاح في توصيلة دلوقتي.', 'info')}
              trackColor={{ false: '#B7B9BD', true: BRAND }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#B7B9BD"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Txt s={14} w={700} style={{ color: TEXT }}>استخدم رصيد توصيلة</Txt>
              <Txt s={13} w={500} style={{ color: MUTED }}>{egp(0)}</Txt>
            </View>
          </View>
        </View>
        <View style={styles.band} />

        {/* ───────── كود الخصم ───────── */}
        <View style={styles.section}>
          <View style={styles.titleRow}>
            <PressableScale onPress={soon('برنامج المكافآت')}>
              <Txt s={13} w={700} style={{ color: BRAND }}>مكافآت برنامج توصيلة</Txt>
            </PressableScale>
            <Txt s={17} w={700} style={styles.titleInline}>كود الخصم</Txt>
          </View>
          <View style={styles.promoBox}>
            <PressableScale onPress={() => { if (promoText.trim()) set({ promo: promoText.trim() } as never); }}>
              <Txt s={14} w={700} style={{ color: promoText.trim() ? BRAND : MUTED }}>تفعيل</Txt>
            </PressableScale>
            <TextInput
              value={promoText}
              onChangeText={setPromoText}
              placeholder="اكتب كود الخصم هنا"
              placeholderTextColor={MUTED}
              autoCapitalize="characters"
              style={[styles.promoInput, INPUT_FONT]}
            />
          </View>
        </View>
        <View style={styles.band} />

        {/* ملاحظة الطلب: ملخص فقط، والتحرير داخل Bottom Sheet */}
        <View style={styles.section}>
          <Txt s={17} w={700} style={styles.title}>ملاحظات إضافية</Txt>
          <PressableScale onPress={() => { updateNoteDraft(s.note); setNoteSheetOpen(true); }} style={styles.noteSummary}>
            <Icon name="edit_note" size={22} color={BRAND} />
            <Txt s={14} w={500} style={{ color: s.note.trim() ? TEXT : MUTED, flex: 1, textAlign: 'right' }} numberOfLines={2}>{s.note.trim() || 'هل تود أن تخبرنا أي شيء آخر؟'}</Txt>
          </PressableScale>
          {noteImages.length ? <View style={styles.noteImages}>{noteImages.map((uri) => <View key={uri} style={styles.noteImageWrap}><Image source={{ uri }} style={styles.noteImage} contentFit="cover" /><PressableScale onPress={() => setNoteImages((items) => items.filter((item) => item !== uri))} style={styles.removeNoteImage}><X size={11} color="#111111" /></PressableScale></View>)}</View> : null}
        </View>

        {/* ───────── ملخّص الدفع (نفس تصميم الصورة) ───────── */}
        <View style={[styles.section, { gap: 16, paddingTop: 8 }]}>
          <Txt s={17} w={700} style={styles.title}>ملخّص الدفع</Txt>
          <Row label="المجموع الفرعي" value={egp2(t.sub)} />
          {discount > 0 ? <Row label="خصم" gem value={`- ${egp2(discount)}`} valueColor={GREEN} /> : null}
          {isDelivery ? (
            isFirstOrder ? (
              <Row label="توصيل مجاني" tag="أول طلب" info value={egp2(0)} strike={baseDelivery > 0 ? egp2(baseDelivery) : undefined} />
            ) : (
              <Row label="التوصيل" info value={egp2(baseDelivery)} />
            )
          ) : null}
          
          <Row label="رسوم الخدمة" info value={egp2(SERVICE_FEE)} />
          {tip > 0 ? <Row label="إكرامية المندوب" value={egp2(tip)} /> : null}
          <Row label="المبلغ الإجمالي" value={egp2(total)} bold />
        </View>
      </ScrollView>

      {/* ───────── البار السفلي ───────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        {savings > 0 ? (
          <View style={styles.savingsBand}>
            <View style={styles.savingsMark}><Icon name="workspace_premium" size={22} color={BRAND} /></View>
            <Txt s={15} w={800} color={TEXT}>لقد وفّرت <Txt s={15} w={800} color={BRAND}>{egp2(savings)}</Txt></Txt>
          </View>
        ) : (
          <View style={styles.totalRow}>
            <Txt s={19} w={800} color={TEXT}>{egp(total)}</Txt>
            <Txt s={16} w={800} color={TEXT}>المجموع الكلي</Txt>
          </View>
        )}
        <PressableScale onPress={() => void pay()} style={[styles.cta, paying && { opacity: 0.85 }]}>
          {paying ? <ActivityIndicator color="#FFFFFF" style={{ marginEnd: 8 }} /> : null}
          <Txt s={16} w={700} color="#FFFFFF">{payBtnLabel}</Txt>
        </PressableScale>
      </View>

      <Modal visible={scheduleSheet} transparent animationType="slide" onRequestClose={() => setScheduleSheet(false)}>
        <View style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}><View style={styles.sheetHandle} />
          <Txt s={17} w={700} style={{ color: TEXT, textAlign: "right" }}>تغيير موعد التوصيل</Txt>
          <View style={{ alignItems: "center", gap: 6, paddingVertical: 10 }}>
            <Txt s={13} w={600} style={{ color: scheduleOffsetMinutes < 0 ? RED : TEXT }}>{scheduleOffsetMinutes < 0 ? 'موعد أبكر' : scheduleOffsetMinutes > 0 ? 'موعد لاحق' : 'موعد التوصيل'}</Txt>
            <Txt s={22} w={600} style={{ color: scheduleOffsetMinutes < 0 ? RED : BRAND }}>{clock(scheduledFrom)} - {clock(scheduledTo)}</Txt>
            <Txt s={12} color={MUTED}>اسحب عجلة الوقت لتقديم الموعد أو تأخيره بالدقيقة</Txt>
          </View>
          <View style={styles.timeWheelFrame}>
            <ScrollView ref={scheduleWheelRef} style={{ height: 126 }} contentContainerStyle={{ alignItems: 'center', paddingVertical: 42 }} showsVerticalScrollIndicator={false} snapToInterval={42} decelerationRate="fast"
              onContentSizeChange={() => { if (scheduleSheet) scheduleWheelRef.current?.scrollTo({ y: (scheduleOffsetMinutes + 28) * 42, animated: false }); }}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.y / 42);
                const minutes = Math.max(-30, Math.min(600, index - 30));
                setScheduleOffsetMinutes(minutes);
              }}>
              {Array.from({ length: 631 }, (_, index) => index - 30).map((minutes) => (
                <View key={minutes} style={{ height: 42, justifyContent: 'center' }}>
                  <Txt s={minutes === scheduleOffsetMinutes ? 20 : 15} w={minutes === scheduleOffsetMinutes ? 600 : 400} style={{ color: minutes < 0 ? RED : minutes === scheduleOffsetMinutes ? BRAND : MUTED }}>
                    {minutes === 0 ? 'الوقت الطبيعي' : minutes < 0 ? `قبل الموعد بـ ${Math.abs(minutes)} دقيقة` : `بعد ${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} ساعة ` : ''}${minutes % 60 ? `${minutes % 60} دقيقة` : ''}`}
                  </Txt>
                </View>
              ))}
            </ScrollView>
            <View pointerEvents="none" style={styles.timeWheelSelection} />
          </View>
          <PressableScale onPress={() => set({ speed: rushDelivery ? 0 : 1 })} style={[styles.scheduleChoice, { borderColor: rushDelivery ? RED : BORDER, backgroundColor: '#FFFFFF' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="check_circle" size={22} color={rushDelivery ? RED : MUTED} />
                <Txt s={14} w={700} style={{ color: rushDelivery ? RED : TEXT }}>توصيل مستعجل</Txt>
              </View>
              <Txt s={14} w={800} color={RED}>+20 ج.م</Txt>
            </View>
            <Txt s={11} color={MUTED}>تقليل وقت انتقال المندوب إلى النصف، دون تغيير وقت تجهيز المطعم</Txt>
          </PressableScale>
          <PressableScale onPress={() => setScheduleSheet(false)} style={[styles.cta, { marginTop: 4 }]}>
            <Txt s={15} w={700} color="#FFFFFF">تأكيد</Txt>
          </PressableScale>
        </View>
      </Modal>
      {/* ───────── Bottom sheet ───────── */}
      <Modal visible={paymentSheet} transparent animationType="slide" onRequestClose={chooseCash}>
        <View style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Txt s={16} w={700} style={{ color: TEXT, textAlign: 'right' }}>اختار طريقة الدفع</Txt>

          <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {s.cards.map((card) => (
              <MethodRow
                key={card.id}
                selected={sheetSelection === 'card:' + card.id}
                onSelect={() => { setSheetSelection('card:' + card.id); setSheetError(false); }}
                title={card.name || 'بطاقة محفوظة'}
                sub={`•••• •••• •••• ${last4(card.num)}`}
                logo={cardLogo(card.brand, card.num, card.id, 52, 30)}
              />
            ))}

            {savedWallets.length ? (
              <View style={styles.divLabelRow}>
                <View style={styles.divLine} />
                <Txt s={13} w={700} style={{ color: BRAND }}>محافظ إلكترونية</Txt>
                <View style={styles.divLine} />
              </View>
            ) : null}

            {savedWallets.map((w) => (
              <MethodRow
                key={w.id}
                selected={sheetSelection === 'wallet:' + w.id}
                onSelect={() => { setSheetSelection('wallet:' + w.id); setSheetError(false); }}
                title={w.name}
                sub={w.phone}
                logo={walletLogo(w.name, w.phone, 52, 34)}
              />
            ))}

            {/* إضافة طريقة دفع: ارتفاع 70، + في النص وتحتها النص */}
            <PressableScale style={styles.addMethod} onPress={() => { setPaymentSheet(false); router.push('/payments'); }}>
              <Icon name="add" size={24} color={TEXT} />
              <Txt s={13} w={600} style={{ color: TEXT }}>إضافة طريقة دفع جديدة</Txt>
            </PressableScale>
          </ScrollView>

          {/* متابعة على اليمين، رجوع على الشمال */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <PressableScale onPress={chooseCash} style={[styles.sheetBtn, { backgroundColor: '#FFFFFF', borderColor: '#E6E8E6' }]}>
              <Txt s={15} w={700} style={{ color: TEXT }}>رجوع</Txt>
            </PressableScale>
            <PressableScale
              onPress={confirmPaymentSelection}
              style={[styles.sheetBtn, { backgroundColor: sheetError ? RED : BRAND, borderColor: sheetError ? RED : BRAND }]}
            >
              <Txt s={15} w={700} color="#FFFFFF">{sheetError ? 'اختار طريقة دفع' : 'متابعة'}</Txt>
            </PressableScale>
          </View>
        </View>
      </Modal>

      <Modal visible={noteSheetOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={closeNoteSheet}>
        <View style={styles.noteModalRoot}>
          <PressableScale onPress={closeNoteSheet} style={StyleSheet.absoluteFill} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.noteModalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.noteModalHeader}>
              <View style={{ flex: 1 }} />
              <PressableScale onPress={closeNoteSheet} style={styles.noteClose} accessibilityRole="button" accessibilityLabel="إغلاق الملاحظة"><X size={24} color={TEXT} /></PressableScale>
            </View>
            <View style={styles.noteModalEditor}>
              <TextInput value={noteDraft} onChangeText={updateNoteDraft} placeholder="هل تود أن تخبرنا أي شيء آخر؟" placeholderTextColor="#A7A7A7" multiline autoFocus returnKeyType="done" blurOnSubmit onSubmitEditing={saveNoteDraft} style={[styles.noteModalInput, INPUT_FONT]} />
              {noteImages.length ? <View style={styles.noteImages}>{noteImages.map((uri) => <View key={uri} style={styles.noteImageWrap}><Image source={{ uri }} style={styles.noteImage} contentFit="cover" /><PressableScale onPress={() => setNoteImages((items) => items.filter((item) => item !== uri))} style={styles.removeNoteImage}><X size={11} color="#111111" /></PressableScale></View>)}</View> : null}
              <View style={styles.noteTools}>
                <PressableScale onPress={toggleNoteSpeech} style={[styles.noteTool, speechActive && { backgroundColor: '#FDECEC', borderColor: RED }]} accessibilityRole="button" accessibilityLabel={speechActive ? 'إيقاف الإملاء الصوتي' : 'بدء الإملاء الصوتي'}><Mic size={19} color={speechActive ? RED : BRAND} /></PressableScale>
                <PressableScale onPress={() => void pickNoteImage(true)} style={styles.noteTool}><Camera size={19} color={BRAND} /></PressableScale>
                <PressableScale onPress={() => void pickNoteImage(false)} style={styles.noteTool}><ImagePlus size={19} color={BRAND} /></PressableScale>
                <View style={{ flex: 1 }} />
                {speechProcessing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><ActivityIndicator size="small" color={BRAND} /><Txt s={12} color={MUTED}>جارٍ تحويل الصوت إلى نص</Txt></View> : null}
                <PressableScale onPress={saveNoteDraft} style={styles.noteSave}><Icon name="check" size={22} color="#FFFFFF" /></PressableScale>
              </View>
            </View>
            {speechActive ? <Txt s={12} w={600} style={{ color: RED, textAlign: 'center' }}>جارٍ الاستماع… اضغط الميكروفون لإيقاف الإملاء</Txt> : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ───────── 3DS ───────── */}
      <Modal visible={!!threeDSUrl} transparent animationType="slide" onRequestClose={finishThreeDS}>
        <View style={styles.threeDSRoot}>
          <View style={styles.threeDSSheet}>
            <View style={styles.threeDSHeader}>
              <PressableScale onPress={finishThreeDS} style={styles.threeDSClose} accessibilityRole="button" accessibilityLabel="إغلاق التحقق">
                <Icon name="close" size={20} color={TEXT} />
              </PressableScale>
              <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                <Txt s={15} w={700}>التحقق من البنك</Txt>
                <Txt s={11} color={MUTED}>أدخل رمز التأكيد داخل التطبيق</Txt>
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
                  <Txt s={13} w={700} color={BRAND}>إعادة المحاولة</Txt>
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
    <View style={[styles.dot, on && { borderColor: BRAND }]}>
      {on ? <View style={styles.dotInner} /> : null}
    </View>
  );
}

function InfoDot() {
  return (
    <View style={styles.infoDot}>
      <Txt s={10} w={700} style={{ color: MUTED }}>i</Txt>
    </View>
  );
}

function Row({
  label, value, tag, strike, valueColor, info, gem, bold,
}: { label: string; value: string; tag?: string; strike?: string; valueColor?: string; info?: boolean; gem?: boolean; bold?: boolean }) {
  const fs = bold ? 16 : 14;
  const fw = bold ? 800 : 500;
  return (
    <View style={styles.sumRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {strike ? <Txt s={fs} w={fw} style={{ color: MUTED, textDecorationLine: 'line-through' }}>{strike}</Txt> : null}
        {!strike ? <Txt s={fs} w={fw} style={{ color: valueColor ?? TEXT }}>{value}</Txt> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {info ? <InfoDot /> : null}
        {tag ? <View style={styles.tag}><Txt s={12} w={700} style={{ color: BRAND }}>{tag}</Txt></View> : null}
        <Txt s={fs} w={fw} style={{ color: TEXT }}>{label}</Txt>
        {gem ? <View style={styles.gem} /> : null}
      </View>
    </View>
  );
}

/** صف وسيلة دفع في الـ Sheet (ارتفاع 58): [صح] | الاسم + الرقم | اللوجو */
function MethodRow({
  selected, onSelect, title, sub, logo,
}: { selected: boolean; onSelect: () => void; title: string; sub: string; logo: React.ReactNode }) {
  return (
    <PressableScale style={[styles.method, selected && { borderColor: BRAND, backgroundColor: BRAND_SOFT }]} onPress={onSelect}>
      <View style={[styles.check, selected && styles.checkOn]}>
        <Icon name="check" size={16} color={selected ? GREEN : '#C4C8C6'} />
      </View>
      <View style={styles.vDiv} />
      <View style={styles.methodText}>
        <Txt s={13} w={700} style={{ color: TEXT }} numberOfLines={1}>{title}</Txt>
        <Txt s={12} w={500} style={{ color: MUTED }} numberOfLines={1}>{sub}</Txt>
      </View>
      <View style={styles.vDiv} />
      <View style={styles.logoBox}>{logo}</View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  orderMap: { height: 220, overflow: 'hidden', borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#F4F5F3' },
  checkoutCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', gap: 14, padding: 14 },
  mapUnavailable: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  addressDetails: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 14 },
  addressActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 12 },
  addressWarning: { backgroundColor: '#FFF2D8', borderRadius: 14, padding: 12 },
  instructionGrid: { flexDirection: 'row', gap: 8 },
  instructionTile: { flex: 1, minHeight: 94, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF' },
  instructionTileOn: { borderColor: BRAND, backgroundColor: BRAND_SOFT },
  saveInstruction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 9, paddingTop: 4 },
  instructionCheck: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#BFC3C0', alignItems: 'center', justifyContent: 'center' },
  instructionCheckOn: { backgroundColor: BRAND, borderColor: BRAND },
  paymentCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 14, backgroundColor: '#FFFFFF' },
  paymentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  paymentDivider: { height: 1, backgroundColor: BORDER },
  pciStrip: { marginHorizontal: -14, paddingHorizontal: 14, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F4F5F6', gap: 8 },
  mapPinCard: { width: 64, alignItems: 'center', padding: 4, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#315B45', elevation: 5 },
  mapPinImage: { width: 42, height: 42, borderRadius: 10, backgroundColor: '#EAF0E8' },
  mapPinLabel: { color: '#173D2A', marginTop: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: BG },
  back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  backSpacer: { width: 40, height: 40 },

  band: { height: 14, backgroundColor: BAND },
  section: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  title: { textAlign: 'right', alignSelf: 'stretch', color: TEXT },
  titleInline: { textAlign: 'right', color: TEXT },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },

  addrRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'right', backgroundColor: '#FFFFFF' },

  payOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF' },
  payOptOn: { borderColor: BRAND, backgroundColor: BRAND_SOFT },
  payOptLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: '#CFD2D6', alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  minChip: { backgroundColor: BAND, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  newBadge: { backgroundColor: '#EAF4F6', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  applePayMark: { borderWidth: 1, borderColor: TEXT, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  pickedBox: { borderRadius: 12, backgroundColor: BAND, padding: 12, gap: 3, alignItems: 'flex-end' },

  balRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  chips: { flexDirection: 'row', gap: 8, marginTop: 2 },
  chip: { height: 40, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  chipOn: { borderColor: BRAND, backgroundColor: BRAND_SOFT },

  promoBox: { flexDirection: 'row', alignItems: 'center', height: 50, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, gap: 10 },
  promoInput: { flex: 1, textAlign: 'right', paddingVertical: 0 },

  noteSummary: { minHeight: 58, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF' },
  noteModalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  noteModalSheet: { minHeight: '42%', maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 14 },
  noteModalHeader: { height: 48, flexDirection: 'row', alignItems: 'center' },
  noteClose: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  noteModalEditor: { minHeight: 190, borderWidth: 1.5, borderColor: TEXT, borderRadius: 22, padding: 14, gap: 10 },
  noteModalInput: { minHeight: 110, textAlign: 'right', textAlignVertical: 'top', padding: 0, color: TEXT },
  noteSave: { width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  timeWheelFrame: { height: 126, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF' },
  timeWheelSelection: { position: 'absolute', top: 42, left: 8, right: 8, height: 42, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DCE4DE' },
  scheduleChoice: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  scheduleChoiceOn: { borderColor: BRAND, backgroundColor: BRAND_SOFT },
  noteInput: { alignSelf: 'stretch', textAlign: 'right', paddingVertical: 0, minHeight: 20, color: TEXT },
  noteTools: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', paddingTop: 8 },
  noteTool: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  noteImages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch', paddingTop: 8 },
  noteImageWrap: { width: 68, height: 68, borderRadius: 10, overflow: 'visible' },
  noteImage: { width: 68, height: 68, borderRadius: 10, borderWidth: 1, borderColor: BORDER },
  removeNoteImage: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D0D0D0', alignItems: 'center', justifyContent: 'center' },

  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { backgroundColor: LIME, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 },
  tawseelaPin: { width: 78, height: 92, alignItems: 'center', justifyContent: 'flex-start' },
  tawseelaPinPhotoFrame: { width: 76, height: 68, padding: 5, borderRadius: 22, borderWidth: 4, borderColor: '#D8F000', backgroundColor: '#003D27', overflow: 'hidden', zIndex: 2, elevation: 8 },
  tawseelaPinPhoto: { width: '100%', height: '100%', borderRadius: 13 },
  tawseelaPinTail: { width: 0, height: 0, marginTop: -2, borderLeftWidth: 18, borderRightWidth: 18, borderTopWidth: 27, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#003D27', zIndex: 1 },
  infoDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.2, borderColor: MUTED, alignItems: 'center', justifyContent: 'center' },
  gem: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#E8742A', transform: [{ rotate: '45deg' }] },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 12, gap: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
  savingsBand: { minHeight: 52, marginHorizontal: -16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, backgroundColor: '#F5F0E7', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  savingsMark: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E7EEDB', alignItems: 'center', justifyContent: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pointsDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  cta: { height: 50, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },

  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 10, gap: 12 },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#C9C9C9', marginBottom: 2 },
  method: { height: 58, borderRadius: 14, borderWidth: 1, borderColor: '#E1E3E6', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF' },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: '#C4C8C6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkOn: { backgroundColor: '#E3F4DC', borderColor: '#E3F4DC' },
  vDiv: { width: 1, height: 32, backgroundColor: '#D8DDD9' },
  methodText: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 },
  logoBox: { width: 56, alignItems: 'center', justifyContent: 'center' },
  addMethod: { height: 70, borderRadius: 14, borderWidth: 1, borderColor: '#E1E3E6', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FFFFFF' },
  divLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 2 },
  divLine: { flex: 1, height: 1, backgroundColor: '#D5D8DC' },
  sheetBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

  threeDSRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  threeDSSheet: { height: '94%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', paddingTop: 12, backgroundColor: BG },
  threeDSHeader: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BAND, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  threeDSClose: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  threeDSEmpty: { width: 38, height: 38 },
  threeDSWebView: { flex: 1, backgroundColor: '#FFFFFF' },
  threeDSLoading: { position: 'absolute', top: '48%', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  threeDSError: { position: 'absolute', bottom: 20, left: 16, right: 16, padding: 14, borderRadius: 16, gap: 10, backgroundColor: BAND },
});
