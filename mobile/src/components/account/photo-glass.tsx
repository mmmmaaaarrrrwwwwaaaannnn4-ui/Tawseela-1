import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

/** Opaque photo control surface; blur/glass is reserved for the bottom tab bar. */
export function PhotoGlass({ children, style, tint = 0.16, border }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tint?: number; border?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        { overflow: 'hidden', backgroundColor: c.surface2 },
        border ? { borderWidth: 1, borderColor: c.line } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
