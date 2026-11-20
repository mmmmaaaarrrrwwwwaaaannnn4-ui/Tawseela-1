import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useShallow } from 'zustand/react/shallow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera as MapCamera, Map as MapLibre, Marker } from '@maplibre/maplibre-react-native';

import { Icon } from '@/components/icons/icon';
import { CircleButton } from '@/components/ui/buttons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/overlays';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { SERVICE_AREA, distanceKm, isOutsideServiceArea } from '@/lib/service-area';
import { useApp, type NewAddress } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

// أيقونات PNG بصيغة base64 (أسود على شفاف) وبتتلوّن بـ tintColor
const PIN_PNG = 'data:image/png;base64,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';
const NAV_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFMElEQVR42u2dX6gVRRzHP+fco5mUpSEkZRCEFfogRi9CQSAEERgR9RTSQz0EUWAQEdKDKIEvYiGUZvTnIYooqSAo6vYQRAVBZFBBUURSohRicbv37PawM5xx2HvcObuzOzP7+8Jwj3u9F3d+v9/3+53f7I4gEAgEAoFAIBAIBIJZMaeGoEUM1KQPrGsCzxgCI+vabcBd6vNIpshftg+Na2uAXcAnQA6cMmhIKqHBibcz+kZgP/CrmvgcGKsxD+xQPzeU6atHM6aojoA7gHeABWPil9TIja/3GsIsqCmqG4DdwDfGpOfAIpBZFZADJ9TPD4SG6onqduAIcNqa5CVr4s2A5MCjIsT1RXW+ZHLHJZOuhw7IX8B6EeFmRDWbku3LZf8Lkv3NimrVMVaBuknEtzlRrTp0lcwbgZZsb0BUXQKQA/f1nX6aFFUX6smBX4CL+2o9fYhq1aHF9+k+Zr9PUa0yMjX+Aa7pC/+3Iaqu2f9mH5xPm6Lqyv+3GokhotrS0JT2dYrC26WougbgoZTEt2tRdRFfvfmyJva+T0ii6iq+B2PO/hBF1cV6LgI3xGY9QxZV177PBzFNfgyi6iq+dy5zXyKqLfj+H4GVodrPGEXVVXwfD1F8YxVVV+t5FrgyFP5PQVRds//FEPo+KYmqK//f3HXfJyVRdbWen4VCPamIqqv1vL8r8dV26yLgEHAmAVF1pZ7fgNVdWU8d8T0Jiaqr+O7zlf0uv/B6Js+/rCB95ErzFoCj6lrmw79XxX8li6yUMVb3+j7ws7r3TgPQN+i5Oewz6VwCsMLg/dSRqbk5QfH2ixf6cQ3ASWPlu+TrHxQQ/+vsz9R9d5Z42npdTvEIxmLiNlTfyxlgrTEHwWAzsBf4PrF+j209nwuh72NXgklZq4CdwFvAuUSqQm85jlWiBWlUylrP1wJPUDwnYy/jY6oKnTgfxeASdVdwzgrODuCYtQ+QRdIr0n2fnV31fZqsig3AI6qLmJd0S0MLhq7Unwh4y3GWqoBid+wQ8HvAwq3F98nYsn9aMEZWFq0DHgA+tCa+66rQ4nsOuCrFLsGwpCq2As+oku+6KnT2vxKa9fRFUWZ2rQbupthZ+7dkQdQm/28n0UfNqwr3JuAp1YNpKwia+j7va4OyrCpGwJdMNvbbsJ67UhHfulWxSn1+0OJnn9RzErgkxL5Pl82/K4C/PVORDu4Byf7zoUXwJWMV7ct6LgDX9ZX/LxSAWyyq8JH976ZuPevQ0Bzwracg6N93e5+spws0H+/2IMbm6VZD5HSrZR0RwEaKt9GzBsVYTrdy1IK3GxRjc8txXdfWM3TV19RwrEGaGKuvb6ggdLrhHosYr6R4OKoJMdZUtlXE102M9zcgxrrv86n4fnea3MRkWzOjXt/nHhHf2YLwcY0GXZCnWw0jCsCA4qW/WSdNP8l3lGLfQcTXUYwBLgX+xL1BZ55udXVIyRdLBeSKr88Cr1t2sqr1HADHKd528fKoeV8WZdtmqADzdCvEetav2C8sV1PF+XxFgGf6DyMNwMsGNVWhL4Dn1Wfx/g2I8XqKk8ovREX6e38AlxFg1zO2bNAvzp0C3qsgxvp7r1Fsb4r1bEiMBxT/a9G03lDUp1uFTkNaTL+bEgQtvkGfbhVjRuSGj3/VWuWW4Vlkx8tb4mxUbYVFJi+DjI0//8DkAWEJgKeF2fEpLugx9XeC7XrG3I7NVVY/TPEW/xbjuj7Z8LCqlrHka3trBEEHEz83xa5K1nRwL7LYEggEAoFAIBAIlsf/yPnnLsxSC80AAAAASUVORK5CYII=';

