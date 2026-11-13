import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icons/icon';
import { AccentFill } from '@/components/ui/buttons';
import { useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useTheme } from '@/theme/theme';

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
  badge?: number;
}

interface Props {
  items: TabItem[];
  index: number;
  onPress: (i: number) => void;
  /** Increments to pop the badge (fly-to-cart landing). */
  bump?: number;
  /** Kept for compatibility with existing callers; native iOS uses no selected capsule. */
  pillInset?: number;
}

/**
 * Floating native iOS Liquid Glass tab bar.
 *
 * Native Liquid Glass bar with a separate tinted native glass surface for the
 * selected tab. The non-iOS fallback stays translucent and never pretends to
 * be the native iOS material.
 */
export function GlassTabBar({ items, index, onPress, bump = 0 }: Props) {
  const { c, isDark } = useTheme();
  const { floatBottom } = useChrome();
  const liquidGlassAvailable =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  const tabs = (
    <View style={styles.row}>
      {items.map((item, i) => (
        <TabButton
          key={item.key}
          item={item}
          active={i === index}
          onPress={() => onPress(i)}
          bump={bump}
        />
      ))}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: floatBottom }]}>
      <View style={styles.shadow}>
        {liquidGlassAvailable ? (
          <GlassView
            glassEffectStyle="clear"
            isInteractive
            colorScheme={isDark ? 'dark' : 'light'}
            style={styles.nativeBar}
          >
            {tabs}
          </GlassView>
        ) : (
          <View
            style={[
              styles.nativeBar,
              styles.fallbackBar,
              {
                borderColor: c.glassLine,
                backgroundColor: isDark ? 'rgba(24,24,24,0.34)' : 'rgba(32,32,32,0.12)',
              },
            ]}
          >
            {tabs}
          </View>
        )}
      </View>
    </View>
  );
}

function TabButton({ item, active, onPress, bump }: { item: TabItem; active: boolean; onPress: () => void; bump: number }) {
  const { c } = useTheme();
  const color = active ? c.accent : c.text2;
  const scale = useSharedValue(1);
  const previousBump = useRef(bump);

  useEffect(() => {
    if (bump !== previousBump.current) {
      previousBump.current = bump;
      scale.set(withSequence(withTiming(1.38, { duration: 150 }), withSpring(1, { damping: 9, stiffness: 220 })));
    }
  }, [bump, scale]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
    >
      {active ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          tintColor="#FFF000"
          colorScheme="light"
          style={styles.selectedGlass}
        />
      ) : null}
      <View style={styles.iconWrap}>
        <Icon name={item.icon} size={25} fill={active} color={color} />
        {item.badge ? (
          <Animated.View style={[styles.badge, badgeStyle]}>
            <AccentFill radius={9} />
            <Txt s={10} w={700} color={c.accentInk}>
              {item.badge}
            </Txt>
          </Animated.View>
        ) : null}
      </View>
      <Txt s={10.5} w={active ? 700 : 500} color={color}>
        {item.label}
      </Txt>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, zIndex: 40 },
  shadow: {
    borderRadius: 35,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  nativeBar: {
    minHeight: 72,
    borderRadius: 35,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  fallbackBar: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    direction: 'rtl',
    alignItems: 'stretch',
    paddingHorizontal: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 8,
    position: 'relative',
  },
  selectedGlass: {
    ...StyleSheet.absoluteFillObject,
    top: 5,
    bottom: 5,
    left: 3,
    right: 3,
    borderRadius: 24,
  },
  iconWrap: {
    minWidth: 28,
    minHeight: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
