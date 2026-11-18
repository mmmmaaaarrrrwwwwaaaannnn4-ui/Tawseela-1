import { useCallback, useEffect, useState, type ReactNode } from 'react';
import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';

import { blankCard, CardSheet } from '@/components/account/card-sheet';
import { Wallet } from '@/components/account/wallet';
import { PaymentNetworkLogo } from '@/components/account/brand-logos';
import { PagerDots } from '@/components/ui/controls';
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
// الصورتين متخزنين جوه الملف نفسه (base64) — مفيش ملفات برّه ولا require.
const LOGO = { uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWsAAABWCAMAAAA+C0eNAAAAwFBMVEUAAADX7lH29/MRLB6XpZ10jTVXcCmSrEgQZwv+/v4TJQuyzVVqagtsbm0xSxlZamBYcCdTZVuGnzuWpZpfcWcxSCX//3g3UBaurq51hm+7yMFOaCW3w7tosBqqqlV7i4NrhTJerF5yhXCOnpUeZGI5TUM6TkR//38iNgt7ioJxtbX//wAA/wCIo0eq/1V//wClpQCq/6r/f388TkRxhWx///+k7u67ycT/AAAA//99kYaFnz2//z/l5aHJ0sxVAADfZhkjAAAAQHRSTlMB/v7+6OOl6wQBUv4DA2b752budJv+ApQD7fp29wMD6K0Do58KYP8CkKIDAQG9AwIDAwKEbAIDlQEBdbEEBKkDAf2AFQAADwJJREFUeNrVXYd22zoShSSQYC+yGlWs5iI7edkkr9f9/79agBWdICU9cyexjyk28HJwp2AAATA4cfFPFJV/ABBqD17atr2x8W9vKM1fuS5wV812uFqt3sFQJT1v12sIU0BafMTbe7je4k1RNsgfYfF9f4SilrfyLyHN/RHynw9LqU/jUv7AWyF4huXmXtDxJRo1kg2h+a9YM2ZZFqcluqTB6cNDOkSVdlxQQYslxWCn63pzX7JKLcmIwXoxAE1Jy+ZD0nb833mDzeawZAVmDdRjCFxnS23PuK44pbG2we7j21/3yfE6V+0UNm0fGNgh8GhssWK/jRnsGYl8Cmo/AsGHtz7lGvsMaUUZGlsz2I5PgIF+TB+7ADat1tbHK8qKbS0GF9LYe0MjEchge06ZzTFlGx0AEEshiw9XlNOY7YWs4gxLsT8DsOaaN+b0OmywHhiFYLM+5lrLKk42KKx/57H+EY5VfO2yFIIGYNa5TviPsx4w1gKHgF85+qb9EIula/fDKeQnFmv4xG6/Dc02MlifwR/05poKDQPgcXQdfHjbOb2eOez2wAKad85rcp2xwr0OOQrxBuDxRQxnbD1vrXFYP95tCinFhs+saeeigWRYHh9R7DPnduwHrNYAPAEPNnpA0iEV2JCB2gEeFzR+fFQWAodiwBj80jxLDn0IhicpxPKWFv7dCjzvyfbMY9AMBhc05mDXceJ6VsSR1PYvw0OaAOx5Xp2ODIEsK8l5fFMwBKzBz1iT12WqqWhyqdk5HQ5RclCbbLtTMTmj1mzeyRpO09N0llYZVaIoaRqT7eMTGKY8hQ67yTeUDxoHkeNjeqFi+8rQlMj92u4GgeME4DEAGgpB3i2eg9ypy0PLD37/5roratfKdd3Q+Lrh8YpOFd7qPfyH3bxp0Ojs6vMXBrxfH7K7pZI5qxtQevd3hVUsF2wlL/kH+VAv4/FxQWN/dQg+uS2vlT2cY4VbJRedvBVeOstgT8ne0qgbbTnBonl2z/J9hKYI5UO3RxWF+P2HdQvFXNq2hXKxigH5R3W8gltlW1Z5cFRfQs4yBQGaUCXxdWO4HV8laxhHAtoO9itk4/hB1XCPyAUpXQ2L8/h66jS509JCPkP+1lKF4Cv+wW+FesvIBuCTjmaAfL/geEUzOL6JYPfSRPNy1owqFcMKrXTrGC9klAgqVXKQnk4DfLsoYcioRJCgHcj6gGcLh0vtckBorxQT1yW9VqO53K1bh+HYg5vNZqmsf9qsjjGANvZLoBC6zz8KFCEXfFxkKe7mJ+LxX0nrJMeipeTi+MqVoI3Wcr+zo5I3Ue201mwHLPdihkCuNY1EgFJT1BY0enKLGwa7YHckRjdYAO/gq29n8RcNsfVQvJiloKm2bxhoYQS8bHxzqXJH36rA9YEOu12F1ki6ash5IfSzfCaEimVa/KKpK+Dch0h3u9yP/Mx0OvXxHI3wXhJqyf6Mx/cAu0QKipmvV+Jz6B+dwmkzUo3qch4KRTy4U9i2vcRi5+7DQXs7cbDY1nYCl3mP9khjTlij+NaHIyaFaDgeEtfsWEMNvQbrRy5FKnvyR4UXgunaoVRKYTU/lcqW70aXJRq1Cb7u19pqa6HmnE4X/MnsXar4GveVXkr9UmKtfR84YG0uv6d9qaXf+uCBYvSL7qI7zmpeclYpJKMV0R+1iwU+BdVlW9pnscTOtM9XDRm5IO3lfaxLqOMWFgnrkfH1c+jWUEdtz45oOmQfnNF4VuUbInVa36a0L+2qk1u6AT0Exz8NUoZFs55uRom1vk9AEGXiiBZvS1rIcwEOnMbvVFYpUXKokVjFTYM2M8q7IgnX9L9vCvU4NqAQ4mbH1LgtFYobcOexsXG8x/e5cTVsDoFAnu82k6JbBAaqMNrQrvxUZU4Ypkn7+hhzEwphB5Uba9Kucqhx2fguemAsj6Xq2V53Cilh+g6s9kMBbU58rhFOW8FALwrZm56Q1r71kVcbf5oklpUwyvFnA6iYd9pRHrTC8XZ179OfWgkRC8m0NRBcEB9ZwqGH2mg43K0seSow6u1WZ0Z0zVR+qHQxKS+VKGurp6qgkRutwWcpbsIAV92Qv2eONUnrcqqQyA5tsHYFupamaPtHMKXHNzdXa0eOj1U/N2LdJkfh8dERh5gnWcgVngJuPqEl4bHG3Y79DFUnWAqsuVtJi4RcsO/AGTDLMurVTLrRNaXWRwafBuqJL0+aBmDJBQpUIMN1kVb/3ZrwwhzmE71mDbdfHzmX20aXp2t5YG4MdOV01NjCjhSShr80+ExlT8JTyGujEpba8rAqf6hV/lVKIWguQD0RXQj2LVGnjKTlhC6nC5IioVfAFp9pkGZauO3i8Ukr22gKofTMUkZeyrzTI/uYjbP1XxmF+MlEIuyLJFE680mi6AJ+pPCuadPdqAvs5kgzmi2lEAihkq3r4ay/GAqhHgXJ+yHPBhvGyisoxOF0Ld87mbRj7fFzcqgj59LuxTvySMyhO4ZBDOTbBuUUAuN4rjSVmK3D5h3/QPOyXGsOtMeXsM/4Gz2qi+SOtyRotORQT4ROw5ZXqcyopah9oxONzdAi7OLacWqd8RSiN5UpeFKZM0v6JBvKyHtINdLIWc0maHRcIWhMFFDPOa7lLGOi6gG1d/mFe61ineHKzDDGQtsYjy/mtT9u9a15M1/GFdbUl2WQAjHX4FQUEuz49N+k6r07IbWlgpo1jeS+bKp3rugB/qW4lyPkIGVBI+xEIPO4gDeTeyF6rGcs1gaJZE+ZsafT8FwG3J/XKsXnxpVQJ4ILweWyFKaRGpixRvo6Q9dIrbc1ccCKJlgvpE7G7nUuIGSH1D2DZEPiNSOmqvyaOFaJLuWuiyHU86mYMrdVpybSV76c8sHQYy8nJGYQjLFAhkJeFEdq1FoXPDO0TAYPp0jWBabFyOJUVnqAin3c+5nOZSJmQxD4LmA9QkXqJGHTNfl98J2QOmXWKb2njlfKHZmAtdRjfwZPmrG54QjxjL9c2TqxztBMrecqqMWRRl12BLIOZ9Ar2flvCMHpSk3wI77O0AHPa/moVgwFRF+U3DI3y468cbfn02JDEWzuXq/FWmYZT8rU3Qts52ABWaina75u3cAT+QDJRzGP7QOh+oGxwMjh45mB8vfY2jMRWV0yGwqFfWGfUdd/g0EcTS62p1or4pi5PJNX4b3VIDvX07VYV2cPDuxpaVWuYThJHPOzNBWy58JuKI/OKXKpPtjGOrqWrQ7jgos1MKirMqGgf6fDDPKdf9LvUgqZKMLuRjKeXHhReHzy2uBl5jOO8YdCnQFVvqYT1JJqJ1niOhPwUuVClFjHYyO6rqvBPfuQoSkJTewIXLTa5N+bq6kZMe21IfImyicSp2YlCALYWz3WUrU+tU8i8lqjSWup2Xe1B4lspjnHXtYEXeSj52+mMSKMO2AtD49+VE8vODal7I9AY/+xxigNFsFJ/pZ8vxfSeWS77KrZfuIpdAp2qGKC8ZznkNicQTot66DAzMr1PvGlOHmqE9HlgoyQ9sRZYC7wki6qjUgTFROStkqsX3R5kXisIexsPDb1QpRiC8Wk+Uyg4hLRAfH1MQXSTr3wZ/PwGdnVBjZCh8gDMpQWeRbRTLkR0i3sGq2VdD3XVaRCtYvyosivrDvMjSOPHG1s6weE0A/4H8Zyk69nW13B29hkD5n6RsypV52Un2gXJ1rWAZ9WIujZRTaunvpESXUBuT4G5f3sAz77wKX4Eou6Sn4v9UOmajhl9q1Cdq40mzE0Gj9vFdlUtXpWbSCaHjeofQfdDDjNZCX1vDH6dmyy7MK3QjfPOtWNCqiHwTizCff7LMviOIMGM2aMJ3p+cbHg9pNfYLFjH2O3yPfkOxcBA6ezWLiV1K/H0d180b52QEAu+hdf1lRwWnnpLy0vVafXk3ircESMC1IHvOBRP7HEFJWxaNzrHNS4mO28j19a3YzWuUnh/znODl+/jLzfgiuxjid6eelVNzzQpWHM5VEoFU+6XWBmUnJjCHWs0/h0kGubm8uRuDJCKq/T0kfRWE8ipnFK7WkrZ0m7v98ZDXeF/7kUUYUrvH2LNxwQQyymIzuvngY7KjZsGWiXlxZvqzSlc2uh59DzfxXydw874Qp/RkL02H19Byl265euSt1agRO2zMXvLWGFSHo6/3OeeaAYZsO/nmbg11/PaeMKSlF9xOI4gfaFRJJFCXosWzIzLSjDAYyuHF5bgVMk+Jwyk1esCVeuElKKJOPnAcUe+cRMWK/CSjDA/8+1VQ7DrlodJbadJOQbVWz7hKSrP/RYcTtSTB5dxyxrv8TQqLBS7oO8h3lAZ03LupVrZZpLPse/mBByYhz5pxU9KTZPm4dgQ+ArpiHRcjqdDvZmE9HTfw0GnHssMqWbu7HFbnUhsL2EZKsd0S0i5XuMdfm20Dvf2O/vKPzNUJeJ9hGiFo1adJsG2IHtnm+1RMhckQwpZvl//sJOuL3ZMAqmGu4ZsCHmzFAEftZXR/hWRM1/ah8+l09bbFfs2fiuUn4pwuI+xQn+EgjIYks8k62nkejy+3Sqqn1+fL8VAd1rJtuZQe0YzjrvWRqA/3H3PPOPtG/FmlrIaNHaAfFNP/X0mrw7gn0ulv9y7kPWZcUL3zMfgDRBYGkrQgJjCrG8ZmJaR1n1nxxtuBhOi1JdIwdhkW9yV94G7duwtugVdPQU4idXBbf3Apt8DVZYOFH3Krc5AFfE2kuFZMw7+E1DYvQC2i1eCBmI+3pV6HWXJZ7eyEpaxtMHeuv1iucQyH93ClkjXru4jQUM62/yIc/rwt/3O3A2WQFxVfBfdL9aVEv8Vgby1QBnjslWegqhZgbrvJB85PbxBkmFm6r2mqQhvhX9stuYf3c/JHBBzI+1pVz/0rucdAzoKr2QaY50cJsMzs3Qhqd6EXysJvetzrPBpycm+CVQM0HDKU9GadjaYvPQljSwzJdZXdxoqf5Vniq7emXPLTylTXHB8Z78UVU6Ovhep3VtjrF8xmBv6Q+wwasW3eQKonxCDAFdDrKhj8pXKrbszc2T7XmPT9MHXs7n84OZpM/FlZoFPZ2f7LvKpuyV3sN+v89SkFep5w/y0z7LqIwqWQoRH77Z5D/V2ctILGrwoigqj9hsysoR4L5emxH+H6LTEc1zvd49AAAAAElFTkSuQmCC' };
const RECEIPT = { uri: 'data:image/png;base64,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' };
// مسافة بيضا بين معاينة البطاقة وعنوان "طريقة الدفع" (بالبكسل) — زوّدها أو قلّلها حسب رغبتك.
const CARD_GAP = 20;
const NETWORKS = ['MADA', 'VISA', 'AMEX', 'MASTERCARD', 'DISCOVER'];

type ServerCard = { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string; [k: string]: unknown };
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

// توحيد اسم نوع البطاقة: السيرفر ممكن يرجّع "Mastercard" أو "master" أو "MC" أو "American Express"...
// وكمان الرقم ممكن يجي مخفي، فنجرب الاسم الأول وبعدين أول أرقام الرقم.
function normalizeBrand(raw: unknown, number: string): string {
  const t = String(raw ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (t.includes('MASTER') || t === 'MC' || t === 'MAESTRO') return 'MASTERCARD';
  if (t.includes('VISA')) return 'VISA';
  if (t.includes('AMEX') || t.includes('AMERICANEXPRESS')) return 'AMEX';
  if (t.includes('MADA')) return 'MADA';
  if (t.includes('DISCOVER')) return 'DISCOVER';
  if (t.includes('MEEZA')) return 'MEEZA';
  const d = number.replace(/\D/g, '');
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'MASTERCARD';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^(6011|65|64[4-9])/.test(d)) return 'DISCOVER';
  return t || 'CARD';
}

// رقم نموذجي لكل شبكة عشان نجيب نفس خلفية الكارت من cardBrandOf لو الرقم الحقيقي مخفي.
const BRAND_SAMPLE: Record<string, string> = { VISA: '4000000000000000', MASTERCARD: '5100000000000000', AMEX: '340000000000000', DISCOVER: '6011000000000000' };

// تحويل واحد فقط لرد /v1/me/cards.
function mapCard(x: ServerCard) {
  const digits = x.number.replace(/\D/g, '');
  let b = cardBrandOf(digits);
  let brand = b.name !== 'CARD' ? normalizeBrand(b.name, digits) : normalizeBrand(x.brand, x.number);
  if (brand === 'CARD') {
    // Fallback to network/BIN metadata when the API masks the card number.
    const rest = Object.entries(x).filter(([k]) => !['name', 'id', 'number'].includes(k));
    const bin = rest.find(([k, v]) => /bin|first|prefix/i.test(k) && /^\d{1,9}$/.test(String(v ?? '')));
    brand = normalizeBrand(JSON.stringify(rest.map(([, v]) => v)), bin ? String(bin[1]) : digits);
  }
  if (b.name === 'CARD' && BRAND_SAMPLE[brand]) b = cardBrandOf(BRAND_SAMPLE[brand]);
  const exp = x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '';
  return { id: x.id, brand, num: x.number, exp, bg: b.bg, nick: '', name: x.name };
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

/* ───────────────────────── pieces ───────────────────────── */

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
  onDefault: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.row}>
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
    </View>
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
  const history = useApp(useShallow((s) => selectMyOrders(s).slice(0, 3)));

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
    console.log('CARDS RESPONSE:', JSON.stringify(res, null, 2)); // مؤقت للتشخيص — امسحه بعد ما نخلص
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
  const safeIdx = hasCards ? Math.min(idx, cards.length - 1) : 0;
  const cur = hasCards ? cards[safeIdx] : undefined;
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

  const curBrand = cur ? normalizeBrand(cur.brand, cur.num) : '';

  return (
    <View style={styles.root}>
      {/* ستاتس بار ثابت حقيقي: مش جوه الـ ScrollView فمبينزلش مع السكرول */}
      <View style={{ height: insets.top, backgroundColor: GREEN }} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        {/* ───── الهيدر ───── */}
        <View style={[styles.header, { paddingTop: 6 }]}>
          <View style={styles.headTop}>
            <View style={styles.headBtns}>
              <PressableScale scaleTo={0.92} onPress={() => router.push(ROUTES.support as never)} style={styles.circle}>
                <Ic d={P.headset} size={18} color={GREEN} />
              </PressableScale>
              <PressableScale scaleTo={0.92} onPress={() => router.push(ROUTES.more as never)} style={styles.circle}>
                <MoreDots />
              </PressableScale>
            </View>
            <Image source={LOGO} resizeMode="contain" style={{ width: 121, height: 29 }} />
          </View>

          <View style={styles.headBottom}>
            {/* الأيقونتين: دايرة 36 ومتمركزة على نفس خط مبلغ الرصيد */}
            <View style={styles.quick}>
              <PressableScale scaleTo={0.94} onPress={startCard} style={styles.quickCol}>
                <View style={[styles.quickCircle, { backgroundColor: CREAM }]}>
                  <Ic d={P.card} size={20} color={GREEN} sw={2.2} />
                </View>
                <Txt s={10} w={500} color={CREAM} align="center" numberOfLines={2}>البطاقات المحفوظة</Txt>
              </PressableScale>
              <PressableScale scaleTo={0.94} onPress={() => router.push(ROUTES.topUp as never)} style={styles.quickCol}>
                <View style={[styles.quickCircle, { backgroundColor: LIME }]}>
                  <Ic d={P.plus} size={21} color={GREEN} sw={2.2} />
                </View>
                <Txt s={10} w={500} color={CREAM} align="center" numberOfLines={2}>إضافة إلى الرصيد</Txt>
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

        {/* ───── كاروسيل البطاقات (نفس الـ Wallet القديم: سحب + فليب لضهر البطاقة) ───── */}
        {hasCards ? (
          <>
            <View style={{ marginTop: 12 }}>
              <Wallet cards={cards} index={safeIdx} defId={payM === PAY_CARD ? defCard : null} holder={user?.name ?? ''} onIndex={setIdx} />
            </View>
            {cards.length > 1 ? <PagerDots count={cards.length} index={safeIdx} onPick={setIdx} activeWidth={20} /> : null}
          </>
        ) : null}

        {/* ───── طريقة الدفع ───── */}
        <View style={[styles.sectionHead, { marginTop: hasCards ? 18 + CARD_GAP : 16 }]}>
          <Txt s={19} w={800} color="#111111" align="right">طريقة الدفع</Txt>
          <Txt s={13} color="#333333" align="right">بيانات بطاقتك مشفرة ومحمية معنا</Txt>
        </View>

        <View style={{ paddingHorizontal: 12, marginTop: 10 }}>
          {/* صف واحد بس للبطاقة المختارة في الكاروسيل (بدل تكرار كل البطاقات) */}
          {hasCards && cur ? (
            <MethodRow
              logo={NETWORKS.includes(curBrand) ? <PaymentNetworkLogo brand={curBrand as any} width={42} height={31} /> : <Txt s={10} w={800} color="#555555" align="center" numberOfLines={1}>{curBrand && curBrand !== 'CARD' ? curBrand : 'CARD'}</Txt>}
              title={cur.name || curBrand}
              subtitle={`•••• •••• •••• ${last4(cur.num)}`}
              isDefault={payM === PAY_CARD && defCard === cur.id}
              onDefault={() => useApp.getState().makeDefaultCard(cur.id)}
              onDelete={() => deleteCard(cur.id)}
            />
          ) : null}

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
        <View style={[styles.sectionHead, { marginTop: noMethods ? 20 : 24 }]}>
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
            <Image source={RECEIPT} resizeMode="contain" style={{ width: 100, height: 105 }} />
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

  header: { backgroundColor: GREEN, paddingBottom: 12, paddingRight: 10, paddingLeft: 14 },
  headTop: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headBtns: { flexDirection: 'row', gap: 7.5 },
  circle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  headBottom: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  // 26 = ارتفاع سطر "رصيدك هو" (22) + المسافة (4) → مركز الدايرة (36) = مركز مبلغ الرصيد (36)
  quick: { flexDirection: 'row', marginLeft: -11, marginTop: 26 },
  quickCol: { width: 58, alignItems: 'center', gap: 4 },
  quickCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  balanceBox: { alignItems: 'flex-end', gap: 4 },
  balanceLbl: { height: 22, flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceAmt: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6.5 },

  sectionHead: { paddingHorizontal: 12, gap: 3, alignItems: 'flex-end' },

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

  sep: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 7 },
  sepLine: { flex: 1, height: 1, backgroundColor: '#D5D8DC' },

  addBox: { marginTop: 19, marginHorizontal: 15, height: 83, borderRadius: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', gap: 12 },

  emptyHistory: { alignItems: 'center', marginTop: 4, paddingBottom: 8 },
});
