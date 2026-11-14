import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type TabRouteName = 'home' | 'menu' | 'payments' | 'profile';
import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons/icon';
import { Txt } from '@/components/ui/txt';
import { useTheme } from '@/theme/theme';

const TAB_ITEMS: { name: TabRouteName; label: string; icon: IconName }[] = [
  { name: 'home', label: 'الرئيسية', icon: 'home' },
  { name: 'menu', label: 'القائمة', icon: 'menu_book' },
  { name: 'payments', label: 'باي', icon: 'credit_card' },
  { name: 'profile', label: 'المزيد', icon: 'menu' },
];

function BottomBar({ state }: Pick<BottomTabBarProps, 'state'>) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

  const glassColorScheme = isDark ? 'dark' : 'light';

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(insets.bottom, 8) + 8 }]}>
      <View style={styles.dockRow}>
        <View style={styles.mainBarShadow}>
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            colorScheme={glassColorScheme}
            style={[
              styles.mainBar,
            ]}
          >
            <View style={styles.tabsRow}>
              {TAB_ITEMS.map((item) => {
                const route = state.routes.find((candidate) => candidate.name === item.name);
                if (!route) return null;
                const focused = activeName === item.name;
                const color = focused ? c.accent : c.text2;
                return (
                  <Pressable
                    key={item.name}
                    accessibilityRole="tab"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: focused }}
                    onPress={() => {
                      if (!focused) router.navigate(`/(tabs)/${item.name}`);
                    }}
                    style={styles.tab}
                  >
                    {focused ? (
                      <GlassView
                        pointerEvents="none"
                        glassEffectStyle="regular"
                        colorScheme={glassColorScheme}
                        style={styles.selectedGlass}
                      />
                    ) : null}
                    <Icon name={item.icon} size={25} color={color} fill={focused} />
                    <Txt s={11} w={focused ? 700 : 500} color={color}>{item.label}</Txt>
                  </Pressable>
                );
              })}
            </View>
          </GlassView>
        </View>

        <View style={styles.cartShadow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="السلة"
            onPress={() => router.navigate('/cart')}
            style={styles.cartPressable}
          >
            <GlassView
              glassEffectStyle="regular"
              isInteractive
              colorScheme={glassColorScheme}
              style={[
                styles.cartGlass,
              ]}
            >
              <Icon name="add_shopping_cart" size={29} color={c.accent} />
            </GlassView>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{ headerShown: false, animation: 'shift' }}
    >
      <Tabs.Screen name="home" options={{ title: 'الرئيسية' }} />
      <Tabs.Screen name="menu" options={{ title: 'القائمة' }} />
      <Tabs.Screen name="payments" options={{ title: 'باي' }} />
      <Tabs.Screen name="profile" options={{ title: 'المزيد' }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 8,
    zIndex: 50,
  },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mainBarShadow: {
    flex: 1,
    borderRadius: 36,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  mainBar: {
    minHeight: 76,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  tabsRow: {
    minHeight: 76,
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'stretch',
    paddingHorizontal: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    position: 'relative',
  },
  selectedGlass: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    left: 3,
    right: 3,
    borderRadius: 28,
  },
  cartShadow: {
    width: 76,
    height: 76,
    borderRadius: 38,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cartPressable: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
  },
  cartGlass: {
    flex: 1,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
