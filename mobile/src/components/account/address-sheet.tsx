import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Icon } from '@/components/icons/icon';
import { AccentButton } from '@/components/ui/buttons';
import { Chip } from '@/components/ui/controls';
import { Eyebrow, ListCard } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/overlays';
import { Txt } from '@/components/ui/txt';
import type { NewAddress } from '@/store/app-store';
import { fixed } from '@/theme/tokens';

import { Area, Field } from './field';
import { ToggleRow } from './rows';

export const blankAddress = (prefill?: Partial<NewAddress>): NewAddress => ({
  tag: 'Home',
  custom: '',
  l1: '',
  apt: '',
  city: 'مصر',
  zip: '',
  note: '',
  door: true,
  phone: '',
  def: true,
  ...prefill,
});

const TAGS: [NewAddress['tag'], 'home' | 'work' | 'location_on'][] = [
  ['Home', 'home'],
  ['Work', 'work'],
  ['Other', 'location_on'],
];

/** “New address” sheet (`nA` in the design). */
export function AddressSheet({
  visible,
  value,
  onChange,
  showErrors,
  onSave,
  onClose,
  onMapSelect,
}: {
  visible: boolean;
  value: NewAddress;
  onChange: (p: Partial<NewAddress>) => void;
  showErrors: boolean;
  onSave: () => void;
  onClose: () => void;
  onMapSelect: (latitude: number, longitude: number) => void;
}) {
  const n = value;
  const preview = (n.l1.trim() || 'Street address') + (n.apt.trim() ? ', ' + n.apt.trim() : '');
  const preview2 = [n.city, n.zip].filter(Boolean).join(' ') || 'City, ZIP';
  const previewTag = n.tag === 'Other' ? n.custom.trim() || 'Other' : n.tag;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New address"
      subtitle="Where should we bring your food?"
      footer={<AccentButton label="Save address" icon="check" onPress={onSave} />}
    >
      <View style={styles.preview}>
        <View style={styles.pinRing}>
          <View style={styles.pin}>
            <Icon name="location_on" size={22} fill color="#FFFFFF" />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt s={10.5} w={700} ls={0.08} upper color={fixed.peach}>
            {previewTag}
          </Txt>
          <Txt s={15} w={700} color={fixed.paper} numberOfLines={1}>
            {preview}
          </Txt>
          <Txt s={12} color={fixed.paperA(0.7)}>
            {preview2}
          </Txt>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>Save as</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {TAGS.map(([l, icon]) => (
            <Chip key={l} label={l} icon={icon} on={n.tag === l} height={44} fontSize={13.5} onPress={() => onChange({ tag: l })} style={{ flex: 1 }} />
          ))}
        </View>
        {n.tag === 'Other' ? (
          <Field icon="label" value={n.custom} onChangeText={(custom) => onChange({ custom })} placeholder="Name this place (e.g. Gym, Mom’s)" />
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>Pin your delivery location</Eyebrow>
        <Txt s={12} color={fixed.paperA(0.7)}>Move the map and place the pin exactly where the courier should arrive.</Txt>
        <View style={styles.map}>
          <WebView
            originWhitelist={['*']}
            javaScriptEnabled
            source={{ html: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;padding:0}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const lat=' + (n.latitude ?? 30.0444) + ',lng=' + (n.longitude ?? 31.2357) + ';const map=L.map("map").setView([lat,lng],' + (n.latitude ? 16 : 12) + ');L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);const pin=L.marker([lat,lng],{draggable:true}).addTo(map);function send(p){window.ReactNativeWebView.postMessage(JSON.stringify({latitude:p.lat,longitude:p.lng}))}pin.on("dragend",()=>send(pin.getLatLng()));map.on("click",e=>{pin.setLatLng(e.latlng);send(e.latlng)});</script></body></html>' }}
            onMessage={(event) => { try { const point = JSON.parse(event.nativeEvent.data); if (Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) onMapSelect(point.latitude, point.longitude); } catch {} }}
            style={{ flex: 1, backgroundColor: '#F3F3F3' }}
          />
        </View>
        <Eyebrow>Address</Eyebrow>
        <Field
          icon="signpost"
          value={n.l1}
          onChangeText={(l1) => onChange({ l1 })}
          placeholder="Street and number *"
          error={showErrors && !n.l1.trim()}
          autoComplete="street-address"
        />
        <Field icon="apartment" value={n.apt} onChangeText={(apt) => onChange({ apt })} placeholder="Apt, suite or floor" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Field icon="location_city" value={n.city} onChangeText={(city) => onChange({ city })} placeholder="City, state" style={{ flex: 2 }} />
          <Field
            icon="pin"
            value={n.zip}
            onChangeText={(z) => onChange({ zip: z.replace(/\D/g, '').slice(0, 5) })}
            placeholder="Postal code"
            keyboardType="number-pad"
            error={showErrors && !!n.zip.trim() && !/^\d{5}$/.test(n.zip)}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>For the courier</Eyebrow>
        <Field icon="call" value={n.phone} onChangeText={(phone) => onChange({ phone })} placeholder="Contact phone" keyboardType="phone-pad" />
        <Area
          rows={2}
          radius={16}
          borderWidth={1.5}
          padH={15}
          padV={13}
          value={n.note}
          onChangeText={(note) => onChange({ note })}
          placeholder="Gate code, buzzer, landmarks…"
        />
      </View>

      <ListCard radius={20}>
        <ToggleRow
          icon="door_front"
          title="Leave at door"
          sub="Contact‑free drop‑off with a photo"
          on={n.door}
          minHeight={60}
          onPress={() => onChange({ door: !n.door })}
        />
        <ToggleRow icon="star" title="Set as default address" on={n.def} minHeight={60} last onPress={() => onChange({ def: !n.def })} />
      </ListCard>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  map: { height: 230, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F3F3F3' },
  preview: { padding: 14, borderRadius: 20, backgroundColor: fixed.ink, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinRing: { width: 56, height: 56, margin: -6, borderRadius: 28, backgroundColor: 'rgba(255,122,26,0.2)', alignItems: 'center', justifyContent: 'center' },
  pin: { width: 44, height: 44, borderRadius: 22, backgroundColor: fixed.orange, alignItems: 'center', justifyContent: 'center' },
});
