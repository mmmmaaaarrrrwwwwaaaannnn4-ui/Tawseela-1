import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import * as Location from 'expo-location';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import {
  ActiveOrderCard,
  BrandStrip,
  CategoryStrip,
  DealCard,
  HeroCarousel,
  JournalTeasers,
  ModeToggle,
  OrderAgain,
  PopularGrid,
  ReserveBanner,
  StoreClosedBanner,
  TopRated,
} from '@/components/home/sections';
import { Icon } from '@/components/icons/icon';
import { AccentFill } from '@/components/ui/buttons';
import { useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import type { HomeSectionKey } from '@/data/types';
import { useStatusBar } from '@/hooks/use-status-bar';
import { initials } from '@/lib/format';
import { selectBanners, selectLiveMenu, selectMyOrders, selectUnread, useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function HomeScreen() {
  useStatusBar();
  const { c } = useTheme();
  const chrome = useChrome();
  const user = useSession((s) => s.user);
  const [currentAddress, setCurrentAddress] = useState('جارٍ تحديد موقعك…');
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const refreshCustomerLocation = async () => {
      if (!user) return;
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.status === 'undetermined') {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) { if (!cancelled) setCurrentAddress('فعّل الموقع لتحديد عنوان التوصيل'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!cancelled) {
        useApp.setState({ customerLocation: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        } });
      }
      const places = await Location.reverseGeocodeAsync({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      const place = places[0];
      const label = place ? [place.street, place.district, place.city, place.region].filter(Boolean).join('، ') : '';
      if (!cancelled) setCurrentAddress(label || 'تم تحديد موقعك الحالي');
    };
    void refreshCustomerLocation().catch(() => undefined);
    return () => { cancelled = true; };
  }, [user?.uid]));
  const unread = useApp(selectUnread);
  const secs = useApp((s) => s.secs);
  const has = useApp(
    useShallow((s) => ({
      again: selectMyOrders(s).some((o) => o.step === 3),
      deal: s.deal.on && selectLiveMenu(s).some((m) => m.id === s.deal.id),
      hero: selectBanners(s).length > 0,
      journal: s.posts.some((p) => p.on),
    })),
  );

  const SECTION: Record<HomeSectionKey, () => ReactNode> = {
    hero: () => (has.hero ? <HeroCarousel /> : null),
    reserve: () => <ReserveBanner />,
    cats: () => <CategoryStrip />,
    popular: () => <PopularGrid />,
    brands: () => <BrandStrip />,
    deal: () => (has.deal ? <DealCard /> : null),
    again: () => (has.again ? <OrderAgain /> : null),
    rated: () => <TopRated />,
    journal: () => (has.journal ? <JournalTeasers /> : null),
  };

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView contentContainerStyle={{ paddingTop: chrome.contentTop, paddingBottom: chrome.bottomPad }} showsVerticalScrollIndicator={false}>
          <Reveal i={0} style={styles.top}>
            <View style={{ gap: 5 }}>
              <Txt s={13} w={500} color={c.text3}>
                {user ? `أهلاً، ${user.name.split(' ')[0]}` : 'أهلاً بيك في توصيلة'}
              </Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="eco" size={26} fill color={c.accent} />
                <Txt s={26} w={600} ls={-0.03}>
                  Tawseela
                </Txt>
              </View>
              <PressableScale onPress={() => router.push('/addresses')} scaleTo={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="location_on" size={14} color={c.accent} />
                <Txt s={11} w={500} color={c.text3} numberOfLines={1}>{currentAddress}</Txt>
              </PressableScale>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PressableScale
                onPress={() => router.push('/inbox')}
                scaleTo={0.94}
                accessibilityLabel="الإشعارات"
                style={[styles.round, { backgroundColor: c.surface1, borderColor: c.line }]}
              >
                <Icon name="notifications" size={23} />
                {unread > 0 ? (
                  <View style={[styles.unread, { borderColor: c.surface1 }]}>
                    <AccentFill radius={8} />
                    <Txt s={9} w={700} color={c.accentInk}>
                      {unread}
                    </Txt>
                  </View>
                ) : null}
              </PressableScale>
              <PressableScale
                onPress={() => router.navigate('/profile')}
                scaleTo={0.94}
                accessibilityLabel="حسابي"
                style={[styles.round, { backgroundColor: c.surface1, borderColor: c.line }]}
              >
                {user ? (
                  <Txt s={14} w={700} color={c.accentText}>
                    {initials(user.name)}
                  </Txt>
                ) : (
                  <Icon name="person" size={23} />
                )}
              </PressableScale>
            </View>
          </Reveal>

          <Reveal i={1} style={{ marginTop: 16, marginHorizontal: 20 }}>
            <PressableScale
              onPress={() => {
                useApp.getState().setMenuCat('All');
                router.navigate({ pathname: '/menu', params: { focus: '1' } });
              }}
              scaleTo={0.98}
              style={[styles.search, { backgroundColor: c.surface1, borderColor: c.line }]}
            >
              <Icon name="search" size={22} color={c.text3} />
              <Txt s={14.5} w={500} color={c.text3} style={{ flex: 1 }} numberOfLines={1}>
                ابحث عن مطعم أو أكلة بتحبها…
              </Txt>
              <View style={styles.tune}>
                <AccentFill radius={20} />
                <Icon name="tune" size={20} color={c.accentInk} />
              </View>
            </PressableScale>
          </Reveal>

          <ModeToggle />
          <StoreClosedBanner />
          <ActiveOrderCard />

          {secs
            .filter((x) => x.on)
            .map((x) => (
              <View key={x.k}>{SECTION[x.k]()}</View>
            ))}
        </ScrollView>
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 20 },
  round: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  unread: {
    position: 'absolute',
    top: 8,
    right: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  search: { height: 52, borderRadius: 26, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6 },
  tune: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
