import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Map as MapLibre, Camera as MapCamera, GeoJSONSource, Layer, ViewAnnotation } from '@maplibre/maplibre-react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
import { AccentButton, AccentFill, CircleButton } from '@/components/ui/buttons';
import { Dashes } from '@/components/ui/dashes';
import { Card, goBack, useChrome } from '@/components/ui/layout';
import { Avatar } from '@/components/ui/media';
import { Reveal, RevealScope, useEntered } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { CUSTOMER_STEPS } from '@/data/content';
import type { Order } from '@/data/types';
import { useStatusBar } from '@/hooks/use-status-bar';
import { cnt, initials, money } from '@/lib/format';
import { callNumber } from '@/lib/ops';
import { useTrackOrder } from '@/lib/sync';
import { selectMyOrders, stepLabel, useApp } from '@/store/app-store';
import { fixed } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

const E = Easing.bezier(0.22, 1, 0.36, 1);
const RIDE = [0.06, 0.26, 0.64, 0.94];

export default function TrackScreen() {
  return (
    <RevealScope>
      <Track />
    </RevealScope>
  );
}

function Track() {
  useStatusBar('light');
  const { c } = useTheme();
  const chrome = useChrome();
  const { no } = useLocalSearchParams<{ no: string }>();
  const prep = useApp((s) => s.prep);
  const order = useApp((s) => s.orders.find((o) => o.no === no) ?? selectMyOrders(s).find((o) => o.step < 3) ?? selectMyOrders(s)[0]);
  const on = useEntered(60);
  const locationSnapshot = order?.locations;
  const restaurantPins = locationSnapshot?.restaurants ?? [];
  const customerPin = locationSnapshot?.customer;
  const orderedRestaurantPins = customerPin?.latitude != null && customerPin.longitude != null
    ? restaurantPins.filter((pin) => pin.latitude != null && pin.longitude != null).slice().sort((a, b) => {
        const distance = (pin: typeof a) => {
          const lat = (pin.latitude! - customerPin.latitude!) * Math.PI / 180;
          const lng = (pin.longitude! - customerPin.longitude!) * Math.PI / 180;
          return lat * lat + lng * lng * Math.cos(customerPin.latitude! * Math.PI / 180) ** 2;
        };
        return distance(b) - distance(a);
      })
    : [];
  const routeKey = orderedRestaurantPins.map((pin) => `${pin.id}:${pin.latitude}:${pin.longitude}`).join('|') + `|${customerPin?.latitude ?? ''}:${customerPin?.longitude ?? ''}`;
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  useEffect(() => {
    let active = true;
    if (orderedRestaurantPins.length === 0 || customerPin?.latitude == null || customerPin.longitude == null) {
      setRouteCoordinates([]);
      return () => { active = false; };
    }
    const stops = [...orderedRestaurantPins.map((pin) => [pin.longitude!, pin.latitude!] as [number, number]), [customerPin.longitude, customerPin.latitude] as [number, number]];
    const coordinates = stops.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    fetch(url).then((response) => response.ok ? response.json() : Promise.reject(new Error('Route unavailable')))
      .then((data: { routes?: { geometry?: { coordinates?: [number, number][] } }[] }) => {
        const route = data.routes?.[0]?.geometry?.coordinates;
        if (active && Array.isArray(route) && route.length > 1) setRouteCoordinates(route);
      }).catch(() => { if (active) setRouteCoordinates([]); });
    return () => { active = false; };
  }, [order?.id, routeKey]);
  const routeFeature = routeCoordinates.length > 1 ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: routeCoordinates } } : null;
  // live tracking: this order every few seconds while it's on its way
  useTrackOrder(order?.id, !!order && order.step < 3);
  if (!order) return null;
  const rider = order.rider;
  const riderFirst = rider?.name.split(' ')[0];

  const canc = order.step === 4;
  const step = Math.min(order.step, 3);
  const eta = canc ? '—' : order.step >= 3 ? 'Delivered' : `${[prep + 12, prep, 9][order.step]} min`;
  const toast = useApp.getState().showToast;
  const help = () => toast('Support chat', 'The kitchen will reply in a moment', 'chat');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.head, { paddingTop: chrome.top + 2 }]}>
          <View style={styles.headRow}>
            <CircleButton icon="arrow_back" label="Back" onPress={goBack} style={styles.darkBtn} color={fixed.paper} />
            <Txt s={13} w={600} color={fixed.paperA(0.72)}>
              Order {order.no}
            </Txt>
            <CircleButton icon="support_agent" label="Help" onPress={help} style={styles.darkBtn} color={fixed.paper} />
          </View>
          <Reveal i={0} style={{ gap: 6 }}>
            <Txt s={12} w={600} ls={0.08} upper color={fixed.peach}>
              {canc ? 'Order cancelled' : step >= 3 ? 'Enjoy your meal' : 'Estimated arrival'}
            </Txt>
            <Txt s={54} w={600} lh={1} ls={-0.04} color={fixed.paper}>
              {eta}
            </Txt>
            <Txt s={15} w={500} color={fixed.paperA(0.8)}>
              {canc ? 'Cancelled' : stepLabel(order, step)}
            </Txt>
          </Reveal>
          <RouteBar step={step} on={on} />
        </View>

        <View style={{ paddingTop: 18, paddingHorizontal: 20, gap: 12 }}>
          {orderedRestaurantPins.length > 0 && customerPin?.latitude != null && customerPin.longitude != null ? (
            <Reveal i={1}>
              <Card style={{ padding: 10, gap: 8 }}>
                <Txt s={14} w={700}>خريطة طلبك</Txt>
                <View style={{ height: 230, overflow: 'hidden', borderRadius: 16, backgroundColor: '#EAF0E8' }}>
                  <MapLibre mapStyle="https://tiles.openfreemap.org/styles/bright" attribution logo={false} compass style={StyleSheet.absoluteFill}>
                    <MapCamera initialViewState={{ center: [([...orderedRestaurantPins.map((pin) => pin.longitude!), customerPin.longitude].reduce((sum, value) => sum + value, 0) / (orderedRestaurantPins.length + 1)), ([...orderedRestaurantPins.map((pin) => pin.latitude!), customerPin.latitude].reduce((sum, value) => sum + value, 0) / (orderedRestaurantPins.length + 1))], zoom: 11.5, pitch: 0, bearing: 0 }} />
                    {routeFeature ? <GeoJSONSource data={{ type: 'FeatureCollection', features: [routeFeature] }}><Layer type="line" paint={{ "line-color": "#315B45", "line-width": 5, "line-opacity": 0.92 }} layout={{ "line-cap": "round", "line-join": "round" }} /></GeoJSONSource> : null}
                    {orderedRestaurantPins.map((pin) => (
                      <ViewAnnotation key={pin.id} lngLat={[pin.longitude!, pin.latitude!]} anchor="bottom">
                        <View style={styles.tawseelaPin}>
                          <View style={styles.tawseelaPinPhotoFrame}><Image source={{ uri: pin.image }} style={styles.tawseelaPinPhoto} contentFit="cover" /></View>
                          <View style={styles.tawseelaPinTail} />
                        </View>
                      </ViewAnnotation>
                    ))}
                    <ViewAnnotation lngLat={[customerPin.longitude, customerPin.latitude]} anchor="bottom">
                      <View style={styles.tawseelaPin}>
                        <View style={styles.tawseelaPinPhotoFrame}>
                          {customerPin.image ? <Image source={{ uri: customerPin.image }} style={styles.tawseelaPinPhoto} contentFit="cover" /> : <View style={styles.tawseelaPinFallback}><Icon name="person" size={26} color="#D8F000" /></View>}
                        </View>
                        <View style={styles.tawseelaPinTail} />
                      </View>
                    </ViewAnnotation>
                  </MapLibre>
                </View>
                <Txt s={11.5} color={c.text3}>{routeCoordinates.length > 1 ? 'مسار متصل يمر على المطاعم ثم يصل إليك' : 'جارٍ تحميل مسار الطرق أو أن خدمة التوجيه غير متاحة مؤقتًا'}</Txt>
              </Card>
            </Reveal>
          ) : null}
          <Card style={{ paddingVertical: 6, paddingHorizontal: 16 }}>
            {CUSTOMER_STEPS.map(([, sub, icon], i) => (
              <StepRow
                key={icon}
                order={order}
                i={i}
                step={step}
                canc={canc}
                on={on}
                sub={
                  i === 2 && order.mode === 'pickup'
                    ? 'Come grab it at 112 Spring St'
                    : i === 2
                      ? riderFirst
                        ? `${riderFirst} is riding to you`
                        : 'Your courier is on the way'
                      : sub
                }
                icon={icon}
              />
            ))}
          </Card>

          {step >= 2 && !canc && order.mode !== 'pickup' && rider ? (
            <Reveal i={3}>
              <Card style={styles.person}>
                <Avatar text={initials(rider.name)} size={48} bg={c.accentSoft} color={c.accentText} fontSize={16} display />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={15} w={700}>
                    {rider.name}
                  </Txt>
                  <Txt s={12.5} color={c.text3}>
                    {step >= 3 ? 'Your courier · delivered' : order.stage === 'assigned' ? 'Your courier · picking up your order' : 'Your courier · on the way'}
                  </Txt>
                </View>
                <CircleButton icon="chat" size={44} iconSize={20} variant="soft" label="Message" onPress={() => callNumber(rider.phone, 'sms')} />
                <CircleButton icon="call" size={44} iconSize={20} variant="accent" fill label="Call" onPress={() => callNumber(rider.phone)} />
              </Card>
            </Reveal>
          ) : null}
          {step < 2 && !canc ? (
            <Reveal i={3}>
              <Card style={styles.person}>
                <View style={[styles.chef, { backgroundColor: c.accentSoft }]}>
                  <Icon name="skillet" size={24} fill color={c.accent} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={15} w={700}>
                    Chef Lena is on it
                  </Txt>
                  <Txt s={12.5} color={c.text3}>
                    Fig & Fennel, SoHo · 1.2 mi away
                  </Txt>
                </View>
              </Card>
            </Reveal>
          ) : null}

          <Reveal i={4}>
            <Card style={{ padding: 16, gap: 10 }}>
              <Txt s={12} w={600} ls={0.06} upper color={c.text3}>
                {cnt(
                  order.items.reduce((a, b) => a + b.q, 0),
                  'item',
                )}{' '}
                · {money(order.total)} · {order.pay}
              </Txt>
              {order.items.map((it, k) => {
                return (
                  <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <Txt s={14} w={700} color={c.accentText}>
                      {it.q}×
                    </Txt>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Txt s={14} w={500}>
                        {it.name}
                      </Txt>
                      {it.meta ? (
                        <Txt s={12} w={500} color={c.text3}>
                          {it.meta}
                        </Txt>
                      ) : null}
                    </View>
                    <Txt s={14} w={500}>
                      {it.voucher ? 'Reward' : money(it.unit * it.q)}
                    </Txt>
                  </View>
                );
              })}
            </Card>
          </Reveal>

          {step >= 3 && !canc ? (
            <AccentButton
              label={order.rated ? `You rated this ${order.rated} ★` : 'Rate & tip'}
              icon="star"
              iconFill
              iconSize={21}
              height={56}
              onPress={() => router.push({ pathname: '/rate/[no]', params: { no: order.no } })}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** Store → home progress line with the courier bubble (`tk.ride`). */
function RouteBar({ step, on }: { step: number; on: boolean }) {
  const [w, setW] = useState(0);
  const p = useSharedValue(RIDE[0]);
  const fill = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(on ? RIDE[step] : RIDE[0], { duration: 1200, easing: E }));
    fill.set(withTiming(on ? RIDE[step] : 0, { duration: 1200, easing: E }));
  }, [on, step, p, fill]);
  const rider = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * w - 30 }] }));
  const bar = useAnimatedStyle(() => ({ width: fill.value * w }));
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  return (
    <View style={styles.route} onLayout={onLayout}>
      <Dashes color={fixed.paperA(0.22)} style={styles.dash} />
      <Animated.View style={[styles.fill, bar]} />
      <View style={[styles.endTile, { left: -6 }]}>
        <Icon name="storefront" size={16} fill color={fixed.peach} />
      </View>
      <View style={[styles.endTile, { right: -6 }]}>
        <Icon name="home" size={16} fill color={fixed.paper} />
      </View>
      {w ? (
        <Animated.View style={[styles.riderRing, rider]}>
          <View style={styles.rider}>
            <Icon name={step >= 3 ? 'check' : step === 2 ? 'two_wheeler' : 'skillet'} size={24} fill color="#FFFFFF" />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function StepRow({
  order,
  i,
  step,
  canc,
  on,
  sub,
  icon,
}: {
  order: Order;
  i: number;
  step: number;
  canc: boolean;
  on: boolean;
  sub: string;
  icon: (typeof CUSTOMER_STEPS)[number][2];
}) {
  const { c } = useTheme();
  const done = !canc && i <= step;
  const cur = !canc && i === step && step < 3;
  const dot = useSharedValue(0.5);
  const line = useSharedValue(0);
  useEffect(() => {
    dot.set(withDelay(150 + i * 160, withSpring(on ? 1 : 0.5, { damping: 10, stiffness: 200 })));
    line.set(withDelay(260 + i * 160, withTiming(on && !canc && i < step ? 1 : 0, { duration: 600, easing: E })));
  }, [on, i, step, canc, dot, line]);
  const dotSt = useAnimatedStyle(() => ({ transform: [{ scale: dot.value }] }));
  const lineSt = useAnimatedStyle(() => ({ height: `${line.value * 100}%` }));
  return (
    <Reveal i={1 + i} from={{ x: -16 }} style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ width: 32, alignItems: 'center', paddingTop: 12 }}>
        <Animated.View style={[styles.stepDot, { borderColor: done ? c.accent : c.lineStrong, backgroundColor: done ? c.accent : c.surface1 }, dotSt]}>
          <Icon name={icon} size={17} fill={done} color={done ? c.accentInk : c.text3} />
        </Animated.View>
        {i < 3 ? (
          <View style={[styles.stepLine, { backgroundColor: c.lineStrong }]}>
            <Animated.View style={[{ width: '100%', overflow: 'hidden' }, lineSt]}>
              <AccentFill />
            </Animated.View>
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, paddingVertical: 14, gap: 2, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: c.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt s={14.5} w={700} color={done ? c.text1 : c.text3}>
            {stepLabel(order, i)}
          </Txt>
          {cur ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: c.accentSoft }}>
              <Txt s={10} w={700} ls={0.06} upper color={c.accentText}>
                Now
              </Txt>
            </View>
          ) : null}
        </View>
        <Txt s={12.5} color={c.text3}>
          {sub}
        </Txt>
      </View>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  tawseelaPin: { width: 78, height: 92, alignItems: 'center', justifyContent: 'flex-start' },
  tawseelaPinPhotoFrame: { width: 76, height: 68, padding: 5, borderRadius: 22, borderWidth: 4, borderColor: '#D8F000', backgroundColor: '#003D27', overflow: 'hidden', zIndex: 2, elevation: 8 },
  tawseelaPinPhoto: { width: '100%', height: '100%', borderRadius: 13 },
  tawseelaPinFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tawseelaPinTail: { width: 0, height: 0, marginTop: -2, borderLeftWidth: 18, borderRightWidth: 18, borderTopWidth: 27, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#003D27', zIndex: 1 },
  head: { paddingHorizontal: 20, paddingBottom: 54, backgroundColor: fixed.ink, gap: 22, borderBottomLeftRadius: 34, borderBottomRightRadius: 34 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  darkBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.18)' },
  route: { height: 48, marginTop: 4, marginHorizontal: 6 },
  dash: { position: 'absolute', left: 0, right: 0, top: 23 },
  fill: { position: 'absolute', left: 0, top: 22, height: 4, borderRadius: 2, backgroundColor: fixed.orange },
  endTile: {
    position: 'absolute',
    top: 12,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderRing: {
    position: 'absolute',
    top: -6,
    left: 0,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(76,91,66,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rider: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: fixed.orange,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  chef: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stepDot: { zIndex: 1, width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepLine: { position: 'absolute', top: 44, bottom: -12, width: 2, overflow: 'hidden' },
});
