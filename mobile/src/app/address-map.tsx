import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ActivityIndicator, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera as MapCamera, Map as MapLibre, Marker } from '@maplibre/maplibre-react-native';

import { Icon } from '@/components/icons/icon';
import { CircleButton } from '@/components/ui/buttons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { useApp, type NewAddress } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

type SearchHit = { id: string; name: string; detail: string; latitude: number; longitude: number };
const START = { latitude: 30.42292, longitude: 31.557884 };
const kmBetween = (a: number, b: number, c: number, d: number) => {
  const rad = (v: number) => v * Math.PI / 180;
  const x = rad(c - a), y = rad(d - b);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export default function AddressMapScreen() {
  useStatusBar();
  const { c } = useTheme();
  const nearbyBrands = useApp((s) => s.brands.filter((b) => b.on && b.lat != null && b.lng != null));
  const customerLocation = useApp((s) => s.customerLocation);
  const params = useLocalSearchParams<{ current?: string }>();
  const pinLift = useSharedValue(0);
  const pinBounce = useSharedValue(0);
  const pinMotion = useAnimatedStyle(() => ({ transform: [{ translateY: pinLift.value + pinBounce.value }] }));
  const insets = useSafeAreaInsets();
  const camera = useRef<React.ComponentRef<typeof MapCamera>>(null);
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [point, setPoint] = useState(START);
  const [current, setCurrent] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressText, setAddressText] = useState('بلبيس، الشرقية، مصر');
  const [zoom, setZoom] = useState(14);
  const [outside, setOutside] = useState(false);
  const [addressVerified, setAddressVerified] = useState(false);
  const [far, setFar] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NewAddress>({
    tag: 'Home', custom: '', l1: '', apt: '', city: 'بلبيس، الشرقية', zip: '', note: '', door: true, phone: '', def: true,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return;
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        setCurrent({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        useApp.setState({ customerLocation: { latitude: p.coords.latitude, longitude: p.coords.longitude } });
        setPoint({ latitude: p.coords.latitude, longitude: p.coords.longitude });
        camera.current?.fly({ center: [p.coords.longitude, p.coords.latitude], zoom: 16, duration: 700 });
        if (params.current === '1') {
          try {
            const rows = await Location.reverseGeocodeAsync({ latitude: p.coords.latitude, longitude: p.coords.longitude });
            const place = rows[0];
            const street = [place?.streetNumber, place?.street, place?.name].filter(Boolean).join(' ') || 'الموقع الحالي';
            const region = [place?.district, place?.city, place?.subregion, place?.region].filter(Boolean).join(' ');
            const inBilbeis = /بلبيس/.test(region);
            setAddressText([street, place?.district, place?.city, place?.region].filter(Boolean).join('، '));
            setAddressVerified(true);
            setOutside(!inBilbeis);
            setForm((f) => ({ ...f, l1: street, city: [place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'بلبيس، الشرقية', latitude: p.coords.latitude, longitude: p.coords.longitude }));
            if (inBilbeis) setDetailsOpen(true);
            else useApp.getState().showToast('الموقع خارج نطاق التوصيل', 'توصيلة متاحة حاليًا داخل بلبيس والمناطق المغطاة فقط.', 'error');
          } catch {
            setAddressVerified(false);
            setOutside(true);
            setAddressText('تعذر التحقق من موقعك الحالي. حاول تحديده مرة أخرى.');
            useApp.getState().showToast('تعذر التحقق من الموقع', 'لم نتمكن من تأكيد أن موقعك داخل نطاق التوصيل.', 'error');
          }
        }
      } catch { /* Map selection remains available without GPS. */ }
    })();
    return () => { active = false; };
  }, [params.current]);

  const refreshPoint = async (latitude: number, longitude: number, nextZoom = zoom) => {
    setPoint({ latitude, longitude });
    setAddressVerified(false);
    setZoom(nextZoom);
    camera.current?.flyTo({ center: [longitude, latitude], zoom: nextZoom, duration: 450 });
    try {
      const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
      const p = rows[0];
      const city = [p?.district, p?.city, p?.region].filter(Boolean).join('، ');
      setAddressText([p?.streetNumber, p?.street, city].filter(Boolean).join('، ') || 'الموقع المحدد');
      const bilbeis = /بلبيس/.test([p?.city, p?.district, p?.subregion, p?.region].filter(Boolean).join(' '));
      setOutside(!bilbeis);
      setAddressVerified(true);
    } catch { setAddressText('تعذر قراءة العنوان — حرّك الدبوس إلى شارع واضح'); setOutside(true); setAddressVerified(false); }
  };

  useEffect(() => {
    if (!query.trim()) { setHits([]); setSearching(false); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=eg&q=' + encodeURIComponent(query + ', بلبيس، الشرقية، مصر');
        const response = await fetch(url, { headers: { 'Accept-Language': 'ar' } });
        const data = await response.json() as { place_id: number; display_name: string; lat: string; lon: string; name?: string }[];
        if (!active) return;
        setHits(data.map((x) => ({ id: String(x.place_id), name: x.name || x.display_name.split(',')[0], detail: x.display_name, latitude: Number(x.lat), longitude: Number(x.lon) })).filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude)));
      } catch { if (active) setHits([]); }
      finally { if (active) setSearching(false); }
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    setFar(!!current && kmBetween(current.latitude, current.longitude, point.latitude, point.longitude) > 5);
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    setAddressVerified(false);
    reverseTimer.current = setTimeout(async () => {
      try {
        const rows = await Location.reverseGeocodeAsync(point);
        const p = rows[0];
        if (!p) { setOutside(true); setAddressVerified(false); setAddressText('تعذر العثور على عنوان لهذه النقطة'); return; }
        const city = [p.city, p.district, p.subregion, p.region].filter(Boolean).join(' ');
        setOutside(!/بلبيس/.test(city));
        setAddressVerified(true);
        setAddressText([p.streetNumber, p.street, p.district, p.city, p.region].filter(Boolean).join('، ') || 'الموقع المحدد');
      } catch { setAddressVerified(false); setOutside(true); setAddressText('تعذر التحقق من العنوان. حرّك الخريطة إلى شارع واضح وحاول مرة أخرى.'); }
    }, 500);
    return () => { if (reverseTimer.current) clearTimeout(reverseTimer.current); };
  }, [current, point.latitude, point.longitude]);

  const warning = zoom < 13
    ? 'قرّب الخريطة أكثر حتى يظهر الشارع ويمكن تحديد نقطة التسليم بدقة'
    : !addressVerified
      ? 'جارٍ التحقق من العنوان ونطاق التوصيل…'
      : outside
        ? 'تعذر التحقق من العنوان أو أن الموقع خارج نطاق التوصيل في بلبيس'
        : far
          ? 'الموقع يبعد أكثر من 5 كم عن موقعك الحالي. اختر نقطة أقرب أو تأكد من العنوان'
          : null;
  const canConfirm = zoom >= 13 && addressVerified && !outside && !far;
  const sortedBrands = [...nearbyBrands].sort((a, b) => {
    if (!customerLocation) return 0;
    const da = kmBetween(customerLocation.latitude, customerLocation.longitude, a.lat!, a.lng!);
    const db = kmBetween(customerLocation.latitude, customerLocation.longitude, b.lat!, b.lng!);
    return da - db;
  });
  const update = (p: Partial<NewAddress>) => setForm((f) => ({ ...f, ...p }));
  const chooseHit = (hit: SearchHit) => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setQuery('');
    void refreshPoint(hit.latitude, hit.longitude, 16);
  };
  const confirmPoint = async () => {
    if (!canConfirm) return;
    try {
      const rows = await Location.reverseGeocodeAsync(point);
      const p = rows[0];
      update({
        latitude: point.latitude, longitude: point.longitude,
        l1: [p?.streetNumber, p?.street, p?.name].filter(Boolean).join(' ') || addressText,
        city: [p?.district, p?.city, p?.region].filter(Boolean).join('، ') || 'بلبيس، الشرقية',
      });
    } catch { update({ latitude: point.latitude, longitude: point.longitude, l1: addressText }); }
    setDetailsOpen(true);
  };
  const saveAddress = () => {
    if (!form.l1.trim() || !form.phone.trim() || !form.apt.trim()) {
      useApp.getState().showToast('راجع بيانات العنوان', 'اكتب الشارع ورقم الشقة ورقم الهاتف قبل الحفظ.', 'error');
      return;
    }
    setSaving(true);
    const miss = useApp.getState().addAddress({ ...form, latitude: point.latitude, longitude: point.longitude, def: true });
    setSaving(false);
    if (!miss) { setDetailsOpen(false); router.replace('/addresses' as never); }
  };
  const locateMe = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { useApp.getState().showToast('إذن الموقع مطلوب', 'اسمح بالوصول إلى موقعك لتحديد مكانك الحالي.', 'error'); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCurrent({ latitude: p.coords.latitude, longitude: p.coords.longitude });
      useApp.setState({ customerLocation: { latitude: p.coords.latitude, longitude: p.coords.longitude } });
      await refreshPoint(p.coords.latitude, p.coords.longitude, 17);
    } catch { useApp.getState().showToast('تعذر تحديد الموقع', 'حاول مرة أخرى أو حرّك الخريطة يدويًا.', 'error'); }
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <PressableScale onPress={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 250); }} style={[styles.round, { borderColor: c.line }]}>
          <Icon name="search" size={23} color={c.text1} />
        </PressableScale>
        <Txt s={20} w={700}>عنوان التوصيل</Txt>
        <CircleButton icon="close" size={42} iconSize={21} variant="soft" label="إغلاق" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/addresses' as never); }} />
      </View>
      <View style={styles.mapArea}>
        <MapLibre
          mapStyle="https://tiles.openfreemap.org/styles/bright"
          attribution logo compass
          compassPosition={{ top: 16, left: 14 }}
          onRegionIsChanging={() => { pinLift.set(withSpring(-15, { damping: 15, stiffness: 190 })); }}
          onRegionDidChange={(e) => {
            const center = e.nativeEvent.center;
            if (Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
              setPoint({ latitude: center[1], longitude: center[0] });
              pinLift.set(withSpring(0, { damping: 10, stiffness: 220 }));
              pinBounce.set(withSequence(withTiming(-5, { duration: 90 }), withTiming(0, { duration: 130 }), withTiming(-3, { duration: 80 }), withSpring(0)));
              if (typeof e.nativeEvent.zoom === 'number') setZoom(e.nativeEvent.zoom);
            }
          }}
          style={StyleSheet.absoluteFill}
        >
          <MapCamera ref={camera} initialViewState={{ center: [point.longitude, point.latitude], zoom: 14, pitch: 0, bearing: 0 }} />
          {sortedBrands.map((brand) => {
            const distance = customerLocation ? kmBetween(customerLocation.latitude, customerLocation.longitude, brand.lat!, brand.lng!) : null;
            return (
              <Marker key={brand.id} lngLat={[brand.lng!, brand.lat!]} anchor="bottom">
                <PressableScale
                  onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: brand.id } } as never)}
                  style={styles.restaurantMarker}
                  accessibilityLabel={`فتح ${brand.name}`}
                >
                  <View style={[styles.restaurantPhoto, { borderColor: c.accent }]}>
                    <Image source={{ uri: brand.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  </View>
                  {distance != null ? <View style={styles.distancePill}><Txt s={9} w={700} color="#FFFFFF">{distance < 1 ? `${Math.round(distance * 1000)} م` : `${distance.toFixed(1)} كم`}</Txt></View> : null}
                </PressableScale>
              </Marker>
            );
          })}
        </MapLibre>
        <Animated.View pointerEvents="none" style={[styles.pinWrap, pinMotion]}>
          <View style={[styles.pin, { backgroundColor: c.accent }]}><View style={styles.pinDot} /></View>
          <View style={styles.pinShadow} />
        </Animated.View>
        {warning ? <View pointerEvents="none" style={styles.warning}><Icon name="info" size={18} color="#FFFFFF" /><Txt s={13} w={600} color="#FFFFFF" align="center" style={{ flex: 1 }}>{warning}</Txt></View> : null}
        <PressableScale onPress={() => { void locateMe(); }} style={[styles.locate, { backgroundColor: '#FFFFFF' }]}>
          <Icon name="my_location" size={22} color="#202020" />
        </PressableScale>
      </View>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8, backgroundColor: c.bg }]}>
        <View style={styles.addressLine}>
          <Icon name="location_on" size={24} color={c.text1} />
          <View style={{ flex: 1, gap: 3 }}>
            <Txt s={17} w={700}>{addressText.split('،').slice(-1)[0] || 'الموقع المحدد'}</Txt>
            <Txt s={14} color={c.text2} align="right">{addressText}</Txt>
          </View>
        </View>
        <PressableScale disabled={!canConfirm} onPress={() => { void confirmPoint(); }} style={[styles.confirm, { backgroundColor: canConfirm ? c.accent : '#F0F0F0' }]}>
          <Txt s={17} w={700} color={canConfirm ? '#FFFFFF' : '#A6A6A6'}>تأكيد العنوان</Txt>
        </PressableScale>
      </View>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <View style={[styles.searchPage, { paddingTop: insets.top + 10, backgroundColor: c.bg }]}>
          <View style={styles.searchHeader}>
            <CircleButton icon="close" size={40} iconSize={19} variant="soft" label="إغلاق البحث" onPress={() => setSearchOpen(false)} />
            <View style={[styles.searchBar, { backgroundColor: c.surface2, borderColor: c.line }]}>
              <TextInput ref={(instance) => { if (instance) searchRef.current = instance; }} value={query} onChangeText={setQuery} placeholder="ابحث عن شارع أو مكان في بلبيس" placeholderTextColor={c.text3} style={[styles.searchInput, { color: c.text1, textAlign: "right" }]} returnKeyType="search" />
              <Icon name="search" size={19} color={c.text3} />
              {query ? <Pressable onPress={() => setQuery('')}><Icon name="close" size={17} color={c.text2} /></Pressable> : null}
            </View>
          </View>
          {searching ? <ActivityIndicator style={{ marginTop: 24 }} color={c.accent} /> : null}
          <ScrollView style={styles.searchResults} keyboardShouldPersistTaps="handled">
            {hits.map((hit) => (
              <Pressable key={hit.id} onPress={() => chooseHit(hit)} style={[styles.result, { borderBottomColor: c.line }]}>
                <Icon name="search" size={22} color={c.text1} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt s={16} w={600} align="right">{hit.name}</Txt>
                  <Txt s={13} color={c.text3} align="right" numberOfLines={2}>{hit.detail}</Txt>
                </View>
              </Pressable>
            ))}
            {!searching && query.trim() && hits.length === 0 ? <Txt s={14} color={c.text3} align="center" style={{ marginTop: 30 }}>لا توجد نتائج. جرّب كتابة اسم شارع أو مكان آخر.</Txt> : null}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={detailsOpen} animationType="slide" onRequestClose={() => setDetailsOpen(false)}>
        <ScrollView style={[styles.formPage, { backgroundColor: c.bg }]} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 26, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={styles.formHeader}>
            <CircleButton icon="chevron_right" size={42} iconSize={22} variant="soft" label="رجوع" onPress={() => setDetailsOpen(false)} />
            <Txt s={22} w={700}>عنوان جديد</Txt>
          </View>
          <View style={styles.miniMap}>
            <MapLibre mapStyle="https://tiles.openfreemap.org/styles/bright" attribution logo style={StyleSheet.absoluteFill}>
              <MapCamera initialViewState={{ center: [point.longitude, point.latitude], zoom: 16, pitch: 0, bearing: 0 }} />
            </MapLibre>
            <View pointerEvents="none" style={styles.miniPin}><Icon name="location_on" size={35} fill color="#E53935" /></View>
          </View>
          <View style={[styles.region, { borderColor: c.line }]}>
            <View style={{ flex: 1, gap: 3 }}>
              <Txt s={15} w={700}>المنطقة</Txt>
              <Txt s={14} color={c.text2}>{form.city}</Txt>
            </View>
            <Txt s={14} color={c.accent}>تعديل</Txt>
          </View>
          <View style={styles.tags}>
            {(['Home', 'Work', 'Other'] as const).map((tag) => <PressableScale key={tag} onPress={() => update({ tag })} style={[styles.tag, { backgroundColor: form.tag === tag ? '#202020' : c.bg, borderColor: c.line }]}><Txt s={14} w={600} color={form.tag === tag ? '#FFFFFF' : c.text1}>{tag === 'Home' ? 'منزل' : tag === 'Work' ? 'عمل' : 'أخرى'}</Txt></PressableScale>)}
          </View>
          <FormField label="اسم المبنى" value={form.l1} onChange={(l1) => update({ l1 })} placeholder="اسم المبنى أو الشارع" />
          <View style={styles.twoFields}>
            <View style={{ flex: 1 }}><FormField label="رقم الشقة" value={form.apt} onChange={(apt) => update({ apt })} placeholder="رقم الشقة" /></View>
            <View style={{ flex: 1 }}><FormField label="الدور (اختياري)" value={form.zip} onChange={(zip) => update({ zip })} placeholder="الدور" /></View>
          </View>
          <FormField label="الشارع" value={form.city} onChange={(city) => update({ city })} placeholder="اسم الشارع" />
          <FormField label="رقم الهاتف الجوال" value={form.phone} onChange={(phone) => update({ phone })} placeholder="+20 رقم الهاتف" keyboardType="phone-pad" />
          <FormField label="علامة مميزة (اختياري)" value={form.note} onChange={(note) => update({ note })} placeholder="علامة مميزة" />
          <FormField label="تسمية العنوان (اختياري)" value={form.custom} onChange={(custom) => update({ custom })} placeholder="مثلاً: منزل العائلة" />
          <PressableScale disabled={saving} onPress={saveAddress} style={[styles.confirm, { backgroundColor: c.accent }]}><Txt s={17} w={700} color="#FFFFFF">{saving ? 'جارٍ الحفظ…' : 'حفظ العنوان'}</Txt></PressableScale>
        </ScrollView>
      </Modal>
    </View>
  );
}

