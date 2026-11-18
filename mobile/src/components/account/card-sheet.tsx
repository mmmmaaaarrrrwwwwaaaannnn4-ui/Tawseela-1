import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';

import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { cardBrandOf } from '@/data/seed';
import type { NewCard } from '@/store/app-store';

import { CARD_INK, CardChip, CardSurface, TAWSELA_CARD_GRADIENT } from './card-face';

/** Card network logos drawn inside this file (nothing is imported from the app folders). */
const VISA_PATH = 'M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094 -.368 -.175 -.503 -.461 -.658C1.447 8.864 .677 8.627 0 8.479l.046 -.217h3.3a.904 .904 0 0 1 .894 .764l.817 4.338 2.018 -5.102zm8.033 5.049c.008 -1.979 -2.736 -2.088 -2.717 -2.972 .006 -.269 .262 -.555 .822 -.628a3.66 3.66 0 0 1 1.913 .336l.34 -1.59a5.207 5.207 0 0 0 -1.814 -.333c-1.917 0 -3.266 1.02 -3.278 2.479 -.012 1.079 .963 1.68 1.698 2.04 .756 .367 1.01 .603 1.006 .931 -.005 .504 -.602 .725 -1.16 .734 -.975 .015 -1.54 -.263 -1.992 -.473l-.351 1.642c.453 .208 1.289 .39 2.156 .398 2.037 0 3.37 -1.006 3.377 -2.564m5.061 2.447H24l-1.565 -7.496h-1.656a.883 .883 0 0 0 -.826 .55l-2.909 6.946h2.036l.405 -1.12h2.488zm-2.163 -2.656l1.02 -2.815 .588 2.815zm-8.16 -4.84l-1.603 7.496H8.34l1.605 -7.496z';
/** Paste the Meeza logo here as a base64 data URI (data:image/png;base64,...). Until then the word is shown as text. */
const MEEZA_LOGO_URI = '';

// لوجو "توصيلة باي" متخزن جوه الملف نفسه (base64) — نفس اللي في صفحة المدفوعات.
const LOGO = { uri: 'data:image/png;base64,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' };

