import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme';

type Variant = 'strong' | 'normal' | 'nav';

interface Props {
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Retained for call-site compatibility; native iOS glass uses the system material. */
  intensity?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

/**
 * Native Liquid Glass surface on supported iOS versions, with a translucent
 * theme-matched fallback on Android and platforms without the native effect.
 */
export function Glass({ variant = 'strong', style, children, pointerEvents }: Props) {
  const { c, isDark } = useTheme();
  const tint = variant === 'nav' ? c.navGlass : variant === 'strong' ? c.glassStrong : c.glass;
  const flat = StyleSheet.flatten(style) ?? {};
  const radius = {
    borderRadius: flat.borderRadius,
    borderTopLeftRadius: flat.borderTopLeftRadius,
    borderTopRightRadius: flat.borderTopRightRadius,
    borderBottomLeftRadius: flat.borderBottomLeftRadius,
    borderBottomRightRadius: flat.borderBottomRightRadius,
  };

  const nativeGlassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  if (nativeGlassAvailable) {
    return (
      <View pointerEvents={pointerEvents} style={[{ overflow: 'hidden' }, style]}>
        <GlassView
          pointerEvents="none"
          glassEffectStyle={variant === 'normal' ? 'clear' : 'regular'}
          isInteractive={variant === 'nav'}
          colorScheme={isDark ? 'dark' : 'light'}
          tintColor={tint}
          style={[StyleSheet.absoluteFill, radius]}
        />
        {children}
      </View>
    );
  }

  return (
    <View pointerEvents={pointerEvents} style={[{ overflow: 'hidden', backgroundColor: variant === 'nav' ? c.navSolid : c.glassSolid }, style]}>
      {children}
    </View>
  );
}
