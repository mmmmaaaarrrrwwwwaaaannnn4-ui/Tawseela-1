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

function TimeWheel({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { c } = useTheme();
  const [hourText, minuteText] = value.split(':');
  const rawHour = Number(hourText);
  const minute = Number(minuteText);
  const period = rawHour >= 12 ? 'م' : 'ص';
  const hour = rawHour % 12 || 12;
  const set = (h: number, m: number, p: string) => onChange(`${String((h % 12) + (p === 'م' ? 12 : 0)).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  const step = (n: number, max: number) => (n + max + 1) % (max + 1);
  return <View style={{flex:1,gap:6,padding:10,borderRadius:16,borderWidth:1,borderColor:c.line,backgroundColor:c.surface1}}>
    <Txt s={12} w={700} color={c.text2}>{label}</Txt>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7}}>
      <View style={{alignItems:'center',gap:3}}><PressableScale onPress={()=>set(step(hour,11),minute,period)}><Icon name="keyboard_arrow_up" size={22} color={c.accentText}/></PressableScale><Txt s={25} w={700}>{String(hour).padStart(2,'0')}</Txt><PressableScale onPress={()=>set(hour===1?12:hour-1,minute,period)}><Icon name="keyboard_arrow_down" size={22} color={c.accentText}/></PressableScale></View>
      <Txt s={24} w={700}>:</Txt>
      <View style={{alignItems:'center',gap:3}}><PressableScale onPress={()=>set(hour,step(minute,59),period)}><Icon name="keyboard_arrow_up" size={22} color={c.accentText}/></PressableScale><Txt s={25} w={700}>{String(minute).padStart(2,'0')}</Txt><PressableScale onPress={()=>set(hour,minute===0?59:minute-1,period)}><Icon name="keyboard_arrow_down" size={22} color={c.accentText}/></PressableScale></View>
      <View style={{gap:5}}>{(['ص','م'] as const).map(p=><PressableScale key={p} onPress={()=>set(hour,minute,p)} style={{paddingHorizontal:9,paddingVertical:5,borderRadius:9,backgroundColor:period===p?c.accent:c.surface2}}><Txt s={13} w={700} color={period===p?c.accentInk:c.text2}>{p}</Txt></PressableScale>)}</View>
    </View>
  </View>;
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
    return found ? { ...found, manualStatus: found.manualStatus ?? 'auto' } : { id: 'new', name: '', tag: '', icon: b[0]?.icon ?? 'storefront', img: b[0]?.img ?? '', on: true, lat: null, lng: null, address: '', phone: '', description: '', workDays: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], openTime: '09:00', closeTime: '23:00', manualStatus: 'auto', deliveryFee: 0, prepTime: 30 };
  });
  const dishes = menu.filter((m) => m.brand === draft.id);
  const mapHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}.search{position:absolute;z-index:999;top:10px;left:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap}.search input{flex:1;min-width:0;padding:10px;border:1px solid #bbb;border-radius:10px;background:white}.search button{padding:10px;border:0;border-radius:10px;background:#173d2a;color:white}.suggestions{display:none;flex-basis:100%;max-height:120px;overflow:auto;background:white;border-radius:10px;box-shadow:0 2px 12px #0003}.suggestions button{display:block;width:100%;text-align:right;background:white;color:#222;border-radius:0;border-bottom:1px solid #eee}</style></head><body><div class="search"><input id="q" placeholder="ابحث عن عنوان المطبخ" oninput="suggestPlaces()"><button onclick="searchPlace()">بحث</button><button onclick="locate()">موقعي</button><div id="suggestions" class="suggestions"></div></div><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const map=L.map('map').setView([${draft.lat ?? 30.0444},${draft.lng ?? 31.2357}],${draft.lat == null ? 6 : 15});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);let marker=null;function pin(lat,lng,address=''){if(marker)map.removeLayer(marker);marker=L.marker([lat,lng]).addTo(map);window.ReactNativeWebView.postMessage(JSON.stringify({lat,lng,address}));}let searchTimer=null,lastQuery='';async function lookup(q){const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=eg&accept-language=ar&q='+encodeURIComponent(q));return await r.json();}function choosePlace(p){document.getElementById('q').value=p.display_name||'';document.getElementById('suggestions').style.display='none';map.setView([+p.lat,+p.lon],16);pin(+p.lat,+p.lon,p.display_name||'');}function suggestPlaces(){clearTimeout(searchTimer);const q=document.getElementById('q').value.trim();const box=document.getElementById('suggestions');if(q.length<3){box.style.display='none';return;}searchTimer=setTimeout(async()=>{if(q===lastQuery)return;lastQuery=q;try{const rows=await lookup(q);box.innerHTML='';rows.forEach(p=>{const b=document.createElement('button');b.textContent=p.display_name;b.onclick=()=>choosePlace(p);box.appendChild(b);});box.style.display=rows.length?'block':'none';}catch(e){box.style.display='none';}},900);}async function searchPlace(){const q=document.getElementById('q').value.trim();if(!q)return;try{const rows=await lookup(q);if(rows.length)choosePlace(rows[0]);else window.ReactNativeWebView.postMessage(JSON.stringify({error:'not_found'}));}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({error:'search_failed'}));}}function locate(){if(!navigator.geolocation){window.ReactNativeWebView.postMessage(JSON.stringify({error:'location_unavailable'}));return;}navigator.geolocation.getCurrentPosition(p=>{map.setView([p.coords.latitude,p.coords.longitude],16);pin(p.coords.latitude,p.coords.longitude);},()=>window.ReactNativeWebView.postMessage(JSON.stringify({error:'location_denied'})),{enableHighAccuracy:true,timeout:12000});}if(${draft.lat != null && draft.lng != null})pin(${draft.lat ?? 0},${draft.lng ?? 0});map.on('click',e=>pin(e.latlng.lat,e.latlng.lng));</script></body></html>`;

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const name = draft.name.trim();
    if (draft.workDays.length === 0) { setSaving(false); useApp.getState().showToast('حدد أيام العمل', 'اختر يومًا واحدًا على الأقل لفتح المطبخ.', 'error'); return; }
    if (draft.lat == null || draft.lng == null || !Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || draft.lat < -90 || draft.lat > 90 || draft.lng < -180 || draft.lng > 180) { setSaving(false); useApp.getState().showToast('حدد موقع المطبخ', 'اضغط على الخريطة لاختيار موقع صحيح قبل الحفظ.', 'error'); return; }
    if (!name) { setSaving(false); useApp.getState().showToast('اسم المطبخ مطلوب', 'اكتب اسم المطبخ أولًا.', 'error'); return; }
    const ok = id === 'new'
      ? await useApp.getState().createBrand({ name, tag: draft.tag.trim(), icon: draft.icon, img: draft.img, on: draft.on, lat: draft.lat, lng: draft.lng, address: draft.address, phone: draft.phone, description: draft.description, workDays: draft.workDays, openTime: draft.openTime, closeTime: draft.closeTime, manualStatus: draft.manualStatus, deliveryFee: draft.deliveryFee, prepTime: draft.prepTime })
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
          <FieldLabel>أيام عمل المطبخ</FieldLabel>
          <View style={styles.daysGrid}>
            {([['sat','السبت'],['sun','الأحد'],['mon','الإثنين'],['tue','الثلاثاء'],['wed','الأربعاء'],['thu','الخميس'],['fri','الجمعة']] as const).map(([key,label]) => {
              const active = draft.workDays.includes(key);
              return <PressableScale key={key} onPress={() => setDraft(d => ({ ...d, workDays: active ? d.workDays.filter(x => x !== key) : [...d.workDays, key] }))} style={[styles.dayChip,{backgroundColor:active?c.accentSoft:c.surface1,borderColor:active?c.accent:c.line}]}><Txt s={13} w={700} color={active?c.accentText:c.text2}>{label}</Txt>{active ? <Icon name="check_circle" size={17} color={c.accent}/> : null}</PressableScale>;
            })}
          </View>
          <FieldLabel>مواعيد العمل</FieldLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TimeWheel label="يفتح الساعة" value={draft.openTime} onChange={v => setDraft(d => ({...d,openTime:v}))} />
            <TimeWheel label="يقفل الساعة" value={draft.closeTime} onChange={v => setDraft(d => ({...d,closeTime:v}))} />
          </View>
          <FieldLabel>حالة المطبخ الآن</FieldLabel>
          <View style={styles.statusOptions}>
            {([['auto','حسب الجدول'],['open','مفتوح الآن'],['closed','مغلق الآن']] as const).map(([value,label]) => {
              const active = draft.manualStatus === value;
              return <PressableScale key={value} onPress={() => setDraft(d => ({...d,manualStatus:value}))} style={[styles.statusChip,{backgroundColor:active?c.accentSoft:c.surface1,borderColor:active?c.accent:c.line}]}><Txt s={12.5} w={700} color={active?c.accentText:c.text2}>{label}</Txt></PressableScale>;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><FieldLabel>Delivery fee (EGP)</FieldLabel><AdminInput value={String(draft.deliveryFee ?? 0)} onChangeText={(v) => setDraft((d) => ({ ...d, deliveryFee: Number(v) || 0 }))} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><FieldLabel>Preparation time (minutes)</FieldLabel><AdminInput value={String(draft.prepTime)} onChangeText={(v) => setDraft((d) => ({ ...d, prepTime: Number(v) || 1 }))} keyboardType="number-pad" /></View></View>
        </Reveal>
        <Reveal i={2} style={{ gap: 8 }}>
          <FieldLabel>Kitchen location — tap the map to place the pin</FieldLabel>
          <View style={{ height: 260, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: c.line }}><WebView originWhitelist={['*']} source={{ html: mapHtml }} onMessage={(event) => { try { const p = JSON.parse(event.nativeEvent.data); if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) { useApp.getState().showToast('تعذر تحديد الموقع', 'جرّب البحث عن عنوان أو اضغط على الخريطة مباشرة.', 'error'); return; } setDraft((d) => ({ ...d, lat: Number(p.lat), lng: Number(p.lng), ...(typeof p.address === 'string' && p.address ? { address: p.address } : {}) })); } catch {} }} javaScriptEnabled geolocationEnabled /></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><FieldLabel>Latitude</FieldLabel><AdminInput value={draft.lat == null ? '' : String(draft.lat)} onChangeText={(v) => setDraft((d) => ({ ...d, lat: v.trim() ? Number(v) : null }))} keyboardType="numbers-and-punctuation" placeholder="30.0444" /></View><View style={{ flex: 1 }}><FieldLabel>Longitude</FieldLabel><AdminInput value={draft.lng == null ? '' : String(draft.lng)} onChangeText={(v) => setDraft((d) => ({ ...d, lng: v.trim() ? Number(v) : null }))} keyboardType="numbers-and-punctuation" placeholder="31.2357" /></View></View>
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
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { minWidth: '30%', flexGrow: 1, height: 42, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusOptions: { flexDirection: 'row', gap: 7 },
  statusChip: { flex: 1, minHeight: 42, paddingHorizontal: 7, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