type SearchHit = { id: string; name: string; detail: string; latitude: number; longitude: number };

// مركز مدينة بلبيس (المنطقة معرّفة في lib/service-area.ts)
const START = { latitude: SERVICE_AREA.latitude, longitude: SERVICE_AREA.longitude };
const MIN_ZOOM = 16;

const ZOOM_MSG = 'يرجى تكبير الخريطة أكثر لتحديد موقع التوصيل بدقة أكبر';
const OUTSIDE_MSG = 'هذا العنوان خارج نطاق التوصيل الحالي في بلبيس. يمكنك حفظه وسننبّهك عند الطلب.';

// نفس أنواع العناوين في address-sheet.tsx (شقة / فيلا / مكتب)
const TAGS = [
  { tag: 'Home', label: 'شقة', aptLabel: 'رقم الشقة' },
  { tag: 'Other', label: 'فيلا', aptLabel: 'رقم الفيلا (اختياري)' },
  { tag: 'Work', label: 'مكتب', aptLabel: 'رقم المكتب (اختياري)' },
] as const;

export default function AddressMapScreen() {
  useStatusBar();
  const { c } = useTheme();
  const user = useSession((s) => s.user);
  const nearbyBrands = useApp(useShallow((s) => s.brands.filter((b) => b.on && b.lat != null && b.lng != null)));
  const params = useLocalSearchParams<{ current?: string; latitude?: string; longitude?: string }>();
  const hasInitialPoint = Number.isFinite(Number(params.latitude)) && Number.isFinite(Number(params.longitude)) && params.latitude != null && params.longitude != null;
  const initialPoint = hasInitialPoint ? { latitude: Number(params.latitude), longitude: Number(params.longitude) } : START;
  const initialZoom = hasInitialPoint ? 16 : 14;

  const pinLift = useSharedValue(0);
  const pinBounce = useSharedValue(0);
  const pinMotion = useAnimatedStyle(() => ({ transform: [{ translateY: pinLift.value + pinBounce.value }] }));
  const moving = useRef(false);
  const insets = useSafeAreaInsets();
  const camera = useRef<React.ComponentRef<typeof MapCamera>>(null);
  const searchRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [point, setPoint] = useState(initialPoint);
  const [addressText, setAddressText] = useState('بلبيس، الشرقية، مصر');
  const [zoom, setZoom] = useState(initialZoom);
  const [outside, setOutside] = useState(false);
  const [geo, setGeo] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [picked, setPicked] = useState<{ street: string; city: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [floor, setFloor] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ l1?: string; apt?: string; phone?: string }>({});
  const [form, setForm] = useState<NewAddress>({
    tag: 'Home', custom: '', l1: '', apt: '', city: 'بلبيس، الشرقية', zip: '', note: '', door: true, phone: '', def: true,
  });

  // ───────── الموقع الحالي (GPS) ─────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted) {
          if (params.current === '1') useApp.getState().showToast('إذن الموقع مطلوب', 'اسمح بالوصول إلى موقعك لتحديد مكانك الحالي.', 'error');
          return;
        }
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        const here = { latitude: p.coords.latitude, longitude: p.coords.longitude };
        useApp.setState({ customerLocation: here });

        // لو مفيش نقطة جاية من شاشة تانية، الدبوس يروح لمكان العميل (ويشمل مسار "الموقع الحالي")
        if (!hasInitialPoint) {
          setPoint(here);
          camera.current?.flyTo({ center: [here.longitude, here.latitude], zoom: 16, duration: 700 });
        }

        if (params.current === '1') {
          try {
            const rows = await Location.reverseGeocodeAsync(here);
            if (!active) return;
            const place = rows[0];
            const street = [place?.streetNumber, place?.street, place?.name].filter(Boolean).join(' ') || 'الموقع الحالي';
            const city = [place?.district, place?.city, place?.region].filter(Boolean).join('، ') || 'بلبيس، الشرقية';
            setAddressText([street, place?.district, place?.city, place?.region].filter(Boolean).join('، '));
            setForm((f) => ({ ...f, l1: street, city, latitude: here.latitude, longitude: here.longitude }));
            // حفظ العنوان مستقل عن نطاق التوصيل، والتغطية بتتراجع عند الطلب.
            setDetailsOpen(true);
          } catch {
            setAddressText('تعذر التحقق من موقعك الحالي. حاول تحديده مرة أخرى.');
            useApp.getState().showToast('تعذر التحقق من الموقع', 'لم نتمكن من قراءة عنوان موقعك الحالي.', 'error');
          }
        }
      } catch { /* اختيار الموقع من الخريطة يفضل متاح من غير GPS */ }
    })();
    return () => { active = false; };
  }, [params.current, hasInitialPoint]);

  const refreshPoint = (latitude: number, longitude: number, nextZoom = zoom) => {
    setPoint({ latitude, longitude });
    setZoom(nextZoom);
    camera.current?.flyTo({ center: [longitude, latitude], zoom: nextZoom, duration: 450 });
    // قراءة العنوان بتتم في الـ effect اللي تحت (مرة واحدة بدل مرتين)
  };

  // ───────── قراءة العنوان للنقطة المختارة ─────────
  useEffect(() => {
    let active = true;
    setOutside(isOutsideServiceArea(point.latitude, point.longitude));
    setGeo('loading');
    const timer = setTimeout(async () => {
      try {
        const rows = await Location.reverseGeocodeAsync({ latitude: point.latitude, longitude: point.longitude });
        if (!active) return;
        const p = rows[0];
        if (!p) { setPicked(null); setGeo('failed'); return; }
        setPicked({
          street: [p.streetNumber, p.street, p.name].filter(Boolean).join(' '),
          city: [p.district, p.city, p.region].filter(Boolean).join('، '),
        });
        setAddressText([p.streetNumber, p.street, p.district, p.city, p.region].filter(Boolean).join('، ') || 'الموقع المحدد');
        setGeo('ok');
      } catch {
        if (!active) return;
        setPicked(null);
        setGeo('failed');
      }
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [point.latitude, point.longitude]);

  // ───────── البحث ─────────
  useEffect(() => {
    if (!query.trim()) { setHits([]); setSearching(false); return; }
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=eg&q=' + encodeURIComponent(query + ', بلبيس، الشرقية، مصر');
        const response = await fetch(url, { headers: { 'Accept-Language': 'ar' }, signal: controller.signal });
        const data = await response.json() as { place_id: number; display_name: string; lat: string; lon: string; name?: string }[];
        if (!active) return;
        setHits(data.map((x) => ({ id: String(x.place_id), name: x.name || x.display_name.split(',')[0], detail: x.display_name, latitude: Number(x.lat), longitude: Number(x.lon) })).filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude)));
      } catch { if (active) setHits([]); }
      finally { if (active) setSearching(false); }
    }, 450);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [query]);

  const settled = geo !== 'loading';
  const warning = zoom < MIN_ZOOM ? ZOOM_MSG : outside && settled ? OUTSIDE_MSG : null;
  // التغطية مش شرط لاختيار الموقع. الدقة وانتهاء قراءة العنوان بس هم اللي بيفعّلوا التأكيد
  // (ولو القراءة فشلت يقدر العميل يكمل ويكتب العنوان بإيده في الفورم).
  const canConfirm = zoom >= MIN_ZOOM && settled;
  const showAddress = zoom >= MIN_ZOOM;
  const addressParts = addressText.split('،').map((s) => s.trim()).filter(Boolean);
  const addressTitle = geo === 'ok' ? (addressParts[0] || 'الموقع المحدد') : geo === 'failed' ? 'تعذر قراءة العنوان' : 'جارٍ تحديد العنوان…';
  const addressRest = geo === 'ok' ? addressParts.slice(1).join('، ') : geo === 'failed' ? 'يمكنك المتابعة وكتابة العنوان يدويًا' : '';

  // المسافة على علامات المطاعم بتتحسب من دبوس التوصيل مش من GPS، والأبعد يترسم الأول عشان الأقرب يبقى فوق
  const brandPins = nearbyBrands
    .map((brand) => ({ brand, distance: distanceKm(point.latitude, point.longitude, brand.lat!, brand.lng!) }))
    .sort((a, b) => b.distance - a.distance);
  const activeTag = TAGS.find((t) => t.tag === form.tag) ?? TAGS[0];
  const update = (p: Partial<NewAddress>) => setForm((f) => ({ ...f, ...p }));
  const chooseHit = (hit: SearchHit) => {
    Keyboard.dismiss();
    setSearchOpen(false);
    setQuery('');
    refreshPoint(hit.latitude, hit.longitude, 16);
  };
  const closeScreen = () => { if (router.canGoBack()) router.back(); else router.replace('/addresses' as never); };

  const confirmPoint = () => {
    if (!canConfirm) return;
    update({
      latitude: point.latitude,
      longitude: point.longitude,
      l1: picked?.street || '',
      city: picked?.city || 'بلبيس، الشرقية',
    });
    setDetailsOpen(true);
  };
  const saveAddress = async () => {
    if (saving) return;
    Keyboard.dismiss();
    const errors = {
      ...(!form.l1.trim() ? { l1: 'اكتب اسم الشارع أو المبنى' } : {}),
      ...(form.tag === 'Home' && !form.apt.trim() ? { apt: 'اكتب رقم الشقة' } : {}),
      ...(!/^\+?[0-9\s()-]{8,16}$/.test(form.phone.trim()) ? { phone: 'اكتب رقم هاتف صحيحًا' } : {}),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    // نسيب حالة التحميل تترسم قبل الحفظ المحلي
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    // الدور بيتضاف على رقم الشقة (مش على المنطقة)، والتسمية الافتراضية هي نوع العنوان
    const apt = [form.apt.trim(), floor.trim() ? `الدور ${floor.trim()}` : ''].filter(Boolean).join('، ');
    const miss = useApp.getState().addAddress({
      ...form,
      apt,
      zip: '',
      custom: form.custom.trim() || activeTag.label,
      latitude: point.latitude,
      longitude: point.longitude,
      def: true,
    });
    setSaving(false);
    if (!miss) {
      setDetailsOpen(false);
      closeScreen();
    }
  };
  const locateMe = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { useApp.getState().showToast('إذن الموقع مطلوب', 'اسمح بالوصول إلى موقعك لتحديد مكانك الحالي.', 'error'); return; }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const here = { latitude: p.coords.latitude, longitude: p.coords.longitude };
      useApp.setState({ customerLocation: here });
      refreshPoint(here.latitude, here.longitude, 17);
    } catch { useApp.getState().showToast('تعذر تحديد الموقع', 'حاول مرة أخرى أو حرّك الخريطة يدويًا.', 'error'); }
  };

  return (
    <View pointerEvents="box-none" style={styles.routeOverlay}>
      <View style={[styles.screen, { backgroundColor: c.bg }]}>
        {/* ───────── الشريط العلوي: إغلاق | العنوان | بحث ───────── */}
        <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
          <PressableScale onPress={closeScreen} style={[styles.round, { borderColor: c.line }]} accessibilityLabel="إغلاق">
            <Icon name="close" size={21} color={c.text1} />
          </PressableScale>
          <Txt s={22} w={700} align="right" style={{ flex: 1 }}>عنوان التوصيل</Txt>
          <PressableScale onPress={() => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 250); }} style={[styles.round, { borderColor: c.line }]} accessibilityLabel="بحث">
            <Icon name="search" size={21} color={c.text1} />
          </PressableScale>
        </View>

        {/* ───────── الخريطة ───────── */}
        <View style={styles.mapArea}>
          <MapLibre
            mapStyle="https://tiles.openfreemap.org/styles/bright"
            attribution
            attributionPosition={{ bottom: 8, right: 8 }}
            logo={false}
            compass={false}
            onRegionIsChanging={() => {
              if (moving.current) return;
              moving.current = true;
              pinLift.set(withSpring(-15, { damping: 15, stiffness: 190 }));
            }}
            onRegionDidChange={(e) => {
              moving.current = false;
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
            <MapCamera ref={camera} initialViewState={{ center: [initialPoint.longitude, initialPoint.latitude], zoom: initialZoom, pitch: 0, bearing: 0 }} />
            {brandPins.map(({ brand, distance }) => {
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
                    <View style={styles.distancePill}><Txt s={9} w={700} color="#FFFFFF">{distance < 1 ? `${Math.round(distance * 1000)} م` : `${distance.toFixed(1)} كم`}</Txt></View>
                  </PressableScale>
                </Marker>
              );
            })}
          </MapLibre>

          {/* الدبوس: طرفه السفلي بالظبط على مركز الخريطة */}
          <View pointerEvents="none" style={styles.pinWrap}>
            <View style={styles.pinShadow} />
            <Animated.View style={[styles.pinBody, pinMotion]}>
              <Image source={{ uri: PIN_PNG }} tintColor={c.accent} contentFit="contain" style={styles.pinImg} />
              <View style={styles.pinDot} />
            </Animated.View>
          </View>

          {/* التنبيه فوق الدبوس مباشرة */}
          {warning ? (
            <View pointerEvents="none" style={[styles.warning, { backgroundColor: c.text1 }]}>
              <Txt s={15} w={500} color={c.bg} align="center">{warning}</Txt>
            </View>
          ) : null}

          {/* زر موقعي أسفل يسار الخريطة */}
          <PressableScale onPress={() => { void locateMe(); }} style={styles.locateBtn} accessibilityLabel="تحديد موقعي الحالي">
            <Image source={{ uri: NAV_PNG }} tintColor="#202020" contentFit="contain" style={{ width: 22, height: 22 }} />
          </PressableScale>
        </View>

        {/* ───────── الأسفل: العنوان (عند التقريب) + زر التأكيد ───────── */}
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 12, backgroundColor: c.bg }]}>
          {showAddress ? (
            <View style={styles.addressLine}>
              <Icon name="location_on" size={24} color={c.text1} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt s={17} w={700} align="right" numberOfLines={1}>{addressTitle}</Txt>
                {addressRest ? <Txt s={14} color={c.text2} align="right" numberOfLines={2}>{addressRest}</Txt> : null}
              </View>
            </View>
          ) : null}
          <PressableScale disabled={!canConfirm} onPress={confirmPoint} style={[styles.confirm, { backgroundColor: canConfirm ? c.accent : c.surface2 }]}>
            <Txt s={17} w={700} color={canConfirm ? '#FFFFFF' : c.text3}>تأكيد العنوان</Txt>
          </PressableScale>
        </View>

        {/* ───────── صفحة البحث ───────── */}
        <Sheet visible={searchOpen} onClose={() => setSearchOpen(false)} fullScreen scroll={false}>
          <View style={[styles.searchPage, { paddingTop: insets.top + 10, backgroundColor: c.bg }]}>
            <View style={styles.searchHeader}>
              <CircleButton icon="close" size={40} iconSize={19} variant="soft" label="إغلاق البحث" onPress={() => setSearchOpen(false)} />
              <View style={[styles.searchBar, { backgroundColor: c.surface2, borderColor: c.line }]}>
                <TextInput ref={(instance) => { if (instance) searchRef.current = instance; }} value={query} onChangeText={setQuery} placeholder="ابحث عن شارع أو مكان في بلبيس" placeholderTextColor={c.text3} style={[styles.searchInput, { color: c.text1, textAlign: 'right' }]} returnKeyType="search" />
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
        </Sheet>

        {/* ───────── تفاصيل العنوان ───────── */}
        <Sheet visible={detailsOpen} onClose={() => setDetailsOpen(false)} fullScreen scroll={false}>
          <ScrollView style={[styles.formPage, { backgroundColor: c.bg }]} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 26, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
            <View style={styles.formHeader}>
              <CircleButton icon="chevron_right" size={42} iconSize={22} variant="soft" label="رجوع" onPress={() => setDetailsOpen(false)} />
              <Txt s={22} w={700} align="right" style={{ flex: 1 }}>عنوان جديد</Txt>
            </View>
            {/* تعديل الموقع = الرجوع للخريطة بنفس الحالة (من غير شاشة جديدة تضيّع اللي اتكتب) */}
            <PressableScale onPress={() => setDetailsOpen(false)} style={styles.miniMap} accessibilityLabel="تعديل موقع العنوان على الخريطة">
              <MapLibre mapStyle="https://tiles.openfreemap.org/styles/bright" attribution logo={false} compass={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
                <MapCamera initialViewState={{ center: [point.longitude, point.latitude], zoom: 16, pitch: 0, bearing: 0 }} />
              </MapLibre>
              <View pointerEvents="none" style={styles.miniPin}>
                <View style={styles.miniAvatarRing}>
                  {user?.photo ? <Image source={{ uri: user.photo }} style={styles.miniAvatar} contentFit="cover" /> : <Icon name="person" size={19} color="#FFFFFF" />}
                </View>
                <View style={styles.miniPinTail} />
              </View>
            </PressableScale>
            <PressableScale onPress={() => setDetailsOpen(false)} style={[styles.region, { borderColor: c.line }]} accessibilityLabel="تعديل المنطقة من الخريطة">
              <View style={{ flex: 1, gap: 3 }}>
                <Txt s={15} w={700} align="right">المنطقة</Txt>
                <Txt s={14} color={c.text2} align="right">{form.city}</Txt>
              </View>
              <Txt s={14} color={c.accent}>تعديل</Txt>
            </PressableScale>
            <View style={styles.tags}>
              {TAGS.map((t) => <PressableScale key={t.tag} onPress={() => update({ tag: t.tag })} accessibilityLabel={t.label} style={[styles.tag, { backgroundColor: form.tag === t.tag ? c.text1 : c.bg, borderColor: c.line }]}><Txt s={14} w={600} color={form.tag === t.tag ? c.bg : c.text1}>{t.label}</Txt></PressableScale>)}
            </View>
            <FormField label="الشارع / اسم المبنى" value={form.l1} error={fieldErrors.l1} onChange={(l1) => { update({ l1 }); setFieldErrors((e) => ({ ...e, l1: undefined })); }} placeholder="اسم المبنى أو الشارع" />
            <View style={styles.twoFields}>
              <View style={{ flex: 1 }}><FormField label={activeTag.aptLabel} value={form.apt} error={fieldErrors.apt} onChange={(apt) => { update({ apt }); setFieldErrors((e) => ({ ...e, apt: undefined })); }} placeholder={activeTag.aptLabel} /></View>
              <View style={{ flex: 1 }}><FormField label="الدور (اختياري)" value={floor} onChange={setFloor} placeholder="الدور" /></View>
            </View>
            <FormField label="رقم الهاتف الجوال" value={form.phone} error={fieldErrors.phone} onChange={(phone) => { update({ phone }); setFieldErrors((e) => ({ ...e, phone: undefined })); }} placeholder="+20 رقم الهاتف" keyboardType="phone-pad" />
            <FormField label="علامة مميزة (اختياري)" value={form.note} onChange={(note) => update({ note })} placeholder="علامة مميزة" />
            <FormField label="تسمية العنوان (اختياري)" value={form.custom} onChange={(custom) => update({ custom })} placeholder="مثلاً: منزل العائلة" />
            <PressableScale disabled={saving} onPress={() => { void saveAddress(); }} style={[styles.confirm, { backgroundColor: c.accent, opacity: saving ? 0.82 : 1 }]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Txt s={17} w={700} color="#FFFFFF">حفظ العنوان</Txt>}</PressableScale>
          </ScrollView>
        </Sheet>
      </View>
    </View>
  );
}

