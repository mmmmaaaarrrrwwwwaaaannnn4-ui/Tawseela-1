import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { AdminHeader, useAdminPadding } from '@/components/admin/admin-ui';
import { OutlineButton } from '@/components/ui/buttons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { api } from '@/lib/api';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

type PosConnection = {
  id: string;
  name: string;
  provider: 'custom_webhook';
  storeId: string;
  webhookUrl?: string | null;
  capabilities: string[];
  enabled: boolean;
  status?: 'pending' | 'connected' | 'error';
  lastSeenAt?: unknown;
  lastError?: string | null;
};
type PosJob = { id: string; orderId: string; status: string; lastError?: string; updatedAt?: unknown };
type PosInventory = { id: string; storeId: string; sku: string; onHand: number; updatedAt?: unknown };
type PosEvent = { id: string; connectionId: string; storeId: string; type: string; receivedAt?: unknown };
type Capability = { id: string; label: string; description: string };

const CAPABILITIES: Capability[] = [
  { id: 'orders.push', label: 'إرسال الطلبات', description: 'إرسال الطلبات إلى نقطة الاستقبال الآمنة في نظام الكاشير' },
  { id: 'inventory.write', label: 'استقبال تحديثات المخزون', description: 'استقبال كميات الأصناف والباركود والأسعار من نظام POS' },
  { id: 'orders.status', label: 'استقبال حالات الطلب', description: 'استقبال تأكيد استلام الطلب وحالته الخارجية من نظام POS' },
];

