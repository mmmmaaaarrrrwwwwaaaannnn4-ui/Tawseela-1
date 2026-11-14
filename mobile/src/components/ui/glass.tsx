import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

type Variant = 'strong' | 'normal' | 'nav';

interface Props {
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  intensity?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Solid, accessible surface used by screen chrome and floating actions.
 * Native Liquid Glass is intentionally reserved for the bottom tab bar only.
 */
export function Glass({ variant = 'strong', style, children, pointerEvents }: Props) {
  const { c } = useTheme();
  const backgroundColor = variant === 'nav' ? c.navSolid : variant === 'strong' ? c.surface1 : c.surface2;

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        { overflow: 'hidden', backgroundColor, borderColor: c.line, borderWidth: StyleSheet.hairlineWidth },
        style,
      ]}
    >
      {children}
    </View>
  );
}
