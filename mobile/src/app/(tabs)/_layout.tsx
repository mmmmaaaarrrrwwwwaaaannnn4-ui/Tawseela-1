import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { selectCartCount, useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

const TAB_RED = '#E50920';

export default function TabsLayout() {
  const cartCount = useApp(selectCartCount);
  const { c, isDark } = useTheme();
  const glassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

  return (
    <View style={styles.root}>
      <NativeTabs tintColor={TAB_RED} iconColor={{ default: TAB_RED, selected: TAB_RED }}
        labelStyle={{ color: TAB_RED }} minimizeBehavior="never">
        {/* Native order is left-to-right: My account, Favorites, Add card, Main menu. */}
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>المفضلة</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="saved">
          <NativeTabs.Trigger.Label>المفضلة</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="payments">
          <NativeTabs.Trigger.Label>إضافة فيزا</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} md="add_card" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="menu">
          <NativeTabs.Trigger.Label>القائمة الرئيسية</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} md="menu_book" />
        </NativeTabs.Trigger>
      </NativeTabs>

      {/* The cart is an independent Liquid Glass control, aligned to the native tab bar height. */}
      <View pointerEvents="box-none" style={styles.cartDock}>
        <PressableScale onPress={() => router.navigate('/cart')} scaleTo={0.94}
          accessibilityRole="tab" accessibilityLabel="سلة المشتريات"
          style={styles.cartHit}>
          {glassAvailable ? (
            <GlassView glassEffectStyle="clear" isInteractive colorScheme={isDark ? 'dark' : 'light'} style={styles.cartGlass}>
              <CartContent count={cartCount} color={c.accent} text={c.text1} />
            </GlassView>
          ) : (
            <View style={[styles.cartGlass, styles.cartFallback, { backgroundColor: c.surface1, borderColor: c.line }]}>
              <CartContent count={cartCount} color={c.accent} text={c.text1} />
            </View>
          )}
        </PressableScale>
      </View>
    </View>
  );
}

function CartContent({ count, color, text }: { count: number; color: string; text: string }) {
  return (
    <View style={styles.cartContent}>
      <View style={styles.cartIcon}>
        <Icon name="shopping_bag" size={25} fill color={color} />
        {count > 0 ? <View style={styles.badge}><Txt s={10} w={800} color="#FFFFFF">{count > 99 ? '99+' : count}</Txt></View> : null}
      </View>
      <Txt s={10.5} w={700} color={text}>السلة</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cartDock: { position: 'absolute', left: 14, bottom: 7, width: 76, height: 72, zIndex: 30 },
  cartHit: { width: '100%', height: '100%' },
  cartGlass: { width: '100%', height: '100%', borderRadius: 36, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cartFallback: { borderWidth: StyleSheet.hairlineWidth },
  cartContent: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  cartIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: TAB_RED, alignItems: 'center', justifyContent: 'center' },
});
