import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { ScrollView, StyleSheet, View } from 'react-native';

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
  const [current, setCurrent] = useState<{ title: string; address: string; latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return;
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const rows = await Location.reverseGeocodeAsync({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        const place = rows[0];
        if (!active) return;
        setCurrent({
          title: 'الموقع الحالي',
          address: [place?.streetNumber, place?.street, place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'موقعك الحالي',
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        });
        if (addrs.length === 0) {
          useApp.getState().addAddress({ tag: 'Home', custom: '', l1: [place?.streetNumber, place?.street, place?.name].filter(Boolean).join(' ') || 'موقع المنزل', apt: '', city: [place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'بلبيس، الشرقية', zip: '', note: '', door: true, phone: '', def: true, latitude: p.coords.latitude, longitude: p.coords.longitude });
        }
      } catch { /* Location is optional until the customer grants permission. */ }
    })();
    return () => { active = false; };
  }, [addrs.length]);

  const useCurrent = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        useApp.getState().showToast('إذن الموقع مطلوب', 'اسمح لتوصيلة بالوصول إلى موقعك لتحديد العنوان الحالي.', 'error');
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const rows = await Location.reverseGeocodeAsync({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      const place = rows[0];
      const address = [place?.streetNumber, place?.street, place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'موقعك الحالي';
      setCurrent({ title: 'الموقع الحالي', address, latitude: p.coords.latitude, longitude: p.coords.longitude });
      const existing = useApp.getState().addrs.findIndex((a) => a.latitude === p.coords.latitude && a.longitude === p.coords.longitude);
      if (existing >= 0) useApp.getState().setCheckout({ addr: existing });
      else {
        useApp.getState().addAddress({ tag: 'Other', custom: 'الموقع الحالي', l1: address, apt: '', city: place?.city || 'بلبيس، الشرقية', zip: '', note: '', door: true, phone: '', def: true, latitude: p.coords.latitude, longitude: p.coords.longitude });
      }
    } catch {
      useApp.getState().showToast('تعذر تحديد الموقع', 'تأكد من تفعيل خدمة الموقع وحاول مرة أخرى.', 'error');
    } finally { setLocating(false); }
  };

  const addNew = () => router.push('/address-map' as never);
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
          <AddressRow
            title="المنزل"
            address={home.l1 + (home.l2 ? '، ' + home.l2 : '')}
            icon="home"
            selected={selected === homeIndex}
            onPress={() => { useApp.getState().setCheckout({ addr: homeIndex }); router.back(); }}
          />
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
          address={locating ? 'جارٍ تحديد موقعك…' : current?.address || 'اسمح بالوصول إلى موقعك لتحديده بدقة'}
          icon="location_on"
          selected={false}
          onPress={() => { void useCurrent(); }}
        />
        {otherAddresses.map(({ a, i }) => (
          <AddressRow key={i} title={a.tag} address={a.l1 + (a.l2 ? '، ' + a.l2 : '')} icon="location_on" selected={selected === i} onPress={() => { useApp.getState().setCheckout({ addr: i }); router.back(); }} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function AddressRow({ title, address, icon, selected, onPress }: { title: string; address: string; icon: 'home' | 'location_on'; selected: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <PressableScale onPress={onPress} style={[styles.row, { borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accentSoft : c.surface1 }]}>
      <Icon name={icon} size={25} color={selected ? c.accent : c.text1} fill={selected} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.rowTitle}>
          <Txt s={16} w={700}>{title}</Txt>
          {selected ? <Txt s={11} w={700} color={c.accent}>محدد</Txt> : null}
        </View>
        <Txt s={13} color={c.text2} numberOfLines={2}>{address}</Txt>
      </View>
      {selected ? <Icon name="check_circle" size={22} color={c.accent} fill /> : <Icon name="arrow_back_ios_new" size={20} color={c.text3} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 18 },
  row: { minHeight: 86, borderRadius: 17, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 13 },
  rowTitle: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  emptyHome: { minHeight: 78, borderRadius: 17, borderWidth: 1, padding: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  add: { minHeight: 52, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
