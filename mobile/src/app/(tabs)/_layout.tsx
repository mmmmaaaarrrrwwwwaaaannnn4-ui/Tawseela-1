import { Slot, router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { selectCartCount, useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

const TAB_RED = '#E50920';
const MAIN_TABS = [
  { key: 'home', label: 'الرئيسية', route: '/home', icon: 'home' as const, activeIcon: 'home' as const },
  { key: 'payments', label: 'إضافة فيزا', route: '/(tabs)/payments', icon: 'credit_card' as const, activeIcon: 'credit_card' as const },
  { key: 'saved', label: 'المفضلة', route: '/saved', icon: 'favorite' as const, activeIcon: 'favorite' as const },
  { key: 'profile', label: 'حسابي', route: '/profile', icon: 'person' as const, activeIcon: 'person' as const },
];

export default function TabsLayout() {
  const cartCount = useApp(selectCartCount);
  const pathname = usePathname();
  const { c, isDark } = useTheme();
  const glassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  const surface = (children: ReactNode, style: object) => glassAvailable ? (
    <GlassView glassEffectStyle="clear" isInteractive colorScheme={isDark ? 'dark' : 'light'} style={style}>{children}</GlassView>
  ) : (
    <View style={[style, styles.fallback, { backgroundColor: c.surface1, borderColor: c.line }]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <Slot />
      <View pointerEvents="box-none" style={styles.navigation}>
        <View style={styles.mainDock}>
          {surface(
            <View style={styles.tabsRow}>
              {MAIN_TABS.map((tab) => {
                const active = pathname.endsWith(tab.key) || (tab.key === 'home' && pathname.endsWith('/home'));
                return (
                  <PressableScale key={tab.key} onPress={() => router.navigate(tab.route as never)} scaleTo={0.94}
                    accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={tab.label}
                    style={styles.tab}>
                    {active ? <View pointerEvents="none" style={styles.activePill} /> : null}
                    <Icon name={tab.icon} size={24} fill={active} color={active ? TAB_RED : c.text2} />
                    <Txt s={10.5} w={active ? 700 : 500} color={active ? TAB_RED : c.text2}>{tab.label}</Txt>
                  </PressableScale>
                );
              })}
            </View>,
            styles.mainGlass,
          )}
        </View>
        <View style={styles.cartDock}>
          <PressableScale onPress={() => router.navigate('/cart')} scaleTo={0.94}
            accessibilityRole="tab" accessibilityLabel="سلة المشتريات" style={styles.cartHit}>
            {surface(
              <View style={styles.cartContent}>
                <View style={styles.cartIcon}>
                  <Icon name="shopping_bag" size={25} fill color={TAB_RED} />
                  {cartCount > 0 ? <View style={styles.badge}><Txt s={10} w={800} color="#FFFFFF">{cartCount > 99 ? '99+' : cartCount}</Txt></View> : null}
                </View>
                <Txt s={10.5} w={700} color={c.text1}>السلة</Txt>
              </View>,
              styles.cartGlass,
            )}
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navigation: { position: 'absolute', left: 14, right: 14, bottom: 7, height: 72, flexDirection: 'row-reverse', alignItems: 'stretch', gap: 10, zIndex: 50 },
  mainDock: { flex: 1, minWidth: 0 },
  mainGlass: { flex: 1, minHeight: 72, borderRadius: 36, overflow: 'hidden' },
  fallback: { borderWidth: StyleSheet.hairlineWidth },
  tabsRow: { flex: 1, minHeight: 72, flexDirection: 'row-reverse', alignItems: 'stretch', paddingHorizontal: 5 },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 7, position: 'relative' },
  activePill: { ...StyleSheet.absoluteFillObject, top: 4, bottom: 4, left: 2, right: 2, borderRadius: 26, backgroundColor: 'rgba(229,9,32,0.10)' },
  cartDock: { width: 76, height: 72 },
  cartHit: { width: '100%', height: '100%' },
  cartGlass: { width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cartContent: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  cartIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: TAB_RED, alignItems: 'center', justifyContent: 'center' },
});
