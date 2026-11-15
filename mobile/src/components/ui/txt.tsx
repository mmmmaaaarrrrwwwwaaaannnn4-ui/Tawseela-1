import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/theme';
import { arText } from '@/lib/ar';
import { arabicFamily, family, type Weight } from '@/theme/typography';

export interface TxtProps extends TextProps {
  s?: number;
  w?: Weight;
  lh?: number;
  ls?: number;
  color?: string;
  align?: TextStyle['textAlign'];
  upper?: boolean;
  tabular?: boolean;
  strike?: boolean;
}

/** BF Arabic and Latin font files are selected by script; weights map to the supplied local font assets. */
export function Txt({ s = 14, w = 400, lh, ls, color, align, upper, tabular, strike, style, children, ...rest }: TxtProps) {
  const { c } = useTheme();
  const isArabic = typeof children === 'string' && /[\u0600-\u06FF]/.test(children);
  const t: TextStyle = {
    fontFamily: isArabic ? arabicFamily(w) : family(w),
    fontSize: s,
    color: color ?? c.text1,
    ...(lh ? { lineHeight: Math.round(s * Math.max(lh, 1.08)) } : null),
    ...(ls ? { letterSpacing: ls * s } : null),
    textAlign: align ?? (isArabic ? 'right' : 'left'),
    writingDirection: isArabic ? 'rtl' : 'ltr',
    ...(upper ? { textTransform: 'uppercase' as const } : null),
    ...(tabular ? { fontVariant: ['tabular-nums' as const] } : null),
    ...(strike ? { textDecorationLine: 'line-through' as const } : null),
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
  return <Text allowFontScaling={false} {...rest} style={[t, style]}>{typeof children === 'string' ? arText(children) : children}</Text>;
}