import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
  /** Horizontal inset of the sliding pill (customer 4, admin 6). */
  pillInset?: number;
}

/**
 * Native iOS Liquid Glass tab bar.
 *
 * The bar material and the selected capsule are sibling GlassViews inside one
 * GlassContainer, allowing iOS to blend their native glass surfaces. The
 * non-iOS/unsupported fallback is deliberately separate from the native path.
 */
export function GlassTabBar({ items, index, onPress, bump = 0, pillInset = 4 }: Props) {
  const { c, isDark } = useTheme();
  const { floatBottom } = useChrome();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const seg = w / items.length;
  const liquidGlassAvailable =
    Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  useEffect(() => {
    if (seg) {
      x.set(withSpring((items.length - 1 - index) * seg, { damping: 18, stiffness: 190, mass: 0.75 }));
    }
  }, [index, seg, items.length, x]);

  const pillPosition = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (Math.abs(nextWidth - w) > 0.5) {
      setW(nextWidth);
      x.set((items.length - 1 - index) * (nextWidth / items.length));
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: floatBottom }]}>
      <View style={styles.shadow}>
        {liquidGlassAvailable ? (
          <View style={styles.bar}>
            <GlassContainer spacing={12} style={StyleSheet.absoluteFill}>
              {/* Native system material behind the complete tab bar. */}
              <GlassView
                glassEffectStyle="regular"
                colorScheme={isDark ? 'dark' : 'light'}
                style={[StyleSheet.absoluteFill, styles.baseGlass]}
              />

              {/* A second native glass surface, tinted Tawseela yellow. */}
              {seg > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.animatedPill,
                    { width: seg },
                    pillPosition,
                  ]}
                >
                  <GlassView
                    glassEffectStyle="regular"
                    isInteractive
                    colorScheme={isDark ? 'dark' : 'light'}
                    tintColor={isDark ? 'rgba(255,240,0,0.22)' : 'rgba(255,240,0,0.38)'}
                    style={[styles.pillGlass, { left: pillInset, right: pillInset }]}
                  />
                </Animated.View>
              ) : null}
            </GlassContainer>

            <View style={styles.row} onLayout={onLayout}>
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
          </View>
        ) : (
          <View
            style={[
              styles.bar,
              styles.fallbackBar,
              {
                borderColor: c.glassLine,
                backgroundColor: isDark ? 'rgba(24,24,24,0.68)' : 'rgba(255,255,255,0.68)',
              },
            ]}
          >
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
          </View>
        )}
      </View>
    </View>
  );
}

function TabButton({ item, active, onPress, bump }: { item: TabItem; active: boolean; onPress: () => void; bump: number }) {
  const { c } = useTheme();
  const color = active ? c.accentText : c.text2;
  const scale = useSharedValue(1);
  const previousBump = useRef(bump);

  useEffect(() => {
    if (bump !== previousBump.current) {
      previousBump.current = bump;
      scale.set(withSequence(withTiming(1.45, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 220 })));
    }
  }, [bump, scale]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.93}
      style={styles.tab}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
    >
      <View>
        <Icon name={item.icon} size={24} fill={active} color={color} />
        {item.badge ? (
          <Animated.View style={[styles.badge, badgeStyle]}>
            <AccentFill radius={9} />
            <Txt s={10} w={700} color={c.accentInk}>
              {item.badge}
            </Txt>
          </Animated.View>
        ) : null}
      </View>
      <Txt s={10.5} w={600} color={color}>
        {item.label}
      </Txt>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, zIndex: 40 },
  shadow: {
    borderRadius: 33,
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  bar: {
    height: 66,
    borderRadius: 33,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  baseGlass: {
    borderRadius: 33,
  },
  animatedPill: {
    position: 'absolute',
    top: 7,
    bottom: 7,
  },
  pillGlass: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 26,
    overflow: 'hidden',
  },
  fallbackBar: {
    borderWidth: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    direction: 'rtl',
    zIndex: 2,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -11,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
