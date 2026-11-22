import { useCallback, useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { AdminHeader, useAdminPadding } from '@/components/admin/admin-ui';
import { OutlineButton } from '@/components/ui/buttons';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { api } from '@/lib/api';
import { useTheme } from '@/theme/theme';

type Audience = 'customers' | 'team' | 'all';
type Category = 'general' | 'offer' | 'important';
type Campaign = {
  id: string; title: string; body: string; audience: Audience; category: Category;
  status: string; audienceCount: number; deviceCount: number; sent: number; failed: number; createdAt: number | null;
};

const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  { id: 'customers', label: 'العملاء', hint: 'حسابات العملاء فقط' },
  { id: 'team', label: 'فريق العمل', hint: 'الموظفون والمندوبون' },
  { id: 'all', label: 'الجميع', hint: 'العملاء وفريق العمل' },
];
const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'general', label: 'إشعار عام' },
  { id: 'offer', label: 'عرض وخصم' },
  { id: 'important', label: 'تنبيه مهم' },
];

export default function AdminNotificationsScreen() {
  useStatusBar();
  const { c } = useTheme();
  const pad = useAdminPadding('push');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('customers');
  const [category, setCategory] = useState<Category>('general');
  const [sound, setSound] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const result = await api.get<{ campaigns: Campaign[] }>('/v1/admin/notifications/history?limit=20');
      setHistory(result.campaigns ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر تحميل سجل الإشعارات');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  const send = async () => {
    if (sending) return;
    if (title.trim().length < 2 || body.trim().length < 2) {
      setError('اكتب عنوان الإشعار ونص الرسالة أولًا.');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post<{
        campaignId: string; audienceCount: number; deviceCount: number; sent: number; failed: number;
      }>('/v1/admin/notifications/send', {
        title: title.trim(), body: body.trim(), audience, category, sound,
      }, { timeoutMs: 120_000 });
      setNotice('تم قبول ' + result.sent + ' إشعار للإرسال. الأجهزة المسجلة: ' + result.deviceCount +
        '، المستهدفون: ' + result.audienceCount + '، تعذر إرسال: ' + result.failed + '.');
      setTitle('');
      setBody('');
      await refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إرسال الإشعارات');
    } finally {
      setSending(false);
    }
  };

  const card = { backgroundColor: c.surface1, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 } as const;
  const input = { minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, color: c.text1, paddingHorizontal: 13, paddingVertical: 12, textAlign: 'right' as const, fontSize: 14 };
  const chip = (active: boolean) => ({
    borderRadius: 14, borderWidth: 1, borderColor: active ? '#4c5b42' : c.line,
    backgroundColor: active ? '#4c5b42' : c.bg, paddingHorizontal: 12, paddingVertical: 10, gap: 3,
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={[pad, { gap: 14, paddingBottom: 130 }]} showsVerticalScrollIndicator={false}>
        <View style={card}>
          <Txt s={20} w={800} color={c.text1} align="right">إرسال إشعار جديد</Txt>
          <Txt s={13} color={c.text3} align="right">اكتب الرسالة وحدد من سيستقبلها. ستصل كإشعار على شاشة الهاتف حتى لو كان تطبيق توصيلة مغلقًا، بشرط السماح بالإشعارات على جهاز المستلم.</Txt>
          <Txt s={13} w={700} color={c.text1} align="right">عنوان الإشعار</Txt>
          <TextInput value={title} onChangeText={setTitle} placeholder="مثال: عرض خاص من توصيلة" placeholderTextColor={c.text3} style={input} maxLength={90} />
          <Txt s={13} w={700} color={c.text1} align="right">نص الرسالة</Txt>
          <TextInput value={body} onChangeText={setBody} placeholder="اكتب تفاصيل الرسالة التي ستظهر للعميل…" placeholderTextColor={c.text3} style={[input, { minHeight: 112, textAlignVertical: 'top' }]} multiline maxLength={500} />
          <Txt s={14} w={800} color={c.text1} align="right">إرسال إلى</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {AUDIENCES.map((option) => (
              <PressableScale key={option.id} onPress={() => setAudience(option.id)} style={chip(audience === option.id)}>
                <Txt s={13} w={700} color={audience === option.id ? '#FFFFFF' : c.text1}>{option.label}</Txt>
                <Txt s={10} color={audience === option.id ? '#E7EBDD' : c.text3}>{option.hint}</Txt>
              </PressableScale>
            ))}
          </View>
          <Txt s={14} w={800} color={c.text1} align="right">نوع الإشعار</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map((option) => (
              <PressableScale key={option.id} onPress={() => setCategory(option.id)} style={chip(category === option.id)}>
                <Txt s={12} w={700} color={category === option.id ? '#FFFFFF' : c.text1}>{option.label}</Txt>
              </PressableScale>
            ))}
          </View>
          <PressableScale onPress={() => setSound((value) => !value)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: sound ? '#4c5b42' : c.line, backgroundColor: sound ? '#4c5b42' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {sound ? <Txt s={14} w={800} color="#FFFFFF">✓</Txt> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt s={13} w={700} color={c.text1} align="right">تشغيل صوت الإشعار</Txt>
              <Txt s={11} color={c.text3} align="right">يمكن للمستلم التحكم في الصوت من إعدادات هاتفه</Txt>
            </View>
          </PressableScale>
          <View style={{ borderRadius: 13, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, padding: 13, gap: 5 }}>
            <Txt s={11} color={c.text3} align="right">معاينة الإشعار</Txt>
            <Txt s={15} w={800} color={c.text1} align="right">{title.trim() || 'عنوان الإشعار'}</Txt>
            <Txt s={13} color={c.text2} align="right">{body.trim() || 'سيظهر نص الرسالة هنا على شاشة الهاتف.'}</Txt>
          </View>
          <OutlineButton label={sending ? 'جارٍ إرسال الإشعارات…' : 'إرسال الآن'} icon="send" height={50} onPress={() => void send()} />
          {error ? <Txt s={12} color="#D14343" align="right">{error}</Txt> : null}
          {notice ? <Txt s={12} color="#4c5b42" align="right">{notice}</Txt> : null}
        </View>

        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <OutlineButton label="تحديث" icon="sync" height={38} onPress={() => void refreshHistory()} />
            <Txt s={18} w={800} color={c.text1}>سجل الإرسال</Txt>
          </View>
          {loadingHistory ? <Txt s={12} color={c.text3} align="right">جارٍ تحميل السجل…</Txt> : null}
          {!loadingHistory && history.length === 0 ? <Txt s={12} color={c.text3} align="right">لا توجد إشعارات مرسلة بعد.</Txt> : null}
          {history.map((item) => (
            <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10, gap: 4 }}>
              <Txt s={14} w={700} color={c.text1} align="right">{item.title}</Txt>
              <Txt s={12} color={c.text3} align="right">{item.body}</Txt>
              <Txt s={11} color={c.text3} align="right">
                {item.audience === 'all' ? 'الجميع' : item.audience === 'team' ? 'فريق العمل' : 'العملاء'} · أُرسل: {item.sent} · فشل: {item.failed} · {item.status}
              </Txt>
              {item.createdAt ? <Txt s={10} color={c.text3} align="right">{new Date(item.createdAt).toLocaleString('ar-EG')}</Txt> : null}
            </View>
          ))}
        </View>
      </ScrollView>
      <AdminHeader title="الإشعارات" />
    </View>
  );
}