function FormField({ label, value, onChange, placeholder, keyboardType, error }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad'; error?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Txt s={14} w={600} align="right">{label}</Txt>
      <View style={[styles.inputWrap, { borderColor: error ? '#D92D20' : c.line, backgroundColor: c.surface1 }]}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.text3} keyboardType={keyboardType} returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={Keyboard.dismiss} style={[styles.input, { color: c.text1, textAlign: 'right' }]} />
        {error ? <Icon name="error" size={19} color="#D92D20" /> : null}
      </View>
      {error ? <Txt s={12} color="#D92D20" align="right">{error}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  routeOverlay: { flex: 1, justifyContent: 'flex-end' },
  screen: { flex: 1 },
  top: { paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.25, alignItems: 'center', justifyContent: 'center' },
  mapArea: { flex: 1, overflow: 'hidden', backgroundColor: '#E8EFE8' },

  pinWrap: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  pinShadow: { position: 'absolute', left: -7, top: -2.5, width: 14, height: 5, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.28)' },
  pinBody: { position: 'absolute', left: -16, top: -42, width: 32, height: 42 },
  pinImg: { width: 32, height: 42 },
  pinDot: { position: 'absolute', left: 11, top: 10.5, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' },

  warning: { position: 'absolute', zIndex: 8, left: 40, right: 40, bottom: '50%', marginBottom: 52, paddingHorizontal: 22, paddingVertical: 16, borderRadius: 28, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  locateBtn: { position: 'absolute', zIndex: 8, left: 16, bottom: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },

  restaurantMarker: { alignItems: 'center', justifyContent: 'center', minWidth: 54, minHeight: 58 },
  restaurantPhoto: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, backgroundColor: '#FFFFFF', overflow: 'hidden', elevation: 5 },
  distancePill: { marginTop: -7, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#202020', borderWidth: 1, borderColor: '#FFFFFF' },

  bottom: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  addressLine: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  confirm: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },

  searchPage: { flex: 1, paddingHorizontal: 20 },
  searchHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingTop: 2 },
  searchResults: { flex: 1, width: '100%' },
  searchBar: { height: 40, flex: 1, borderWidth: 1, borderRadius: 22, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  searchInput: { flex: 1, minHeight: 38, fontSize: 14, paddingVertical: 0 },
  result: { minHeight: 82, borderBottomWidth: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 12, width: '100%' },

  formPage: { flex: 1 },
  formHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 8 },
  miniMap: { height: 180, overflow: 'hidden', borderRadius: 4 },
  miniPin: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -31, alignItems: 'center' },
  miniAvatarRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: '#E83E70', backgroundColor: '#E83E70', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 2 },
  miniAvatar: { width: 32, height: 32, borderRadius: 16 },
  miniPinTail: { width: 12, height: 12, backgroundColor: '#E83E70', transform: [{ rotate: '45deg' }], marginTop: -7, borderBottomRightRadius: 3 },
  region: { minHeight: 82, borderWidth: 1.5, borderRadius: 18, padding: 15, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  tags: { flexDirection: 'row-reverse', justifyContent: 'flex-start', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 17, paddingVertical: 10 },
  twoFields: { flexDirection: 'row-reverse', gap: 12 },
  inputWrap: { minHeight: 60, borderWidth: 1.5, borderRadius: 17, paddingHorizontal: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 56, paddingHorizontal: 2, fontSize: 15 },
});