function FormField({ label, value, onChange, placeholder, keyboardType }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' }) {
  const { c } = useTheme();
  return <View style={{ gap: 7 }}><Txt s={14} w={600} align="right">{label}</Txt><TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.text3} keyboardType={keyboardType} style={[styles.input, { color: c.text1, borderColor: c.line, backgroundColor: c.surface1, textAlign: "right" }]} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { minHeight: 68, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  mapArea: { flex: 1, overflow: 'hidden', backgroundColor: '#E8EFE8' },
  pinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -42, alignItems: 'center' },
  pin: { width: 42, height: 42, borderRadius: 24, borderBottomLeftRadius: 5, transform: [{ rotate: '-45deg' }], alignItems: 'center', justifyContent: 'center', elevation: 8 },
  pinDot: { width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }] },
  pinShadow: { width: 13, height: 6, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: 2 },
  warning: { position: 'absolute', zIndex: 8, bottom: 82, left: 16, right: 16, minHeight: 48, backgroundColor: '#202020', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, elevation: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 9 },
  restaurantMarker: { alignItems: 'center', justifyContent: 'center', minWidth: 54, minHeight: 58 },
  restaurantPhoto: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, backgroundColor: '#FFFFFF', overflow: 'hidden', elevation: 5 },
  distancePill: { marginTop: -7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#202020', borderWidth: 1, borderColor: '#FFFFFF' },
  locate: { position: 'absolute', bottom: 20, left: 18, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  bottom: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },
  addressLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  confirm: { height: 62, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  searchPage: { flex: 1, paddingHorizontal: 20 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  searchResults: { flex: 1, width: '100%' },
  searchBar: { height: 40, flex: 1, borderWidth: 1, borderRadius: 22, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, minHeight: 38, fontSize: 14, paddingVertical: 0 },
  result: { minHeight: 82, borderBottomWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 12, width: '100%' },
  formPage: { flex: 1 },
  formHeader: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  miniMap: { height: 180, overflow: 'hidden', borderRadius: 4 },
  miniPin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -18, marginTop: -34 },
  region: { minHeight: 82, borderWidth: 1.5, borderRadius: 18, padding: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  tags: { flexDirection: 'row-reverse', justifyContent: 'flex-start', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 17, paddingVertical: 10 },
  twoFields: { flexDirection: 'row-reverse', gap: 12 },
  input: { minHeight: 60, borderWidth: 1.5, borderRadius: 17, paddingHorizontal: 16, fontSize: 15 },
});
