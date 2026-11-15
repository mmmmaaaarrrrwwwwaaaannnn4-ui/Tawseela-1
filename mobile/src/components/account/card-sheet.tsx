import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo, WalletProviderLogo } from './brand-logos';
import { AccentButton } from '@/components/ui/buttons';
import { Eyebrow } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/overlays';
import { Txt } from '@/components/ui/txt';
import { cardBrandOf } from '@/data/seed';
import type { NewCard } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

import { CARD_INK, CardChip, CardSurface, TAWSELA_CARD_GRADIENT } from './card-face';
import { Field } from './field';
import { ToggleRow } from './rows';

export const blankCard = (name = ''): NewCard => ({ num: '', name: name.toUpperCase(), exp: '', cvv: '', nick: '', def: true });

const FLIP = Easing.bezier(0.34, 1.2, 0.64, 1);

/** “Add a card” sheet with a live card preview that flips to the CVV side (`nC` in the design). */
export function CardSheet({
  visible,
  value,
  onChange,
  showErrors,
  flipped,
  onFlip,
  onSave,
  onClose,
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
  const shown = (d + '•'.repeat(Math.max(0, 16 - d.length)))
    .slice(0, 16)
    .replace(/(.{4})/g, '$1 ')
    .trim();
  const okExp = /^(0[1-9]|1[0-2])\/\d{2}$/.test(n.exp);
  const okCvv = /^\d{3,4}$/.test(n.cvv);

  const r = useSharedValue(flipped ? 180 : 0);
  useEffect(() => {
    r.set(withTiming(flipped ? 180 : 0, { duration: 700, easing: FLIP }));
  }, [flipped, r]);
  const front = useAnimatedStyle(() => ({
    opacity: r.value < 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${r.value}deg` }],
  }));
  const back = useAnimatedStyle(() => ({
    opacity: r.value >= 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${r.value - 180}deg` }],
  }));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="إضافة بطاقة جديدة"
      subtitle="أدخل بيانات بطاقتك البنكية بأمان"
      footer={<AccentButton label="تأكيد وإضافة البطاقة" icon="lock" iconFill iconSize={19} onPress={onSave} />}
    >
      <View style={{ height: 196 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, front]}>
          <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="front">
            <View style={[styles.between, { justifyContent: 'flex-start', gap: 12, marginTop: 34 }]}>
              <CardChip />
              <Icon name="contactless" size={27} color={CARD_INK} />
            </View>
            <Txt s={18} w={600} ls={0.13} tabular color="#FFFFFF">
              {shown}
            </Txt>
            <View style={[styles.between, { alignItems: 'flex-end' }]}>
              <View style={{ gap: 3, flexShrink: 1 }}>
                <Txt s={9} w={500} color="rgba(253,250,235,0.76)">اسم حامل البطاقة</Txt>
                <Txt s={12} w={600} color={CARD_INK} numberOfLines={1}>
                  {n.name.trim() || 'الاسم كما هو على البطاقة'}
                </Txt>
              </View>
              <View style={{ gap: 3, alignItems: 'flex-start' }}>
                <Txt s={9} w={500} color="rgba(253,250,235,0.76)">MM/YY</Txt>
                <Txt s={12} w={600} color="#FFFFFF">
                  {n.exp || '••/••'}
                </Txt>
              </View>
              <PaymentNetworkLogo brand={d ? b.name : 'MASTERCARD'} width={42} height={24} />
            </View>
          </CardSurface>
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.shadow, back]}>
          <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="back" style={{ padding: 0 }}>
            <View style={styles.strip} />
            <View style={styles.cvv}>
              <Txt s={16} w={700} ls={0.2} color="#1C1C1C">
                {n.cvv ? '•'.repeat(n.cvv.length) : '•••'}
              </Txt>
            </View>
            <Txt s={11} w={500} color="rgba(253,250,235,0.72)" style={styles.hint}>
              The 3–4 digits on the back of your card
            </Txt>
          </CardSurface>
        </Animated.View>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>رقم البطاقة</Eyebrow>
        <Field
          icon="credit_card"
          value={n.num}
          onChangeText={(v) =>
            onChange({
              num: v
                .replace(/\D/g, '')
                .slice(0, 16)
                .replace(/(.{4})(?=.)/g, '$1 '),
            })
          }
          placeholder="0000 0000 0000 0000"
          keyboardType="number-pad"
          autoComplete="cc-number"
          error={showErrors && d.length < 15}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Eyebrow>اسم حامل البطاقة</Eyebrow>
        <Field
          icon="person"
          value={n.name}
          onChangeText={(v) => onChange({ name: v.toUpperCase() })}
          placeholder="الاسم كما هو مكتوب على البطاقة"
          autoComplete="name"
          autoCapitalize="characters"
          error={showErrors && !n.name.trim()}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Eyebrow>الشهر / السنة</Eyebrow>
          <Field
            icon="calendar_month"
            value={n.exp}
            onChangeText={(v) => {
              let x = v.replace(/\D/g, '').slice(0, 4);
              if (x.length > 2) x = x.slice(0, 2) + '/' + x.slice(2);
              onChange({ exp: x });
            }}
            placeholder="MM/YY"
            keyboardType="number-pad"
            error={showErrors && !okExp}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Eyebrow>رمز الأمان CVV</Eyebrow>
          <Field
            icon="lock"
            value={n.cvv}
            onChangeText={(v) => onChange({ cvv: v.replace(/\D/g, '').slice(0, 4) })}
            onFocus={() => onFlip(true)}
            onBlur={() => onFlip(false)}
            placeholder="123"
            keyboardType="number-pad"
            secureTextEntry
            error={showErrors && !okCvv}
          />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Eyebrow>اسم مختصر للبطاقة (اختياري)</Eyebrow>
        <Field icon="sell" value={n.nick} onChangeText={(nick) => onChange({ nick })} placeholder="مثال: بطاقتي الأساسية" />
      </View>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface1, overflow: 'hidden' }}>
        <ToggleRow icon="verified" title="تعيين كطريقة الدفع الأساسية" on={n.def} minHeight={60} last onPress={() => onChange({ def: !n.def })} />
      </View>
      <View style={{ gap: 9 }}>
        <Eyebrow>شبكات البطاقات المدعومة</Eyebrow>
        <View style={styles.networks}>
          <PaymentNetworkLogo brand="MADA" width={34} height={27} />
          <PaymentNetworkLogo brand="VISA" width={38} height={25} />
          <PaymentNetworkLogo brand="AMEX" width={34} height={25} />
          <PaymentNetworkLogo brand="MASTERCARD" width={34} height={25} />
          <PaymentNetworkLogo brand="DISCOVER" width={42} height={24} />
        </View>
      </View>
      <View style={{ gap: 9 }}>
        <Eyebrow>طرق دفع أخرى</Eyebrow>
        <View style={styles.wallets}>
          <WalletProviderLogo provider="InstaPay" width={44} height={38} />
          <WalletProviderLogo provider="Orange Cash" width={44} height={38} />
          <WalletProviderLogo provider="WE Pay" width={44} height={38} />
          <WalletProviderLogo provider="Etisalat Cash" width={44} height={38} />
          <WalletProviderLogo provider="Vodafone Cash" width={44} height={38} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Icon name="shield_lock" size={18} fill color={c.ok} />
        <Txt s={12} w={500} lh={1.5} color={c.text3} style={{ flex: 1 }}>
          توصيلة تحمي معلومات بطاقتك وتستخدم اتصالًا آمنًا لمعالجة الدفع. لا يتم حفظ رقم البطاقة أو رمز الأمان على جهازك.
        </Txt>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 26, shadowColor: '#1A1A1A', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  networks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 7 },
  wallets: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, padding: 9, borderRadius: 16, backgroundColor: '#F3F3F8' },
  strip: { position: 'absolute', left: 0, right: 0, top: 28, height: 42, backgroundColor: '#111111' },
  cvv: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 92,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  hint: { position: 'absolute', left: 20, bottom: 18 },
});
