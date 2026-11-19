import { StyleSheet, View } from 'react-native';
import { Camera as MapCamera, Map as MapLibre } from '@maplibre/maplibre-react-native';

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
  city: 'بلبيس، الشرقية',
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
          <Txt s={10.5} w={700} ls={0.08} upper color="#255942">
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
          <MapLibre
            mapStyle="https://tiles.openfreemap.org/styles/bright"
            attribution
            logo={false}
            compass
            compassPosition={{ top: 12, right: 12 }}
            onRegionDidChange={(event) => {
              const center = event.nativeEvent.center;
              if (Array.isArray(center) && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
                onMapSelect(center[1], center[0]);
              }
            }}
            style={StyleSheet.absoluteFill}
          >
            <MapCamera
              initialViewState={{
                center: [n.longitude ?? 31.557884, n.latitude ?? 30.42292],
                zoom: n.latitude && n.longitude ? 16 : 14,
                pitch: 0,
                bearing: 0,
              }}
            />
          </MapLibre>
          <View pointerEvents="none" style={styles.mapPinWrap}>
            <View style={styles.mapPinShadow} />
            <View style={styles.mapPin}>
              <Icon name="location_on" size={23} fill color="#FFFFFF" />
            </View>
          </View>
          <View pointerEvents="none" style={styles.mapHint}>
            <Txt s={11} w={600} color="#255942">حرّك الخريطة لتحديد مكان التسليم</Txt>
          </View>
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
  map: { height: 250, borderRadius: 16, overflow: 'hidden', backgroundColor: '#EAF0E8' },
  mapPinWrap: { position: 'absolute', left: '50%', top: '50%', marginLeft: -17, marginTop: -37, alignItems: 'center' },
  mapPin: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#255942', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', elevation: 5 },
  mapPinShadow: { position: 'absolute', bottom: -5, width: 12, height: 5, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.18)' },
  mapHint: { position: 'absolute', bottom: 10, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.94)' },
  preview: { padding: 14, borderRadius: 20, backgroundColor: fixed.ink, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinRing: { width: 56, height: 56, margin: -6, borderRadius: 28, backgroundColor: 'rgba(37,89,66,0.16)', alignItems: 'center', justifyContent: 'center' },
  pin: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#255942', alignItems: 'center', justifyContent: 'center' },
});