function PaymentNetworkLogo({
  brand, width, height, tone = 'color',
}: {
  brand: string;
  width: number;
  height: number;
  /** 'light' is the white Visa used on the dark card; 'color' is the normal blue Visa for white backgrounds. */
  tone?: 'color' | 'light';
}) {
  if (brand === 'VISA') {
    return (
      <Svg width={width} height={height} viewBox="0 8.2 24 7.6" preserveAspectRatio="xMaxYMid meet">
        <Path d={VISA_PATH} fill={tone === 'light' ? '#FFFFFF' : '#1A1F71'} fillOpacity={tone === 'light' ? 0.9 : 1} />
      </Svg>
    );
  }
  if (brand === 'MASTERCARD') {
    return (
      <Svg width={width} height={height} viewBox="0 0 131.39 86.9" preserveAspectRatio="xMaxYMid meet">
        <Circle cx={43.45} cy={43.45} r={43.45} fill="#EB001B" />
        <Circle cx={87.94} cy={43.45} r={43.45} fill="#F79E1B" />
        <Path d="M65.695 6.13A43.45 43.45 0 0 1 65.695 80.77A43.45 43.45 0 0 1 65.695 6.13Z" fill="#FF5F00" />
      </Svg>
    );
  }
  if (brand === 'AMEX') {
    return (
      <Svg width={width} height={height} viewBox="0 0 100 62" preserveAspectRatio="xMaxYMid meet">
        <Rect x={0} y={0} width={100} height={62} rx={6} fill="#016FD0" />
        <SvgText x={50} y={40} fontSize={26} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">AMEX</SvgText>
      </Svg>
    );
  }
  if (brand === 'MEEZA') {
    if (MEEZA_LOGO_URI) return <Image source={{ uri: MEEZA_LOGO_URI }} resizeMode="contain" style={{ width, height }} />;
    return (
      <View style={{ width, height, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Txt s={Math.max(10, Math.round(height * 0.7))} w={800} color={tone === 'light' ? '#FFFFFF' : '#111111'}>ميزة</Txt>
      </View>
    );
  }
  return null;
}

export const blankCard = (_name = ''): NewCard => ({ num: '', name: '', exp: '', cvv: '', nick: '', def: true });

type WalletProvider = 'insta' | 'orange' | 'we' | 'etisalat' | 'vodafone';

const FLIP = Easing.bezier(0.34, 1.2, 0.64, 1);
const OUT = Easing.bezier(0.22, 1, 0.36, 1);
/** نفس لون الهيدر الأخضر في صفحة المدفوعات. */
const GREEN = '#153222';
const OLIVE = GREEN;
const ERROR = '#C0342F';
/** قياسات الخانات مأخوذة من صور المرجع: ارتفاع 58، ركن 8، حد 1.3 رمادي فاتح، مسافة 16. */
const FIELD_BORDER = '#EBEBEB';
const PAGE_PAD = 18;
/** Currency label printed on the back of the card. */
const CARD_CURRENCY = 'EGP';

const ROUTES = { support: '/support', more: '/menu' } as const;
const HEADSET_PATH = 'M5 14v-2a7 7 0 0 1 14 0v2M5 14h2v5H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1zM19 14h-2v5h2a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1zM19 19v.5a2.5 2.5 0 0 1-2.5 2.5H13';

const PROVIDERS: {
  key: WalletProvider;
  label: string;
  gradient: readonly [string, string];
  logo: number;
}[] = [
  { key: 'insta', label: 'InstaPay', gradient: ['#4C167A', '#A92B8B'], logo: require('../../assets/payments/instapay.png') },
  { key: 'orange', label: 'Orange Cash', gradient: ['#F58220', '#FFB33B'], logo: require('../../assets/payments/orange-cash.png') },
  { key: 'we', label: 'WE Pay', gradient: ['#4C247D', '#8A45B5'], logo: require('../../assets/payments/we-pay.png') },
  { key: 'etisalat', label: 'Etisalat Cash', gradient: ['#007C52', '#16B982'], logo: require('../../assets/payments/etisalat-cash.png') },
  { key: 'vodafone', label: 'Vodafone Cash', gradient: ['#C90018', '#F2293B'], logo: require('../../assets/payments/vodafone-cash.png') },
];

function luhnValid(value: string) {
  let sum = 0;
  let double = false;
  for (let i = value.length - 1; i >= 0; i -= 1) {
    let digit = Number(value[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return value.length > 0 && sum % 10 === 0;
}

function cardLengthValid(digits: string, brand: string) {
  if (brand === 'AMEX') return digits.length === 15;
  if (brand === 'MASTERCARD' || brand === 'MEEZA') return digits.length === 16;
  if (brand === 'VISA') return [13, 16, 19].includes(digits.length);
  return false;
}

function expiryValid(value: string) {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(value)) return false;
  const month = Number(value.slice(0, 2));
  const year = 2000 + Number(value.slice(3, 5));
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

function formatCardNumber(value: string, brand: string) {
  const digits = value.replace(/\D/g, '').slice(0, brand === 'AMEX' ? 15 : 19);
  if (brand === 'AMEX') return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function normalizeEgyptPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length === 12) digits = '0' + digits.slice(2);
  return digits.slice(0, 11);
}

function formatEgyptPhone(value: string) {
  const digits = normalizeEgyptPhone(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return digits.slice(0, 3) + ' ' + digits.slice(3);
  return digits.slice(0, 3) + ' ' + digits.slice(3, 7) + ' ' + digits.slice(7);
}

function isEgyptPhone(value: string) {
  return /^01[0125]\d{8}$/.test(normalizeEgyptPhone(value));
}

/* ───────────────────────── small icons ───────────────────────── */

function WarnIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24">
      <Path d="M12 3.2L22 20.5H2L12 3.2Z" fill={ERROR} stroke={ERROR} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M12 9.5v5" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={12} cy={17.3} r={1.2} fill="#FFFFFF" />
    </Svg>
  );
}

function HeadsetIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d={HEADSET_PATH} stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function MoreDots() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Circle cx={5} cy={12} r={2.3} fill={GREEN} />
      <Circle cx={12} cy={12} r={2.3} fill={GREEN} />
      <Circle cx={19} cy={12} r={2.3} fill={GREEN} />
    </Svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
      <Path d="M6 9l6 6 6-6" stroke="#666666" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ───────────────────────── floating-label field ───────────────────────── */

/**
 * نفس خانة المرجع: العنوان في النص وهي فاضية، ولما تتفتح أو تتكتب بيطلع فوق ويصغر بأنيميشن خفيف.
 * لو error = true: الإطار والعنوان أحمر + علامة تحذير شمال + رسالة تحت الخانة.
 */
function FloatingField({
  value, onChangeText, label, error = false, errorText, left, placeholder,
  onFocus, onBlur, keyboardType, secureTextEntry, autoComplete, autoCapitalize,
}: {
  value: string;
  onChangeText: (v: string) => void;
  label: string;
  error?: boolean;
  errorText?: string;
  left?: ReactNode;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad';
  secureTextEntry?: boolean;
  autoComplete?: 'cc-number' | 'name' | 'off';
  autoCapitalize?: 'none' | 'characters';
}) {
  const [focused, setFocused] = useState(false);
  const floated = focused || value.length > 0;
  const p = useSharedValue(floated ? 1 : 0);

  useEffect(() => {
    p.set(withTiming(floated ? 1 : 0, { duration: 160, easing: Easing.out(Easing.quad) }));
  }, [floated, p]);

  const labelAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: -11.5 * p.value }, { scale: 1 - 0.27 * p.value }],
  }));

  return (
    <View style={styles.formGroup}>
      <View style={[styles.fieldBox, { borderColor: error ? ERROR : focused ? GREEN : FIELD_BORDER }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
          placeholder={focused ? placeholder : undefined}
          placeholderTextColor="#B5B5B5"
          selectionColor={GREEN}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoComplete={autoComplete}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          textAlign="right"
          style={styles.fieldInput}
        />
        <Animated.View pointerEvents="none" style={[styles.fieldLabel, labelAnim]}>
          <Txt s={15} color={error ? ERROR : '#777777'} align="right">{label}</Txt>
        </Animated.View>
        <View pointerEvents="none" style={styles.fieldLeft}>{error ? <WarnIcon /> : left}</View>
      </View>
      {error && errorText ? <Txt s={12} color={ERROR} align="right">{errorText}</Txt> : null}
    </View>
  );
}

/**
 * صفحة إضافة بطاقة (صفحة كاملة، مش bottom sheet). نفس الـ props القديمة فمفيش تغيير مطلوب في payments.tsx.
 */
export function CardSheet({
  visible, value, onChange, showErrors, flipped, onFlip, onSave, onSaveWallet, saving = false, onClose,
}: {
  visible: boolean;
  value: NewCard;
  onChange: (p: Partial<NewCard>) => void;
  showErrors: boolean;
  flipped: boolean;
  onFlip: (v: boolean) => void;
  onSave: () => void;
  onSaveWallet?: (provider: string, phone: string, name: string, save: boolean) => void;
  saving?: boolean;
  onClose: () => void;
}) {
  const n = value;
  const insets = useSafeAreaInsets();
  const [providerKey, setProviderKey] = useState<WalletProvider | null>(null);
  const [showMethods, setShowMethods] = useState(false);
  const [walletPhone, setWalletPhone] = useState('');
  const [walletName, setWalletName] = useState('');
  const [walletErrors, setWalletErrors] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [bodyW, setBodyW] = useState(0);
  const d = n.num.replace(/\D/g, '');
  const b = cardBrandOf(d);
  const knownBrand = d.length >= 4 && b.name !== 'CARD';
  const cardDigits = useMemo(() => formatCardNumber(d, b.name), [d, b.name]);
  const cardPreview = cardDigits || '••••  ••••  ••••  ••••';
  const cardLast4 = d.length >= 4 ? '•• ' + d.slice(-4) : '•• ••••';
  /* Card sizes follow the reference cards: 1 unit is 1% of the card width. */
  const u = (bodyW || 373) / 100;
  const fs = (k: number) => Math.round(u * k * 10) / 10;
  const validNumber = cardLengthValid(d, b.name) && luhnValid(d);
  const validExp = expiryValid(n.exp);
  const validCvv = b.name === 'AMEX' ? /^\d{4}$/.test(n.cvv) : /^\d{3}$/.test(n.cvv);
  const validName = n.name.trim().length > 0;
  const wallet = PROVIDERS.find((x) => x.key === providerKey) ?? null;
  // عرض وارتفاع المعاينة صريحين (بنفس عرض الخانات) عشان تتوسّط وتبقى بنسبة الكارت الحقيقي.
  const cardSize = bodyW ? { width: bodyW, height: bodyW / 1.587 } : { alignSelf: 'stretch' as const, aspectRatio: 1.587 };
  const r = useSharedValue(flipped ? 180 : 0);
  const mode = useSharedValue(providerKey ? 1 : 0);

  /** الخطأ بيظهر لو الخانة غلط وحصل إنها اتلمست وسابها العميل (حتى لو فاضية) أو ضغط "إضافة". */
  const touch = (k: string) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const showErr = (k: string, invalid: boolean, force = showErrors) => invalid && (force || !!touched[k]);

  useEffect(() => {
    r.set(withTiming(flipped ? 180 : 0, { duration: 680, easing: FLIP }));
  }, [flipped, r]);

  useEffect(() => {
    mode.set(withTiming(providerKey ? 1 : 0, { duration: 360, easing: OUT }));
    if (providerKey) onFlip(false);
  }, [providerKey, mode, onFlip]);

  useEffect(() => {
    if (!visible) {
      setProviderKey(null);
      setShowMethods(false);
      setWalletPhone('');
      setWalletName('');
      setWalletErrors(false);
      setTouched({});
      onFlip(false);
    }
  }, [visible, onFlip]);

  const front = useAnimatedStyle(() => ({
    backfaceVisibility: 'hidden',
    opacity: r.value < 90 ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateY: r.value + 'deg' }],
  }));
  const back = useAnimatedStyle(() => ({
    backfaceVisibility: 'hidden',
    opacity: r.value >= 90 ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateY: (r.value - 180) + 'deg' }],
  }));
  const bankPreview = useAnimatedStyle(() => ({
    opacity: 1 - mode.value,
    transform: [{ scale: 1 - mode.value * 0.035 }, { translateY: mode.value * -8 }],
  }));
  const walletPreview = useAnimatedStyle(() => ({
    opacity: mode.value,
    transform: [{ scale: 0.965 + mode.value * 0.035 }, { translateY: (1 - mode.value) * 8 }],
  }));

  const confirm = () => {
    if (wallet) {
      if (!isEgyptPhone(walletPhone) || !walletName.trim()) {
        setWalletErrors(true);
        return;
      }
      onSaveWallet?.(wallet.label, normalizeEgyptPhone(walletPhone), walletName.trim(), true);
      return;
    }
    onSave();
  };

  const go = (path: string) => {
    onClose();
    router.push(path as never);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* الهيدر الأخضر الثابت (ستاتس بار + لوجو) — نفس صفحة المدفوعات من غير الرصيد */}
        <View style={[styles.greenHeader, { paddingTop: insets.top + 6 }]}>
          <View style={styles.headTop}>
            <View style={styles.headBtns}>
              <PressableScale scaleTo={0.92} onPress={onClose} style={styles.circle}>
                <Icon name="chevron_right" size={20} color={GREEN} />
              </PressableScale>
              <PressableScale scaleTo={0.92} onPress={() => go(ROUTES.support)} style={styles.circle}>
                <HeadsetIcon />
              </PressableScale>
              <PressableScale scaleTo={0.92} onPress={() => go(ROUTES.more)} style={styles.circle}>
                <MoreDots />
              </PressableScale>
            </View>
            <Image source={LOGO} resizeMode="contain" style={{ width: 121, height: 29 }} />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.body} onLayout={(e) => setBodyW(e.nativeEvent.layout.width)}>
            {wallet ? (
              <Animated.View style={[styles.cardWrap, cardSize, walletPreview]}>
                <LinearGradient colors={[...wallet.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.walletCard, { height: '100%' }]}>
                  <View pointerEvents="none" style={styles.walletGlow} />
                  <View style={styles.walletCardTop}>
                    <View style={styles.walletBrandPill}>
                      <Image source={wallet.logo} resizeMode="contain" style={styles.walletLogo} />
                    </View>
                    <View style={styles.walletBrandText}>
                      <Txt s={11} w={700} color="rgba(255,255,255,0.78)">محفظة إلكترونية</Txt>
                      <Txt s={19} w={800} color="#FFFFFF">{wallet.label}</Txt>
                    </View>
                  </View>
                  <View style={styles.walletCardBottom}>
                    <Txt s={10} w={600} color="rgba(255,255,255,0.78)">رقم المحفظة</Txt>
                    <Txt s={22} w={800} color="#FFFFFF" tabular>{formatEgyptPhone(walletPhone) || '01X XXXX XXXX'}</Txt>
                    <Txt s={10} w={600} color="rgba(255,255,255,0.78)">اسم صاحب المحفظة</Txt>
                    <Txt s={16} w={700} color="#FFFFFF" numberOfLines={1}>{walletName.trim() || 'الاسم كما هو مسجل بالمحفظة'}</Txt>
                  </View>
                </LinearGradient>
              </Animated.View>
            ) : (
              <Animated.View style={[styles.cardWrap, cardSize, bankPreview]}>
                <Animated.View style={[StyleSheet.absoluteFill, front]}>
                  <CardSurface bg={TAWSELA_CARD_GRADIENT} style={styles.previewCard} logo="front">
                    <View pointerEvents="none" style={styles.chipCenter}>
                      <CardChip />
                    </View>
                    <Txt s={fs(4.4)} w={500} lh={1.2} color={CARD_INK} tabular style={styles.last4Text}>{cardLast4}</Txt>
                    {knownBrand ? (
                      <View style={styles.networkLogo}>
                        <PaymentNetworkLogo brand={b.name} tone="light" width={Math.round(u * 17.9)} height={Math.round(u * 5.8)} />
                      </View>
                    ) : null}
                  </CardSurface>
                </Animated.View>
                <Animated.View style={[StyleSheet.absoluteFill, back]}>
                  <CardSurface bg={TAWSELA_CARD_GRADIENT} style={styles.previewCard} logo="back">
                    <Txt s={fs(3.8)} w={500} lh={1.2} color={CARD_INK} style={styles.currencyText}>{CARD_CURRENCY}</Txt>
                    <Txt s={fs(4.4)} w={500} lh={1.2} color={CARD_INK} tabular style={styles.numberText}>{cardPreview}</Txt>
                    <Txt s={fs(3.4)} w={500} lh={1.2} color={CARD_INK} numberOfLines={1} style={styles.nameText}>{n.name || 'اسم حامل البطاقة'}</Txt>
                    <Txt s={fs(3.3)} lh={1.2} color={CARD_INK} align="center" style={styles.cvvLabel}>CVV</Txt>
                    <Txt s={fs(3.4)} w={500} lh={1.2} color={CARD_INK} align="center" style={styles.cvvValue}>{n.cvv ? '•'.repeat(n.cvv.length) : '•••'}</Txt>
                    <Txt s={fs(3.3)} lh={1.2} color={CARD_INK} align="center" style={styles.expLabel}>صالحة حتى</Txt>
                    <Txt s={fs(3.4)} w={500} lh={1.2} color={CARD_INK} align="center" style={styles.expValue}>{n.exp || '••/••'}</Txt>
                  </CardSurface>
                </Animated.View>
              </Animated.View>
            )}

            {!wallet ? (
              <View style={styles.fields}>
                <FloatingField
                  value={n.num}
                  label="رقم البطاقة"
                  onChangeText={(v) => onChange({ num: formatCardNumber(v, b.name) })}
                  onBlur={() => touch('num')}
                  keyboardType="number-pad"
                  autoComplete="cc-number"
                  error={showErr('num', !validNumber)}
                  errorText="رقم بطاقة غير صحيح"
                  left={knownBrand ? <PaymentNetworkLogo brand={b.name} width={40} height={26} /> : undefined}
                />

                <View style={styles.rowFields}>
                  <View style={styles.smallField}>
                    <FloatingField
                      value={n.cvv}
                      label="CVV"
                      onChangeText={(v) => onChange({ cvv: v.replace(/\D/g, '').slice(0, b.name === 'AMEX' ? 4 : 3) })}
                      onFocus={() => onFlip(true)}
                      onBlur={() => { touch('cvv'); onFlip(false); }}
                      keyboardType="number-pad"
                      secureTextEntry
                      error={showErr('cvv', !validCvv)}
                      errorText="رمز الأمان غير صحيح"
                      left={<Icon name="credit_card" size={26} color="#B8B8B8" />}
                    />
                  </View>
                  <View style={styles.smallField}>
                    <FloatingField
                      value={n.exp}
                      label="تاريخ الانتهاء"
                      placeholder="MM/YY"
                      onChangeText={(v) => { let x = v.replace(/\D/g, '').slice(0, 4); if (x.length > 2) x = x.slice(0, 2) + '/' + x.slice(2); onChange({ exp: x }); }}
                      onFocus={() => onFlip(true)}
                      onBlur={() => { touch('exp'); onFlip(false); }}
                      keyboardType="number-pad"
                      error={showErr('exp', !validExp)}
                      errorText="تاريخ انتهاء غير صالح"
                    />
                  </View>
                </View>

                <FloatingField
                  value={n.name}
                  label="اسم صاحب البطاقة"
                  onChangeText={(v) => onChange({ name: v.toUpperCase() })}
                  onFocus={() => onFlip(true)}
                  onBlur={() => { touch('name'); onFlip(false); }}
                  autoComplete="name"
                  autoCapitalize="characters"
                  error={showErr('name', !validName)}
                  errorText="اكتب اسم حامل البطاقة كما هو مطبوع عليها"
                />
              </View>
            ) : (
              <View style={styles.fields}>
                <FloatingField
                  value={formatEgyptPhone(walletPhone)}
                  label="رقم الهاتف المرتبط بالمحفظة"
                  onChangeText={(v) => setWalletPhone(normalizeEgyptPhone(v))}
                  onBlur={() => touch('wphone')}
                  keyboardType="phone-pad"
                  error={showErr('wphone', !isEgyptPhone(walletPhone), walletErrors)}
                  errorText="أدخل رقم محفظة مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015"
                />
                <FloatingField
                  value={walletName}
                  label="اسم صاحب المحفظة"
                  onChangeText={setWalletName}
                  onBlur={() => touch('wname')}
                  autoComplete="name"
                  error={showErr('wname', !walletName.trim(), walletErrors)}
                  errorText="اكتب اسم صاحب المحفظة"
                />
              </View>
            )}

            {/* طرق دفع أخرى — مخفية لحد ما العميل يدوس على العنوان */}
            <View style={styles.methods}>
              <PressableScale scaleTo={0.97} onPress={() => setShowMethods((v) => !v)} style={styles.methodsToggle}>
                <Chevron open={showMethods} />
                <Txt s={14} w={700} color="#333333">طرق دفع أخرى</Txt>
              </PressableScale>
              {showMethods ? (
                <Animated.View entering={FadeIn.duration(180)} style={styles.providerRow}>
                  {PROVIDERS.map((item) => {
                    const on = providerKey === item.key;
                    return (
                      <PressableScale
                        key={item.key}
                        scaleTo={0.95}
                        onPress={() => {
                          setWalletErrors(false);
                          setTouched((t) => ({ ...t, wphone: false, wname: false }));
                          setProviderKey((cur) => (cur === item.key ? null : item.key));
                        }}
                        style={[styles.providerTile, { borderColor: on ? GREEN : '#E3E3E3' }]}
                      >
                        <Image source={item.logo} resizeMode="contain" style={styles.providerImage} />
                      </PressableScale>
                    );
                  })}
                </Animated.View>
              ) : null}
            </View>
          </View>
        </ScrollView>

        {/* زرار الإضافة صغير وتحت */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <PressableScale onPress={confirm} disabled={saving} style={styles.confirmButton} scaleTo={0.985}>
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Txt s={16} w={700} color="#FFFFFF">إضافة</Txt>}
          </PressableScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // direction: 'ltr' زي صفحة المدفوعات عشان الترتيب الفيزيائي يفضل ثابت.
  page: { flex: 1, backgroundColor: '#FFFFFF', direction: 'ltr' },

  greenHeader: { backgroundColor: GREEN, paddingBottom: 12, paddingHorizontal: 14 },
  headTop: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headBtns: { flexDirection: 'row', gap: 7.5 },
  circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  scrollContent: { paddingHorizontal: PAGE_PAD, paddingTop: 14, paddingBottom: 24 },
  body: { gap: 16 },

  fields: { gap: 16 },
  formGroup: { gap: 7 },
  fieldBox: { height: 58, borderWidth: 1.3, borderRadius: 8, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  // لو الخط مختلف عن باقي التطبيق ضيف fontFamily بتاع التطبيق هنا.
  fieldInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, paddingHorizontal: 16.5, paddingTop: 25, paddingBottom: 0, fontSize: 14.5, color: '#1A1A1A', textAlign: 'right' },
  fieldLabel: { position: 'absolute', right: 16.5, left: 70, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-end', transformOrigin: 'right center' },
  fieldLeft: { position: 'absolute', left: 17, top: 0, bottom: 0, justifyContent: 'center' },
  rowFields: { flexDirection: 'row', gap: 16 },
  smallField: { flex: 1, minWidth: 0 },

  cardWrap: { alignSelf: 'center', position: 'relative' },
  previewCard: { height: '100%', padding: 0 },
  chipCenter: { position: 'absolute', top: 0, bottom: 0, left: '5.3%', justifyContent: 'center' },
  last4Text: { position: 'absolute', left: '5.6%', top: '83.7%' },
  networkLogo: { position: 'absolute', right: '3.8%', bottom: '6.6%' },
  currencyText: { position: 'absolute', left: '5.3%', top: '8.4%' },
  numberText: { position: 'absolute', right: '5.3%', top: '53%' },
  nameText: { position: 'absolute', left: '5.3%', top: '85%', maxWidth: '48%' },
  cvvLabel: { position: 'absolute', left: '55.4%', width: '18%', top: '76.3%' },
  cvvValue: { position: 'absolute', left: '55.4%', width: '18%', top: '84.7%' },
  expLabel: { position: 'absolute', left: '77.85%', width: '20%', top: '76.3%' },
  expValue: { position: 'absolute', left: '77.85%', width: '20%', top: '84.7%' },

  methods: { gap: 8 },
  methodsToggle: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  providerRow: { flexDirection: 'row', gap: 8 },
  providerTile: { flex: 1, minWidth: 0, height: 46, borderRadius: 10, borderWidth: 1.5, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  providerImage: { width: '78%', height: '68%' },

  footer: { paddingHorizontal: PAGE_PAD, paddingTop: 8, backgroundColor: '#FFFFFF' },
  confirmButton: { height: 46, borderRadius: 12, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },

  walletCard: { width: '100%', borderRadius: 14, padding: 22, overflow: 'hidden', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)' },
  walletCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  walletBrandPill: { width: 108, height: 54, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', padding: 7 },
  walletLogo: { width: '100%', height: '100%' },
  walletBrandText: { alignItems: 'flex-end', gap: 3 },
  walletCardBottom: { gap: 5, alignItems: 'flex-start' },
  walletGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -70, bottom: -120, backgroundColor: 'rgba(255,255,255,0.12)' },
});
