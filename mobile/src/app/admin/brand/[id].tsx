import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { AdminHeader, AdminInput, FieldLabel, openItemEditor, ToggleCardRow, useAdminPadding } from '@/components/admin/admin-ui';
import { PhotoButton } from '@/components/admin/photo-button';
import { Icon } from '@/components/icons/icon';
import { AccentButton } from '@/components/ui/buttons';
import { FloatingBar, goBack } from '@/components/ui/layout';
import { DishImage, Photo } from '@/components/ui/media';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import type { Brand } from '@/data/types';
import { useStatusBar } from '@/hooks/use-status-bar';
import { money } from '@/lib/format';
import { useApp } from '@/store/app-store';
import { fixed } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

export default function AdminEditBrand() {
  return (
    <RevealScope>
      <EditBrand />
    </RevealScope>
  );
}

function EditBrand() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('cta');
  const { id } = useLocalSearchParams<{ id: string }>();
  const menu = useApp((s) => s.menu);
  const [draft, setDraft] = useState<Brand>(() => {
    const b = useApp.getState().brands;
    const found = b.find((x) => x.id === id);
    return found ? { ...found } : { id: 'new', name: '', tag: '', icon: b[0]?.icon ?? 'storefront', img: b[0]?.img ?? '', on: true, lat: null, lng: null, address: '', phone: '', description: '', workDays: [], openTime: '09:00', closeTime: '23:00', deliveryFee: 0, prepTime: 30 };
  });
  const dishes = menu.filter((m) => m.brand === draft.id);
  const mapHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([${draft.lat ?? 30.0444},${draft.lng ?? 31.2357}],${draft.lat == null ? 6 : 15});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);let marker=null;function pin(lat,lng){if(marker)map.removeLayer(marker);marker=L.marker([lat,lng]).addTo(map);window.ReactNativeWebView.postMessage(JSON.stringify({lat,lng}));}if(${draft.lat != null && draft.lng != null})pin(${draft.lat ?? 0},${draft.lng ?? 0});map.on('click',e=>pin(e.latlng.lat,e.latlng.lng));</script></body></html>`;

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const name = draft.name.trim();
    if (draft.lat == null || draft.lng == null) { setSaving(false); useApp.getState().showToast('حدد موقع المطبخ', 'اضغط على الخريطة لاختيار موقع صحيح قبل الحفظ.', 'error'); return; }
    if (!name) { setSaving(false); useApp.getState().showToast('اسم المطبخ مطلوب', 'اكتب اسم المطبخ أولًا.', 'error'); return; }
    const ok = id === 'new'
      ? await useApp.getState().createBrand({ name, tag: draft.tag.trim(), icon: draft.icon, img: draft.img, on: draft.on, lat: draft.lat, lng: draft.lng, address: draft.address, phone: draft.phone, description: draft.description, workDays: draft.workDays, openTime: draft.openTime, closeTime: draft.closeTime, deliveryFee: draft.deliveryFee, prepTime: draft.prepTime })
      : await useApp.getState().saveBrand({ ...draft, name, tag: draft.tag.trim() });
    setSaving(false);
    if (ok) goBack();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 10 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Reveal i={0}>
          <Photo uri={draft.img} radius={22} style={{ height: 150 }} overlay={[fixed.roast(0), fixed.roast(0.75)]}>
            <View style={styles.heroLabel}>
              <Icon name={draft.icon} size={22} fill color={fixed.paper} />
              <Txt s={20} w={600} color={fixed.paper} numberOfLines={1} style={{ flexShrink: 1 }}>
                {draft.name}
              </Txt>
            </View>
            <PhotoButton aspect={[16, 9]} folder="kitchens" onUploaded={(img) => setDraft((d) => ({ ...d, img }))} style={styles.photoBtn} />
          </Photo>
        </Reveal>
        <Reveal i={1} style={{ gap: 8 }}>
          <FieldLabel>Kitchen name</FieldLabel>
          <AdminInput value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))} placeholder="Kitchen name" />
          <FieldLabel>Tagline</FieldLabel>
          <AdminInput value={draft.tag} onChangeText={(v) => setDraft((d) => ({ ...d, tag: v }))} placeholder="Short description" />
          <FieldLabel>Phone</FieldLabel><AdminInput value={draft.phone} onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))} placeholder="Kitchen phone" keyboardType="phone-pad" />
          <FieldLabel>Address</FieldLabel><AdminInput value={draft.address} onChangeText={(v) => setDraft((d) => ({ ...d, address: v }))} placeholder="Full kitchen address" />
          <FieldLabel>Description</FieldLabel><AdminInput value={draft.description} onChangeText={(v) => setDraft((d) => ({ ...d, description: v }))} placeholder="Kitchen description" multiline />
          <FieldLabel>Working days (sat,sun,mon,tue,wed,thu,fri)</FieldLabel><AdminInput value={draft.workDays.join(',')} onChangeText={(v) => setDraft((d) => ({ ...d, workDays: v.split(',').map(x => x.trim()).filter((x): x is 'sat'|'sun'|'mon'|'tue'|'wed'|'thu'|'fri' => ['sat','sun','mon','tue','wed','thu','fri'].includes(x)) }))} placeholder="sat,sun,mon,tue,wed" />
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><FieldLabel>Opening time</FieldLabel><AdminInput value={draft.openTime} onChangeText={(v) => setDraft((d) => ({ ...d, openTime: v }))} placeholder="09:00" /></View><View style={{ flex: 1 }}><FieldLabel>Closing time</FieldLabel><AdminInput value={draft.closeTime} onChangeText={(v) => setDraft((d) => ({ ...d, closeTime: v }))} placeholder="23:00" /></View></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><FieldLabel>Delivery fee (EGP)</FieldLabel><AdminInput value={String(draft.deliveryFee)} onChangeText={(v) => setDraft((d) => ({ ...d, deliveryFee: Number(v) || 0 }))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><FieldLabel>Preparation time (minutes)</FieldLabel><AdminInput value={String(draft.prepTime)} onChangeText={(v) => setDraft((d) => ({ ...d, prepTime: Number(v) || 1 }))} keyboardType="number-pad" /></View></View>
        </Reveal>
        <Reveal i={2} style={{ gap: 8 }}>
          <FieldLabel>Kitchen location — tap the map to place the pin</FieldLabel>
          <View style={{ height: 260, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: c.line }}><WebView originWhitelist={['*']} source={{ html: mapHtml }} onMessage={(event) => { try { const p = JSON.parse(event.nativeEvent.data); setDraft((d) => ({ ...d, lat: Number(p.lat), lng: Number(p.lng) })); } catch {} }} javaScriptEnabled /></View>
          <Txt s={12} color={c.text3}>{draft.lat != null && draft.lng != null ? `Coordinates: ${draft.lat.toFixed(6)}, ${draft.lng.toFixed(6)}` : 'لم يتم تحديد موقع بعد'}</Txt>
        </Reveal>
        <ToggleCardRow title="Live on the app" sub="Shows on Home and in the menu" on={draft.on} onPress={() => setDraft((d) => ({ ...d, on: !d.on }))} />
        <Reveal i={2} from={{ y: 0, scale: 1 }}>
          <Txt s={17} w={600} style={{ marginTop: 6 }}>
            Dishes in this kitchen
          </Txt>
        </Reveal>
        {dishes.map((m) => (
          <PressableScale
            key={m.id}
            onPress={() => openItemEditor(m.id)}
            scaleTo={0.985}
            style={[styles.row, { borderColor: c.line, backgroundColor: c.surface1 }]}
          >
            <DishImage uri={m.img} size={44} />
            <Txt s={14} w={600} style={{ flex: 1 }} numberOfLines={1}>
              {m.name}
            </Txt>
            <Txt s={13.5} w={700}>
              {money(m.price)}
            </Txt>
            <Icon name="chevron_right" size={20} color={c.text3} />
          </PressableScale>
        ))}
      </ScrollView>
      <AdminHeader title={id === 'new' ? 'Add kitchen' : 'Edit kitchen'} back />
      <FloatingBar>
        <AccentButton label={id === 'new' ? 'Add kitchen' : 'Save kitchen'} loading={saving} loadingLabel="Saving…" onPress={() => void save()} />
      </FloatingBar>
    </View>
  );
}

const styles = StyleSheet.create({
  heroLabel: { position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoBtn: { top: 10, bottom: undefined },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 12, borderRadius: 18, borderWidth: 1 },
});
