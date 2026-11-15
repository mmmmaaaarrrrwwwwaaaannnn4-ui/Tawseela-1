import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo } from './brand-logos';
import { Sheet } from '@/components/ui/overlays';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { cardBrandOf } from '@/data/seed';
import type { NewCard } from '@/store/app-store';

import { CARD_INK, CardChip, CardSurface, TAWSELA_CARD_GRADIENT } from './card-face';
import { Field } from './field';

export const blankCard = (name = ''): NewCard => ({ num: '', name: name.toUpperCase(), exp: '', cvv: '', nick: '', def: true });

type WalletProvider = 'insta' | 'orange' | 'we' | 'etisalat' | 'vodafone';

const FLIP = Easing.bezier(0.34, 1.2, 0.64, 1);
const OUT = Easing.bezier(0.22, 1, 0.36, 1);
const OLIVE = '#0D2818';

const SECURITY = [
  'تلتزم توصيلة بمعيار أمان بيانات بطاقات الدفع (PCI DSS) عند معالجة بيانات بطاقات المستخدمين.',
  'معلومات البطاقة آمنة، ولن تتم مشاركتها مع أي طرف.',
  'جميع البيانات مشفّرة.',
  'لا تبيع توصيلة معلومات بطاقتك بتاتًا.',
  'في حال حدوث عملية تفويض مسبق، سيتم إعادة المبلغ على الفور.',
];

