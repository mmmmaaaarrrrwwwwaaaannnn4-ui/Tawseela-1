import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo, WalletProviderLogo } from './brand-logos';
import { Eyebrow } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/overlays';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { cardBrandOf } from '@/data/seed';
import type { NewCard } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

import { CARD_INK, CardChip, CardSurface, TAWSELA_CARD_GRADIENT } from './card-face';
import { Field } from './field';

export const blankCard = (name = ''): NewCard => ({ num: '', name: name.toUpperCase(), exp: '', cvv: '', nick: '', def: true });
const FLIP = Easing.bezier(0.34, 1.2, 0.64, 1);

const SECURITY = [
  'تلتزم توصيلة بمعيار أمان بيانات بطاقات الدفع (PCI DSS) عند معالجة بيانات بطاقات المستخدمين.',
  'معلومات البطاقة آمنة، ولن تتم مشاركتها مع أي طرف.',
  'جميع البيانات مشفّرة.',
  'لا تبيع توصيلة معلومات بطاقتك بتاتًا.',
  'في حال حدوث عملية تفويض مسبق، سيتم إعادة المبلغ على الفور.',
];

/** Full-screen card-entry page based on the supplied reference screenshot and Flip Card HTML. */
export function CardSheet({
  visible, value, onChange, showErrors, flipped, onFlip, onSave, onClose,
}: {
  visible: boolean;
  value: NewCard;
  onChange: (p: Partial<NewCard>) => void;
  showErrors: boolean;
  flipped: boolean;
  onFlip: (v: boolean) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { c } = useTheme();
  const n = value;
  const d = n.num.replace(/\D/g, '');
  const b = cardBrandOf(d);
  const shown = (d + '•'.repeat(Math.max(0, 16 - d.length))).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
  const okExp = /^(0[1-9]|1[0-2])\/\d{2}$/.test(n.exp);
  const okCvv = /^\d{3,4}$/.test(n.cvv);
  const r = useSharedValue(flipped ? 180 : 0);
  useEffect(() => { r.set(withTiming(flipped ? 180 : 0, { duration: 700, easing: FLIP })); }, [flipped, r]);
  const front = useAnimatedStyle(() => ({ opacity: r.value < 90 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${r.value}deg` }] }));
  const back = useAnimatedStyle(() => ({ opacity: r.value >= 90 ? 1 : 0, transform: [{ perspective: 1100 }, { rotateY: `${r.value - 180}deg` }] }));
  const toggleFlip = () => onFlip(!flipped);
  const providers = [
    { key: 'insta', label: 'InstaPay', bg: '#F4ECFB' },
    { key: 'orange', label: 'Orange Money', bg: '#FFF4E8' },
    { key: 'we', label: 'WE Pay', bg: '#F2ECFA' },
    { key: 'etisalat', label: 'Etisalat', bg: '#FFF0F1' },
    { key: 'cash', label: 'توصيلة', bg: '#FFF0F0' },
  ];

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
          <Txt s={22} w={700} color="#111111">إضافة بطاقة جديدة</Txt>
        </View>
      }
      footer={
        <PressableScale onPress={onSave} style={styles.confirmButton} scaleTo={0.985}>
          <Txt s={19} w={700} color="#777777">تأكيد</Txt>
        </PressableScale>
      }
    >
      <View style={styles.content}>
        <PressableScale onPress={toggleFlip} scaleTo={0.995} style={styles.cardWrap}>
          <View style={{ height: 210 }}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, front]}>
              <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="front">
                <View style={styles.chipRow}>
                  <CardChip />
                  <Icon name="contactless" size={34} color={CARD_INK} />
                </View>
                <View style={styles.cardBottom}>
                  <Txt s={18} w={700} ls={0.12} tabular color="#FFFFFF">{shown}</Txt>
                  <View style={styles.cardMeta}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Txt s={10} w={500} color="rgba(255,255,255,0.78)">اسم حامل البطاقة</Txt>
                      <Txt s={13} w={700} color="#FFFFFF" numberOfLines={1}>{n.name.trim() || 'اسم حامل البطاقة'}</Txt>
                    </View>
                    <View style={{ gap: 3, minWidth: 66 }}>
                      <Txt s={10} w={500} color="rgba(255,255,255,0.78)">MM/YY</Txt>
                      <Txt s={13} w={700} color="#FFFFFF">{n.exp || '••/••'}</Txt>
                    </View>
                    <PaymentNetworkLogo brand={d ? b.name : 'MASTERCARD'} width={50} height={30} />
                  </View>
                </View>
              </CardSurface>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.cardShadow, back]}>
              <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="back" style={{ padding: 0 }}>
                <View style={styles.magneticStripe} />
                <View style={styles.signatureRow}>
                  <View style={styles.signatureArea}>
                    <Txt s={9} w={600} color="#FFFFFF">توقيع حامل البطاقة</Txt>
                    <View style={styles.signaturePaper}><Txt s={12} w={500} color="#193D31">{n.name || 'AUTHORIZED SIGNATURE'}</Txt></View>
                  </View>
                  <View style={styles.cvvArea}>
                    <Txt s={9} w={700} color="#FFFFFF">CVV</Txt>
                    <View style={styles.cvvPaper}><Txt s={15} w={700} color="#1A1A1A">{n.cvv ? '•'.repeat(n.cvv.length) : '•••'}</Txt></View>
                  </View>
                </View>
                <Txt s={9} w={500} color="rgba(255,255,255,0.72)" style={styles.backHint}>اضغط على البطاقة للعودة إلى الوجه الأمامي</Txt>
              </CardSurface>
            </Animated.View>
          </View>
        </PressableScale>

        <View style={styles.networkHeader}>
          <PaymentNetworkLogo brand="MADA" width={42} height={35} />
          <PaymentNetworkLogo brand="VISA" width={43} height={31} />
          <PaymentNetworkLogo brand="AMEX" width={40} height={32} />
          <PaymentNetworkLogo brand="MASTERCARD" width={42} height={30} />
          <PaymentNetworkLogo brand="VISA" width={42} height={30} />
        </View>
        <View style={styles.divider} />

        <View style={styles.formGroup}>
          <View style={[styles.numberField, showErrors && d.length < 15 ? styles.invalidField : null]}>
            <Icon name="photo_camera" size={24} color="#858585" />
            <View style={{ flex: 1 }}>
              <Field
                value={n.num}
                bg="#F4F4F8"
                height={54}
                radius={15}
                borderWidth={0}
                textAlign="right"
                writingDirection="rtl"
                onChangeText={(v) => onChange({ num: v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ') })}
                placeholder="يُرجى إدخال رقم البطاقة المصرفية"
                keyboardType="number-pad"
                autoComplete="cc-number"
                error={false}
              />
            </View>
            <Icon name="credit_card" size={24} color="#A5A5A5" />
          </View>
          {showErrors && d.length < 15 ? <Txt s={12} color="#F04432" align="right">رقم البطاقة لا يمكن أن يكون فارغًا أو غير مكتمل</Txt> : null}
        </View>

        <View style={styles.rowFields}>
          <View style={styles.smallField}>
            <Field
              value={n.cvv}
              bg="#F4F4F8"
              height={54}
              radius={15}
              borderWidth={0}
              textAlign="right"
              writingDirection="rtl"
              onChangeText={(v) => onChange({ cvv: v.replace(/\D/g, '').slice(0, 4) })}
              onFocus={() => onFlip(true)}
              onBlur={() => onFlip(false)}
              placeholder="CVV/CVC"
              keyboardType="number-pad"
              secureTextEntry
              error={showErrors && !okCvv}
            />
          </View>
          <View style={styles.smallField}>
            <Field
              value={n.exp}
              bg="#F4F4F8"
              height={54}
              radius={15}
              borderWidth={0}
              textAlign="right"
              writingDirection="rtl"
              onChangeText={(v) => { let x = v.replace(/\D/g, '').slice(0, 4); if (x.length > 2) x = x.slice(0, 2) + '/' + x.slice(2); onChange({ exp: x }); }}
              placeholder="الشهر / السنة"
              keyboardType="number-pad"
              error={showErrors && !okExp}
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Field
            value={n.name}
            bg="#F4F4F8"
            height={54}
            radius={15}
            borderWidth={0}
            textAlign="right"
            writingDirection="rtl"
            onChangeText={(v) => onChange({ name: v.toUpperCase() })}
            placeholder="يُرجى إدخال الاسم الموجود على البطاقة"
            autoComplete="name"
            autoCapitalize="characters"
            error={showErrors && !n.name.trim()}
          />
        </View>

        <PressableScale onPress={() => onChange({ def: !n.def })} style={styles.defaultRow}>
          <View style={[styles.switch, n.def && styles.switchOn]}><View style={[styles.switchKnob, n.def && styles.switchKnobOn]} /></View>
          <Txt s={16} w={700} color="#171717">تعيين كطريقة الدفع الأساسية</Txt>
        </PressableScale>

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
            {['SafeKey', 'ID Check', 'VISA SECURE', 'PCI DSS'].map((x) => (
              <View key={x} style={styles.securityBadge}><Txt s={9} w={700} color={x === 'VISA SECURE' ? '#173C9B' : '#7B7B7B'}>{x}</Txt></View>
            ))}
          </View>
        </View>

        <View style={styles.otherMethodsTitle}>
          <View style={styles.dividerFlex} />
          <Txt s={19} w={800} color="#111111">طرق دفع أخرى</Txt>
          <View style={styles.dividerFlex} />
        </View>
        <View style={styles.providerRow}>
          {providers.map((p, i) => (
            <PressableScale key={p.key} onPress={() => {}} style={[styles.providerTile, { backgroundColor: p.bg }]}>
              {i === 4 ? <WalletProviderLogo provider="توصيلة" width={54} height={55} /> : null}
            </PressableScale>
          ))}
          <Image
            pointerEvents="none"
            source={require('../../assets/payments/payment-provider-logos.png')}
            resizeMode="stretch"
            style={styles.providerSprite}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: 13, paddingBottom: 8 },
  header: { minHeight: 46, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: 10, paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  cardWrap: { marginHorizontal: 22, marginTop: 4, marginBottom: 2 },
  cardShadow: { borderRadius: 20, shadowColor: '#00170F', shadowOpacity: 0.28, shadowRadius: 17, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 36 },
  cardBottom: { gap: 14, marginTop: 'auto', paddingBottom: 2 },
  cardMeta: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  networkHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  divider: { height: 1, backgroundColor: '#E8E8E8', marginHorizontal: 4 },
  formGroup: { gap: 7 },
  numberField: { minHeight: 58, borderRadius: 15, backgroundColor: '#F4F4F8', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderWidth: 1.5, borderColor: '#F4F4F8' },
  invalidField: { borderColor: '#F04432', backgroundColor: '#FFFDFD' },
  rowFields: { flexDirection: 'row', gap: 9 },
  smallField: { flex: 1, minWidth: 0 },
  defaultRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  switch: { width: 48, height: 28, borderRadius: 20, backgroundColor: '#D9D9D9', padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: '#FFD91A' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
  switchKnobOn: { alignSelf: 'flex-end' },
  security: { gap: 8, paddingTop: 2 },
  securityTitle: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  securityLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  securityBadges: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, paddingTop: 3 },
  securityBadge: { minWidth: 53, height: 29, paddingHorizontal: 5, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 5, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  otherMethodsTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 5 },
  dividerFlex: { height: 1, flex: 1, backgroundColor: '#BFC3CA' },
  providerRow: { position: 'relative', flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  providerSprite: { position: 'absolute', left: 0, top: 0, width: '80%', height: 76 },
  providerTile: { flex: 1, minWidth: 0, height: 76, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { height: 62, borderRadius: 22, backgroundColor: '#FFF176', alignItems: 'center', justifyContent: 'center' },
  magneticStripe: { position: 'absolute', left: 0, right: 0, top: 28, height: 42, backgroundColor: '#151515' },
  signatureRow: { position: 'absolute', left: 20, right: 20, top: 92, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  signatureArea: { flex: 1, gap: 5 },
  signaturePaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', justifyContent: 'center', paddingHorizontal: 10 },
  cvvArea: { width: 60, gap: 5 },
  cvvPaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', alignItems: 'center', justifyContent: 'center' },
  backHint: { position: 'absolute', left: 20, bottom: 16 },
});
