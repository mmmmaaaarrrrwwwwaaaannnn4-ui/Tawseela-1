import { NativeTabs } from 'expo-router/native-tabs';

import { selectCartCount, useApp } from '@/store/app-store';

const TAB_GOLD = '#E50920';

/**
 * Native iOS tab navigation.
 * iOS 26+ supplies the real Liquid Glass tab bar; iOS 27+ can render the
 * account tab on its own prominent system surface.
 */
export default function TabsLayout() {
  const cartCount = useApp(selectCartCount);

  return (
    <NativeTabs
      tintColor={TAB_GOLD}
      iconColor={{ default: TAB_GOLD, selected: TAB_GOLD }}
      labelStyle={{ color: TAB_GOLD }}
      minimizeBehavior="never"
    >
      {/* Reversed order for the requested right-to-left arrangement. */}
      <NativeTabs.Trigger name="profile" prominent>
        <NativeTabs.Trigger.Label>حسابي</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="cart">
        <NativeTabs.Trigger.Label>السلة</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bag', selected: 'bag.fill' }}
          md="shopping_bag"
        />
        {cartCount > 0 ? (
          <NativeTabs.Trigger.Badge>{String(cartCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>المفضلة</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'heart', selected: 'heart.fill' }}
          md="favorite"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Label>القائمة</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'book.closed', selected: 'book.closed.fill' }}
          md="menu_book"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>الرئيسية</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          md="home"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