const PROVIDERS: {
  key: WalletProvider;
  label: string;
  short: string;
  gradient: readonly [string, string];
  tile: string;
  logo: number;
}[] = [
  { key: 'insta', label: 'InstaPay', short: 'إنستاباي', gradient: ['#4C167A', '#A92B8B'], tile: '#F4ECFB', logo: require('../../assets/payments/instapay.png') },
  { key: 'orange', label: 'Orange Cash', short: 'أورنج كاش', gradient: ['#F58220', '#FFB33B'], tile: '#FFF4E8', logo: require('../../assets/payments/orange-cash.png') },
  { key: 'we', label: 'WE Pay', short: 'WE Pay', gradient: ['#4C247D', '#8A45B5'], tile: '#F2ECFA', logo: require('../../assets/payments/we-pay.png') },
  { key: 'etisalat', label: 'Etisalat Cash', short: 'اتصالات كاش', gradient: ['#007C52', '#16B982'], tile: '#EAF7F0', logo: require('../../assets/payments/etisalat-cash.png') },
  { key: 'vodafone', label: 'Vodafone Cash', short: 'فودافون كاش', gradient: ['#C90018', '#F2293B'], tile: '#FFF0F1', logo: require('../../assets/payments/vodafone-cash.png') },
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

/** Existing add-payment-method sheet, rebuilt around the supplied reference layout. */
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
  const { width } = useWindowDimensions();
  const [providerKey, setProviderKey] = useState<WalletProvider | null>(null);
  const [walletPhone, setWalletPhone] = useState('');
  const [walletName, setWalletName] = useState('');
  const [saveWallet, setSaveWallet] = useState(false);
  const [walletErrors, setWalletErrors] = useState(false);
  const d = n.num.replace(/\D/g, '');
  const b = cardBrandOf(d);
  const knownBrand = d.length >= 4 && b.name !== 'CARD';
  const cardDigits = useMemo(() => formatCardNumber(d, b.name), [d, b.name]);
  const cardPreview = cardDigits || '••••  ••••  ••••  ••••';
  const validNumber = cardLengthValid(d, b.name) && luhnValid(d);
  const validExp = expiryValid(n.exp);
  const validCvv = b.name === 'AMEX' ? /^\d{4}$/.test(n.cvv) : /^\d{3}$/.test(n.cvv);
  const wallet = PROVIDERS.find((x) => x.key === providerKey) ?? null;
  const cardHeight = Math.round((width - 40) / 1.52);
  const r = useSharedValue(flipped ? 180 : 0);
  const mode = useSharedValue(providerKey ? 1 : 0);

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
      setWalletPhone('');
      setWalletName('');
      setSaveWallet(false);
      setWalletErrors(false);
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
  const formTransition = useAnimatedStyle(() => ({
    opacity: 1,
    transform: [{ translateY: mode.value * 3 }],
  }));

  const confirm = () => {
    if (wallet) {
      if (!isEgyptPhone(walletPhone) || !walletName.trim()) {
        setWalletErrors(true);
        return;
      }
      onSaveWallet?.(wallet.label, normalizeEgyptPhone(walletPhone), walletName.trim(), saveWallet);
      return;
    }
    onSave();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      fullScreen
      scroll
      header={
        <View style={styles.header}>
          <PressableScale onPress={onClose} style={styles.backButton}>
            <Icon name="chevron_right" size={25} color="#171717" />
          </PressableScale>
          <Txt s={22} w={700} color="#111111">{wallet ? 'إضافة ' + wallet.label : 'إضافة بطاقة جديدة'}</Txt>
        </View>
      }
      footer={
        <PressableScale onPress={confirm} disabled={saving} style={styles.confirmButton} scaleTo={0.985}>
          {saving ? <ActivityIndicator color="#777777" /> : <Txt s={19} w={700} color="#777777">تأكيد</Txt>}
        </PressableScale>
      }
    >
      <View style={styles.content}>
        <View style={[styles.cardWrap, { height: cardHeight }]}>
          <Animated.View pointerEvents={wallet ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.cardShadow, bankPreview]}>
            <PressableScale onPress={() => onFlip(!flipped)} scaleTo={0.995} style={{ flex: 1 }}>
              <Animated.View style={[StyleSheet.absoluteFill, front]}>
                <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="front" style={{ height: cardHeight, padding: 22 }}>
                  <View style={styles.chipRow}>
                    <CardChip />
                    <Icon name="contactless" size={34} color={CARD_INK} />
                  </View>
                  <View style={styles.cardBottom}>
                    <Txt s={18} w={700} ls={0.12} tabular color="#FFFFFF">{cardPreview}</Txt>
                    <View style={styles.cardMeta}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Txt s={10} w={500} color="rgba(255,255,255,0.78)">اسم حامل البطاقة</Txt>
                        <Txt s={13} w={700} color="#FFFFFF" numberOfLines={1}>{n.name.trim() || 'اسم حامل البطاقة'}</Txt>
                      </View>
                      <View style={{ gap: 3, minWidth: 66 }}>
                        <Txt s={10} w={500} color="rgba(255,255,255,0.78)">MM/YY</Txt>
                        <Txt s={13} w={700} color="#FFFFFF">{n.exp || '••/••'}</Txt>
                      </View>
                      {knownBrand ? <PaymentNetworkLogo brand={b.name} width={50} height={30} /> : null}
                    </View>
                  </View>
                </CardSurface>
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, back]}>
                <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="back" style={{ height: cardHeight, padding: 0 }}>
                  <View style={styles.magneticStripe} />
                  <View style={styles.signatureRow}>
                    <View style={styles.signatureArea}>
                      <Txt s={9} w={600} color="#FFFFFF">AUTHORIZED SIGNATURE</Txt>
                      <View style={styles.signaturePaper}>
                        <Txt s={12} w={500} color="#193D31">{n.name.trim() || 'Tawseela Cardholder'}</Txt>
                      </View>
                    </View>
                    <View style={styles.cvvArea}>
                      <Txt s={9} w={700} color="#FFFFFF">CVV</Txt>
                      <View style={styles.cvvPaper}>
                        <Txt s={15} w={700} color="#1A1A1A">{n.cvv || '•••'}</Txt>
                      </View>
                    </View>
                  </View>
                  <Txt s={9} w={500} color="rgba(255,255,255,0.72)" style={styles.backHint}>اضغط على البطاقة للعودة إلى الوجه الأمامي</Txt>
                </CardSurface>
              </Animated.View>
            </PressableScale>
          </Animated.View>

          {wallet ? (
            <Animated.View style={[StyleSheet.absoluteFill, styles.walletShadow, walletPreview]}>
              <View style={[styles.walletCard, { height: cardHeight }]}>
                <LinearGradient colors={wallet.gradient} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={StyleSheet.absoluteFill} />
                <View style={styles.walletCardTop}>
                  <View style={styles.walletBrandPill}>
                    <Image source={wallet.logo} resizeMode="contain" style={styles.walletLogo} />
                  </View>
                  <View style={styles.walletBrandText}>
                    <Txt s={11} w={700} color="rgba(255,255,255,0.82)">TAWSEELA WALLET</Txt>
                    <Txt s={19} w={800} color="#FFFFFF">{wallet.label}</Txt>
                  </View>
                </View>
                <View style={styles.walletCardBottom}>
                  <Txt s={17} w={700} ls={0.08} tabular color="#FFFFFF">{walletPhone ? formatEgyptPhone(walletPhone) : '010  ••••  ••••'}</Txt>
                  <Txt s={10} w={500} color="rgba(255,255,255,0.76)">اسم صاحب المحفظة</Txt>
                  <Txt s={14} w={700} color="#FFFFFF" numberOfLines={1}>{walletName.trim() || 'اسم صاحب المحفظة'}</Txt>
                </View>
                <View style={styles.walletGlow} />
              </View>
            </Animated.View>
          ) : null}
        </View>

        {!wallet ? (
          <Animated.View style={bankPreview}>
            <View style={styles.networkHeader}>
              <Image source={require('../../assets/payments/meeza.png')} resizeMode="contain" style={styles.meezaLogo} />
              <PaymentNetworkLogo brand="VISA" width={43} height={31} />
              <PaymentNetworkLogo brand="AMEX" width={40} height={32} />
              <PaymentNetworkLogo brand="MASTERCARD" width={42} height={30} />
            </View>
          </Animated.View>
        ) : (
          <PressableScale onPress={() => setProviderKey(null)} style={styles.backToCard}>
            <Icon name="credit_card" size={17} color={OLIVE} />
            <Txt s={13} w={700} color={OLIVE}>العودة للدفع بالبطاقة البنكية</Txt>
          </PressableScale>
        )}

        <View style={styles.divider} />

        {!wallet ? (
          <Animated.View style={formTransition}>
            <View style={styles.formGroup}>
              <View style={styles.numberFieldWrap}>
                <Field
                  value={n.num}
                bg="#FFFFFF"
                height={54}
                radius={15}
                borderWidth={1.5}
                focusColor={OLIVE}
                textAlign="right"
                onChangeText={(v) => onChange({ num: formatCardNumber(v, b.name) })}
                placeholder="رقم البطاقة"
                keyboardType="number-pad"
                autoComplete="cc-number"
                  error={showErrors && !validNumber}
                />
                <View pointerEvents="none" style={styles.numberMiniBrands}>
                  <PaymentNetworkLogo brand="AMEX" width={27} height={20} />
                  <PaymentNetworkLogo brand="MASTERCARD" width={27} height={19} />
                  <PaymentNetworkLogo brand="VISA" width={27} height={19} />
                </View>
              </View>
              {showErrors && !validNumber ? <Txt s={12} color="#F04432" align="right">رقم البطاقة غير صحيح. راجع الرقم وحاول مرة أخرى.</Txt> : null}
            </View>

            <View style={styles.rowFields}>
              <View style={styles.smallField}>
                <Field
                  value={n.cvv}
                  bg="#FFFFFF"
                  height={54}
                  radius={15}
                  borderWidth={1.5}
                  focusColor={OLIVE}
                  textAlign="right"
                  onChangeText={(v) => onChange({ cvv: v.replace(/\D/g, '').slice(0, b.name === 'AMEX' ? 4 : 3) })}
                  onFocus={() => onFlip(true)}
                  onBlur={() => onFlip(false)}
                  placeholder="CVV"
                  icon="credit_card"
                  keyboardType="number-pad"
                  secureTextEntry
                  error={showErrors && !validCvv}
                />
                {showErrors && !validCvv ? <Txt s={11} color="#F04432">رمز الأمان غير صحيح</Txt> : null}
              </View>
              <View style={styles.smallField}>
                <Field
                  value={n.exp}
                  bg="#FFFFFF"
                  height={54}
                  radius={15}
                  borderWidth={1.5}
                  focusColor={OLIVE}
                  textAlign="right"
                  onChangeText={(v) => { let x = v.replace(/\D/g, '').slice(0, 4); if (x.length > 2) x = x.slice(0, 2) + '/' + x.slice(2); onChange({ exp: x }); }}
                  placeholder="الشهر / السنة MM/YY"
                  keyboardType="number-pad"
                  error={showErrors && !validExp}
                />
                {showErrors && !validExp ? <Txt s={11} color="#F04432">تاريخ الانتهاء غير صالح أو منتهي</Txt> : null}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Field
                value={n.name}
                bg="#FFFFFF"
                height={54}
                radius={15}
                borderWidth={1.5}
                focusColor={OLIVE}
                textAlign="right"
                onChangeText={(v) => onChange({ name: v.toUpperCase() })}
                placeholder="يُرجى إدخال الاسم الموجود على البطاقة"
                autoComplete="name"
                autoCapitalize="characters"
                error={showErrors && !n.name.trim()}
              />
              {showErrors && !n.name.trim() ? <Txt s={12} color="#F04432" align="right">اكتب اسم حامل البطاقة كما هو مطبوع عليها.</Txt> : null}
            </View>

            <PressableScale onPress={() => onChange({ def: !n.def })} style={styles.defaultRow}>
              <View style={[styles.switch, n.def && styles.switchOn]}><View style={[styles.switchKnob, n.def && styles.switchKnobOn]} /></View>
              <Txt s={16} w={700} color="#171717">تعيين كطريقة الدفع الأساسية</Txt>
            </PressableScale>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.walletForm, formTransition]}>
            <Txt s={17} w={800} color="#111111" align="right">بيانات {wallet.label}</Txt>
            <View style={styles.formGroup}>
              <Field
                value={formatEgyptPhone(walletPhone)}
                bg="#FFFFFF"
                height={54}
                radius={15}
                borderWidth={1.5}
                focusColor={OLIVE}
                textAlign="right"
                onChangeText={(v) => setWalletPhone(normalizeEgyptPhone(v))}
                placeholder="رقم الهاتف المرتبط بالمحفظة"
                keyboardType="phone-pad"
                error={walletErrors && !isEgyptPhone(walletPhone)}
              />
              {walletErrors && !isEgyptPhone(walletPhone) ? <Txt s={12} color="#F04432" align="right">أدخل رقم محفظة مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015.</Txt> : null}
            </View>
            <View style={styles.formGroup}>
              <Field
                value={walletName}
                bg="#FFFFFF"
                height={54}
                radius={15}
                borderWidth={1.5}
                focusColor={OLIVE}
                textAlign="right"
                onChangeText={setWalletName}
                placeholder="اسم صاحب المحفظة"
                autoComplete="name"
                error={walletErrors && !walletName.trim()}
              />
              {walletErrors && !walletName.trim() ? <Txt s={12} color="#F04432" align="right">اكتب اسم صاحب المحفظة.</Txt> : null}
            </View>
            <PressableScale onPress={() => setSaveWallet((x) => !x)} style={styles.defaultRow}>
              <View style={[styles.switch, saveWallet && styles.switchOn]}><View style={[styles.switchKnob, saveWallet && styles.switchKnobOn]} /></View>
              <Txt s={14} w={700} color="#171717">حفظ هذه المحفظة لاستخدامها لاحقًا</Txt>
            </PressableScale>
            <View style={styles.walletNotice}>
              <Icon name="info" size={17} color="#8A6A18" />
              <Txt s={11.5} color="#7A6A42" style={{ flex: 1 }}>حفظ المحافظ كوسائل دفع دائمة غير مدعوم حاليًا من إعداد Kashier في المشروع. لن يتم حفظ رقم الهاتف أو إنشاء نجاح وهمي.</Txt>
            </View>
          </Animated.View>
        )}

        <View style={styles.security}>
          <View style={styles.securityTitle}>
            <Icon name="shield_lock" size={22} fill color="#00A878" />
            <Txt s={15} w={700} color="#00A878">تحمي توصيلة معلومات بطاقتك</Txt>
          </View>
          {SECURITY.map((line) => (
            <View key={line} style={styles.securityLine}>
              <Icon name="check" size={15} color="#00A878" />
              <Txt s={12.5} w={500} lh={1.45} color="#8A8A8A" style={{ flex: 1 }}>{line}</Txt>
            </View>
          ))}
          <View style={styles.securityBadges}>
            <View style={styles.securityBadge}><Image source={require('../../assets/payments/amex-safekey.jpg')} resizeMode="contain" style={styles.securityBadgeImage} /></View>
            <View style={styles.securityBadge}><Image source={require('../../assets/payments/mastercard-identity-check.png')} resizeMode="contain" style={styles.securityBadgeImage} /></View>
            <View style={styles.securityBadge}><Image source={require('../../assets/payments/visa-secure.jpg')} resizeMode="contain" style={styles.securityBadgeImage} /></View>
            <View style={styles.securityBadge}><Txt s={9} w={700} color="#7B7B7B">PCI DSS</Txt></View>
          </View>
        </View>

        <View style={styles.otherMethodsTitle}>
          <View style={styles.dividerFlex} />
          <Txt s={19} w={800} color="#111111">طرق دفع أخرى</Txt>
          <View style={styles.dividerFlex} />
        </View>
        <View style={styles.providerRow}>
          {PROVIDERS.map((item) => (
            <PressableScale key={item.key} onPress={() => { setWalletErrors(false); setProviderKey(item.key); }} style={[styles.providerTile, { backgroundColor: item.tile, borderColor: providerKey === item.key ? OLIVE : 'transparent', borderWidth: providerKey === item.key ? 1.5 : 0 }]}>
              <Image source={item.logo} resizeMode="contain" style={styles.providerImage} />
            </PressableScale>
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13, paddingBottom: 8 },
  header: { minHeight: 46, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { marginHorizontal: -4, marginTop: 4, marginBottom: 2 },
  cardShadow: { borderRadius: 20, shadowColor: '#00170F', shadowOpacity: 0.28, shadowRadius: 17, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  walletShadow: { borderRadius: 20, shadowColor: '#00170F', shadowOpacity: 0.24, shadowRadius: 17, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: '12%' },
  cardBottom: { gap: 14, marginTop: 'auto', paddingBottom: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  networkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 4 },
  divider: { height: 1, backgroundColor: '#E8E8E8', marginHorizontal: 4 },
  formGroup: { gap: 6 },
  numberFieldWrap: { position: 'relative' },
  numberMiniBrands: { position: 'absolute', left: 12, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 3 },
  rowFields: { flexDirection: 'row', gap: 9 },
  smallField: { flex: 1, minWidth: 0, gap: 4 },
  defaultRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  switch: { width: 48, height: 28, borderRadius: 20, backgroundColor: '#D9D9D9', padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: '#FFD91A' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  switchKnobOn: { alignSelf: 'flex-end' },
  security: { gap: 8, paddingTop: 2 },
  securityTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  securityLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  securityBadges: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, paddingTop: 3 },
  securityBadge: { minWidth: 53, height: 32, paddingHorizontal: 5, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 5, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  securityBadgeImage: { width: 66, height: 25 },
  meezaLogo: { width: 42, height: 35 },
  otherMethodsTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  dividerFlex: { height: 1, flex: 1, backgroundColor: '#BFC3CA' },
  providerRow: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  providerImage: { width: '88%', height: '82%' },
  providerTile: { flex: 1, minWidth: 0, height: 76, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { height: 62, borderRadius: 22, backgroundColor: '#FFF176', alignItems: 'center', justifyContent: 'center' },
  magneticStripe: { position: 'absolute', left: 0, right: 0, top: '18%', height: '18%', backgroundColor: '#101010' },
  signatureRow: { position: 'absolute', left: 20, right: 20, top: '48%', flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  signatureArea: { flex: 1, gap: 5 },
  signaturePaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', justifyContent: 'center', paddingHorizontal: 10 },
  cvvArea: { width: 60, gap: 5 },
  cvvPaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', alignItems: 'center', justifyContent: 'center' },
  backHint: { position: 'absolute', left: 20, bottom: 16 },
  walletCard: { width: '100%', borderRadius: 20, padding: 22, overflow: 'hidden', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)' },
  walletCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  walletBrandPill: { width: 108, height: 54, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center', padding: 7 },
  walletLogo: { width: '100%', height: '100%' },
  walletBrandText: { alignItems: 'flex-end', gap: 3 },
  walletCardBottom: { gap: 5, alignItems: 'flex-start' },
  walletGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, right: -70, bottom: -120, backgroundColor: 'rgba(255,255,255,0.12)' },
  backToCard: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, backgroundColor: '#EAF0E8' },
  walletForm: { gap: 12 },
  walletNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, borderRadius: 12, backgroundColor: '#FFF8E6' },
});
