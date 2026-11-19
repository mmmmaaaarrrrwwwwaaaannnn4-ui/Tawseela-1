import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
import { CircleButton } from '@/components/ui/buttons';
import { Sheet } from '@/components/ui/overlays';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

export default function AddressesScreen() {
  const { c } = useTheme();
  useStatusBar();
  const addrs = useApp((s) => s.addrs);
  const selected = useApp((s) => s.addr);
  const removeAddress = useApp((s) => s.removeAddress);
  const [current, setCurrent] = useState<{ address: string; latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<'checking' | 'granted' | 'denied'>('checking');

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    const updateAddress = async (latitude: number, longitude: number) => {
      try {
        const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = rows[0];
        const address = [place?.streetNumber, place?.street, place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'موقعك الحالي';
        if (active) setCurrent({ address, latitude, longitude });
      } catch {
        if (active) setCurrent({ address: 'موقعك الحالي — جارٍ تحديد اسم الشارع', latitude, longitude });
      }
    };
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted) { setLocationPermission('denied'); return; }
        setLocationPermission('granted');
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        void updateAddress(p.coords.latitude, p.coords.longitude);
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 12000, distanceInterval: 20 },
          (next) => { void updateAddress(next.coords.latitude, next.coords.longitude); },
        );
      } catch {
        if (active) setLocationPermission('denied');
      }
    })();
    return () => { active = false; subscription?.remove(); };
  }, []);

  const addNew = () => router.push('/address-map' as never);
  const openCurrent = () => router.push({ pathname: '/address-map', params: { current: '1' } } as never);
  const home = addrs.find((a) => a.tag.toLowerCase() === 'home' || a.tag === 'المنزل');
  const homeIndex = home ? addrs.indexOf(home) : -1;
  const otherAddresses = addrs.map((a, i) => ({ a, i })).filter(({ a }) => a !== home);

  return (
    <Sheet
      visible
      onClose={() => router.back()}
      title="اختار عنوان التوصيل"
      scroll={false}
      header={
        <View style={styles.header}>
          <Txt s={22} w={700}>اختار عنوان التوصيل</Txt>
          <CircleButton icon="close" size={42} iconSize={21} variant="soft" label="إغلاق" onPress={() => router.back()} />
        </View>
      }
      footer={
        <PressableScale onPress={addNew} style={styles.add}>
          <Icon name="add" size={25} color={c.accent} />
          <Txt s={17} w={700} color={c.accent}>إضافة عنوان جديد</Txt>
        </PressableScale>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18, gap: 12 }} showsVerticalScrollIndicator={false}>
        {home ? (
          <AddressRow title="المنزل" address={home.l1 + (home.l2 ? '، ' + home.l2 : '')} icon="home" selected={selected === homeIndex} onPress={() => { useApp.getState().setCheckout({ addr: homeIndex }); router.back(); }} onDelete={() => removeAddress(homeIndex)} />
        ) : (
          <View style={[styles.emptyHome, { borderColor: c.line }]}>
            <Icon name="home" size={23} color={c.text3} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt s={16} w={700}>المنزل</Txt>
              <Txt s={13} color={c.text3}>لم يتم حفظ عنوان المنزل بعد</Txt>
            </View>
          </View>
        )}
        <AddressRow
          title="الموقع الحالي"
          address={locationPermission === 'denied' ? 'اسمح بالوصول للموقع لعرض مكانك تلقائيًا' : current?.address || 'جارٍ تحديد موقعك تلقائيًا…'}
          icon="location_on"
          selected={false}
          onPress={openCurrent}
          current
        />
        {otherAddresses.map(({ a, i }) => (
          <AddressRow key={a.latitude != null && a.longitude != null ? a.latitude + ':' + a.longitude + ':' + a.l1 : a.l1 + ':' + i} title={a.tag} address={a.l1 + (a.l2 ? '، ' + a.l2 : '')} icon="location_on" selected={selected === i} onPress={() => { useApp.getState().setCheckout({ addr: i }); router.back(); }} onDelete={() => removeAddress(i)} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function AddressRow({ title, address, icon, selected, onPress, onDelete, current = false }: { title: string; address: string; icon: 'home' | 'location_on'; selected: boolean; onPress: () => void; onDelete?: () => void; current?: boolean }) {
  const { c } = useTheme();
  const row = (
    <PressableScale onPress={onPress} style={[styles.row, { borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accentSoft : c.surface1 }]}>
      <Icon name={icon} size={25} color={selected || current ? c.accent : c.text1} fill={selected || current} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowTitle}>
          <Txt s={16} w={700}>{title}</Txt>
          {selected ? <Txt s={11} w={700} color={c.accent}>محدد</Txt> : current ? <Txt s={11} w={600} color={c.accent}>مباشر</Txt> : null}
        </View>
        <Txt s={13} color={c.text2} numberOfLines={2}>{address}</Txt>
      </View>
      {selected ? <Icon name="check_circle" size={22} color={c.accent} fill /> : <Icon name="arrow_back_ios_new" size={20} color={c.text3} />}
    </PressableScale>
  );
  if (!onDelete || current) return row;
  return (
    <Animated.View layout={LinearTransition.springify()}>
    <ReanimatedSwipeable
      friction={1.8}
      leftThreshold={64}
      renderLeftActions={() => (
        <View style={styles.deleteAction}>
          <Icon name="delete" size={23} color="#FFFFFF" />
          <Txt s={12} w={700} color="#FFFFFF">حذف</Txt>
        </View>
      )}
      onSwipeableOpen={(direction) => { if (direction === 'right') onDelete(); }}
      overshootLeft={false}
    >
      {row}
    </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 18 },
  row: { minHeight: 86, borderRadius: 17, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 13 },
  rowTitle: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  emptyHome: { minHeight: 78, borderRadius: 17, borderWidth: 1, padding: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  add: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  deleteAction: { width: 86, marginVertical: 2, borderRadius: 17, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center', gap: 5 },
});
