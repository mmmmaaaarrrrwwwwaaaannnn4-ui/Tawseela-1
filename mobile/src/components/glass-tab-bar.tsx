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

/** Floating “liquid glass” tab bar with a sliding pill (66px, radius 33). */
export function GlassTabBar({ items, index, onPress, bump = 0, pillInset = 4 }: Props) {
  const { c, isDark } = useTheme();
  const { floatBottom } = useChrome();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const seg = w / items.length;
  const nativeGlassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  useEffect(() => {
    if (seg) x.set(withSpring((items.length - 1 - index) * seg, { damping: 14, stiffness: 170, mass: 0.8 }));
  }, [index, seg, x]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => {
    const nw = e.nativeEvent.layout.width;
    if (Math.abs(nw - w) > 0.5) {
      setW(nw);
      x.set((items.length - 1 - index) * (nw / items.length));
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: floatBottom }]}>
      <View style={styles.shadow}>
        {nativeGlassAvailable ? (
          <GlassContainer spacing={10} style={styles.container}>
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              colorScheme={isDark ? 'dark' : 'light'}
              style={[styles.bar, { borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.72)' }]}
            >
              <View style={styles.indicatorLayer} pointerEvents="none" onLayout={onLayout}>
                {seg ? (
                  <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: seg }, pill]}>
                    <View style={[styles.pill, { left: pillInset, right: pillInset }]}>
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(255,240,0,0.14)' : 'rgba(255,240,0,0.34)' }]} />
                    </View>
                  </Animated.View>
                ) : null}
              </View>
              <View style={styles.row}>
                {items.map((t, i) => (
                  <TabButton key={t.key} item={t} active={i === index} onPress={() => onPress(i)} bump={bump} />
                ))}
              </View>
            </GlassView>
          </GlassContainer>
        ) : (
          <View style={[styles.bar, styles.fallbackBar, { borderColor: c.glassLine, backgroundColor: isDark ? 'rgba(24,24,24,0.48)' : 'rgba(255,255,255,0.42)' }]}>
            <View style={styles.row}>
              {items.map((item, i) => (
                <TabButton key={item.key} item={item} active={i === index} onPress={() => onPress(i)} bump={bump} />
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
  const s = useSharedValue(1);
  const prev = useRef(bump);
  useEffect(() => {
    if (bump !== prev.current) {
      prev.current = bump;
      s.set(withSequence(withTiming(1.45, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 220 })));
    }
  }, [bump, s]);
  const badgeSt = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
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
          <Animated.View style={[styles.badge, badgeSt]}>
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
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  container: { borderRadius: 33, overflow: 'hidden' },
  bar: { height: 66, borderRadius: 33, borderWidth: 1, overflow: 'hidden', backgroundColor: 'transparent' },
  fallbackBar: { borderWidth: 1 },
  indicatorLayer: { ...StyleSheet.absoluteFill, zIndex: 0 },
  pill: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    borderRadius: 26,
    overflow: 'hidden',
  },
  row: { flex: 1, flexDirection: 'row', direction: 'rtl', zIndex: 1 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
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