export default function AdminPosScreen() {
  useStatusBar();
  const { c } = useTheme();
  const pad = useAdminPadding('push');
  const brands = useApp((s) => s.brands);
  const [connections, setConnections] = useState<PosConnection[]>([]);
  const [jobs, setJobs] = useState<PosJob[]>([]);
  const [inventory, setInventory] = useState<PosInventory[]>([]);
  const [events, setEvents] = useState<PosEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [storeId, setStoreId] = useState(brands[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>(['orders.push', 'inventory.write']);
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [dispatchIds, setDispatchIds] = useState<Record<string, string>>({});
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const storeName = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const refresh = useCallback(async () => {
    const [connectionResult, jobResult, inventoryResult, eventResult] = await Promise.all([
      api.get<{ connections: PosConnection[] }>('/v1/admin/pos/connections'),
      api.get<{ jobs: PosJob[] }>('/v1/admin/pos/jobs?limit=30'),
      api.get<{ inventory: PosInventory[] }>('/v1/admin/pos/inventory?limit=50'),
      api.get<{ events: PosEvent[] }>('/v1/admin/pos/events?limit=30'),
    ]);
    setConnections(connectionResult.connections ?? []);
    setJobs(jobResult.jobs ?? []);
    setInventory(inventoryResult.inventory ?? []);
    setEvents(eventResult.events ?? []);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'تعذر تحميل إعدادات POS')).finally(() => setLoading(false));
  }, [refresh]);

  const toggleCapability = (id: string) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);

  const createConnection = async () => {
    if (saving) return;
    setError('');
    if (!name.trim() || !webhookUrl.trim() || !storeId || selected.length === 0) {
      setError('أكمل اسم الاتصال ورابط Webhook واختر الفرع والصلاحيات.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ connection: PosConnection; sharedSecret: string }>('/v1/admin/pos/connections', {
        name: name.trim(), provider: 'custom_webhook', storeId, webhookUrl: webhookUrl.trim(),
        capabilities: selected, enabled: true,
      });
      setConnections((current) => [result.connection, ...current]);
      setOneTimeSecret(result.sharedSecret);
      setName('');
      setWebhookUrl('');
      setSelected(['orders.push', 'inventory.write']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الاتصال. راجع إعداد POS_ENCRYPTION_KEY على الخادم.');
    } finally {
      setSaving(false);
    }
  };

  const removeConnection = async (id: string) => {
    try {
      await api.delete(`/v1/admin/pos/connections/${encodeURIComponent(id)}`);
      setConnections((current) => current.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حذف الاتصال');
    }
  };

  const rotateSecret = async (id: string) => {
    try {
      const result = await api.post<{ sharedSecret: string }>(`/v1/admin/pos/connections/${encodeURIComponent(id)}/rotate-secret`, {});
      setOneTimeSecret(result.sharedSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تدوير مفتاح الاتصال');
    }
  };

  const dispatchOrder = async (connectionId: string) => {
    const orderId = (dispatchIds[connectionId] || '').trim();
    if (!orderId) { setError('اكتب رقم الطلب أولًا.'); return; }
    setError(''); setNotice(''); setDispatchingId(connectionId);
    try {
      const result = await api.post<{ jobId: string; status: string }>(`/v1/admin/pos/connections/${encodeURIComponent(connectionId)}/dispatch-order`, { orderId });
      setNotice(`تم إرسال ${orderId} إلى POS. حالة الإرسال: ${result.status}.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال الطلب إلى POS');
    } finally { setDispatchingId(null); }
  };

  const cardStyle = { backgroundColor: c.surface1, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 } as const;
  const inputStyle = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, color: c.text1, paddingHorizontal: 13, textAlign: 'right' as const, fontSize: 14 };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={[pad, { gap: 14, paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
        <View style={cardStyle}>
          <Txt s={20} w={800} color={c.text1} align="right">ربط نظام POS سحابي</Txt>
          <Txt s={13} color={c.text3} align="right">أنشئ موصل Webhook موحدًا لربط الكاشير. لازم يكون رابط الاستقبال HTTPS عامًا، ومفتاح التشفير مضبوطًا على الخادم.</Txt>
          <TextInput value={name} onChangeText={setName} placeholder="اسم الاتصال — مثال: كاشير الفرع الرئيسي" placeholderTextColor={c.text3} style={inputStyle} />
          <TextInput value={webhookUrl} onChangeText={setWebhookUrl} autoCapitalize="none" keyboardType="url" placeholder="https://pos.example.com/tawseela/orders" placeholderTextColor={c.text3} style={inputStyle} />
          <Txt s={13} w={700} color={c.text1} align="right">الفرع المرتبط</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {brands.map((brand) => (
              <PressableScale key={brand.id} onPress={() => setStoreId(brand.id)} style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: storeId === brand.id ? '#4c5b42' : c.bg, borderWidth: 1, borderColor: storeId === brand.id ? '#4c5b42' : c.line }}>
                <Txt s={12} w={700} color={storeId === brand.id ? '#FFFFFF' : c.text1}>{brand.name}</Txt>
              </PressableScale>
            ))}
          </View>
          <Txt s={13} w={700} color={c.text1} align="right">الصلاحيات المطلوبة</Txt>
          {CAPABILITIES.map((cap) => {
            const active = selected.includes(cap.id);
            return (
              <PressableScale key={cap.id} onPress={() => toggleCapability(cap.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: active ? '#4c5b42' : c.line, backgroundColor: active ? '#4c5b42' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {active ? <Txt s={13} w={800} color="#FFFFFF">✓</Txt> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={13} w={700} color={c.text1} align="right">{cap.label}</Txt>
                  <Txt s={11} color={c.text3} align="right">{cap.description}</Txt>
                </View>
              </PressableScale>
            );
          })}
          <OutlineButton label={saving ? 'جارٍ إنشاء الاتصال…' : 'إنشاء اتصال POS'} icon="link" height={48} onPress={() => void createConnection()} />
          {error ? <Txt s={12} color="#D14343" align="right">{error}</Txt> : null}
          {notice ? <Txt s={12} color="#4c5b42" align="right">{notice}</Txt> : null}
        </View>

        {oneTimeSecret ? (
          <View style={[cardStyle, { borderColor: '#4c5b42' }]}>
            <Txt s={16} w={800} color={c.text1} align="right">مفتاح الاتصال — يظهر مرة واحدة</Txt>
            <Txt s={12} color={c.text3} align="right">انسخه وضعه في نظام POS. لا تشاركه مع أي شخص، ولن يظهر مرة أخرى بعد مغادرة هذه الشاشة.</Txt>
            <Txt s={12} color={c.text1}>{oneTimeSecret}</Txt>
            <OutlineButton label="نسخ المفتاح" icon="content_copy" height={42} onPress={() => GenUI.copy(oneTimeSecret)} />
            <OutlineButton label="إخفاء المفتاح"  height={42} onPress={() => setOneTimeSecret('')} />
          </View>
        ) : null}

        <View style={cardStyle}>
          <Txt s={18} w={800} color={c.text1} align="right">الاتصالات المرتبطة</Txt>
          {loading ? <Txt s={13} color={c.text3} align="right">جارٍ التحميل…</Txt> : null}
          {!loading && connections.length === 0 ? <Txt s={13} color={c.text3} align="right">لا توجد أنظمة POS مرتبطة حتى الآن.</Txt> : null}
          {connections.map((connection) => (
            <View key={connection.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, gap: 7 }}>
              <Txt s={15} w={800} color={c.text1} align="right">{connection.name}</Txt>
              <Txt s={12} color={c.text3} align="right">{storeName.get(connection.storeId) ?? connection.storeId} · {'Cloud Webhook'}</Txt>
              <Txt s={12} color={connection.lastError ? '#D14343' : connection.enabled ? '#4c5b42' : c.text3} align="right">{!connection.enabled ? 'متوقف' : connection.lastError || (connection.status === 'connected' ? 'متصل' : connection.status === 'error' ? 'يحتاج مراجعة' : 'في انتظار أول اتصال')}</Txt>
              <Txt s={11} color={c.text3} align="right">{connection.capabilities.join(' · ')}</Txt>
              <Txt s={11} color={c.text3} align="right">استقبال أحداث المخزون: POST /v1/pos/{connection.id}/events</Txt>
              {connection.capabilities.includes('orders.push') ? (
                <View style={{ gap: 8 }}>
                  <TextInput value={dispatchIds[connection.id] ?? ''} onChangeText={(value) => setDispatchIds((current) => ({ ...current, [connection.id]: value }))} placeholder="رقم الطلب — EK-4822" placeholderTextColor={c.text3} style={inputStyle} autoCapitalize="characters" />
                  <OutlineButton label={dispatchingId === connection.id ? 'جارٍ الإرسال…' : 'إرسال الطلب إلى POS'} height={40} onPress={() => void dispatchOrder(connection.id)} />
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <OutlineButton label="تدوير المفتاح" icon="sync" height={38} onPress={() => void rotateSecret(connection.id)} />
                <OutlineButton label="حذف الاتصال" icon="delete" height={38} onPress={() => void removeConnection(connection.id)} />
              </View>
            </View>
          ))}
          <OutlineButton label="تحديث الحالة" icon="sync" height={42} onPress={() => void refresh().catch((e) => setError(String(e)))} />
        </View>

        <View style={cardStyle}>
          <Txt s={18} w={800} color={c.text1} align="right">المخزون القادم من أنظمة POS</Txt>
          {inventory.length === 0 ? <Txt s={13} color={c.text3} align="right">لم تصل تحديثات مخزون بعد.</Txt> : inventory.map((row) => (
            <View key={row.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt s={14} w={800} color={c.text1} tabular>{row.onHand}</Txt>
              <View style={{ flex: 1, gap: 3 }}>
                <Txt s={13} w={700} color={c.text1} align="right">{row.sku}</Txt>
                <Txt s={11} color={c.text3} align="right">{storeName.get(row.storeId) ?? row.storeId}</Txt>
              </View>
            </View>
          ))}
        </View>

        <View style={cardStyle}>
          <Txt s={18} w={800} color={c.text1} align="right">أحداث المزامنة الواردة</Txt>
          {events.length === 0 ? <Txt s={13} color={c.text3} align="right">لا توجد أحداث واردة بعد.</Txt> : events.map((event) => (
            <View key={event.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 9, gap: 3 }}>
              <Txt s={13} w={700} color={c.text1} align="right">{event.type}</Txt>
              <Txt s={11} color={c.text3} align="right">{storeName.get(event.storeId) ?? event.storeId} · {event.connectionId}</Txt>
            </View>
          ))}
        </View>

        <View style={cardStyle}>
          <Txt s={18} w={800} color={c.text1} align="right">سجل إرسال الطلبات</Txt>
          {jobs.length === 0 ? <Txt s={13} color={c.text3} align="right">لا توجد عمليات إرسال حتى الآن.</Txt> : jobs.map((job) => (
            <View key={job.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 9, gap: 4 }}>
              <Txt s={13} w={700} color={c.text1} align="right">{job.orderId}</Txt>
              <Txt s={12} color={job.status === 'sent' ? '#4c5b42' : job.status === 'failed' ? '#D14343' : c.text3} align="right">{job.status}</Txt>
              {job.lastError ? <Txt s={11} color="#D14343" align="right">{job.lastError}</Txt> : null}
            </View>
          ))}
        </View>

        <View style={cardStyle}>
          <Txt s={15} w={800} color={c.text1} align="right">مهم قبل التشغيل الفعلي</Txt>
          <Txt s={12} color={c.text3} align="right">هذه المرحلة توفر موصل Webhook موحدًا، وتشفيرًا لمفتاحه، وإرسال الطلبات، واستقبال تحديثات المخزون الموقعة. تكاملات Loyverse وFoodics وOdoo والطابعات المحلية تحتاج موصلًا خاصًا بكل مزود واعتماداته الرسمية؛ لن تظهر كأنها متصلة قبل تنفيذ واختبار الموصل الفعلي.</Txt>
        </View>
      </ScrollView>
      <AdminHeader title="Smart POS" />
    </View>
  );
}
