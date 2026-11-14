import { NativeTabs } from 'expo-router/native-tabs';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icons/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useTheme } from '@/theme/theme';

function CartAccessory() {
  const placement = NativeTabs.BottomAccessory.usePlacement();
  const { c } = useTheme();

  return (
    <View style={{ width: '100%', alignItems: 'flex-start', paddingLeft: 12, paddingRight: 12, paddingVertical: placement === 'inline' ? 0 : 4 }}>
      <PressableScale
        onPress={() => router.navigate('/cart')}
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel="السلة"
        style={{
          width: placement === 'inline' ? 42 : 54,
          height: placement === 'inline' ? 42 : 54,
          borderRadius: 27,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.surface1,
          borderWidth: 1,
          borderColor: c.glassLine,
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 5 },
          elevation: 8,
        }}
      >
        <Icon name="shopping_bag" size={25} color={c.accent} />
        {placement === 'inline' ? null : <Txt s={10} w={700} color={c.accentText}>السلة</Txt>}
      </PressableScale>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <NativeTabs tintColor="#E50920" disableTransparentOnScrollEdge>
      <NativeTabs.BottomAccessory>
        <CartAccessory />
      </NativeTabs.BottomAccessory>
      {/* Native tabs are laid out in RTL order on iOS: this produces Home, Menu, Pay, More from left to right. */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf={{ default: 'line.3.horizontal', selected: 'line.3.horizontal' }} md={{ default: 'menu', selected: 'menu' }} />
        <NativeTabs.Trigger.Label>المزيد</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="payments">
        <NativeTabs.Trigger.Icon sf={{ default: 'creditcard', selected: 'creditcard.fill' }} md={{ default: 'credit_card', selected: 'credit_card' }} />
        <NativeTabs.Trigger.Label>باي</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet', selected: 'list.bullet' }} md={{ default: 'format_list_bulleted', selected: 'format_list_bulleted' }} />
        <NativeTabs.Trigger.Label>القائمة</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md={{ default: 'home', selected: 'home' }} />
        <NativeTabs.Trigger.Label>الرئيسية</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
