import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Icon, type IconName } from '@/components/icons/icon';
import { ROLE_ICON } from '@/components/staff/staff-ui';
import { AccentButton, OutlineButton } from '@/components/ui/buttons';
import { Toggle } from '@/components/ui/controls';
import { Eyebrow, ListCard, ListRow, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { signOutAccount } from '@/lib/account';
import { isStaff, ROLE_INFO } from '@/lib/contract';
import { cnt, initials, money } from '@/lib/format';
import { payLabel, selectMyOrders, useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { fixed } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

type Href = Parameters<typeof router.push>[0];

export default function ProfileScreen() {
  useStatusBar();
  const { c } = useTheme();
  const chrome = useChrome();
  const st = useApp(
    useShallow((s) => ({
      points: s.points,
      credit: s.credit,
      orderNotif: s.orderNotif,
      myCount: selectMyOrders(s).length,
      active: selectMyOrders(s).some((o) => o.step < 3),
      upcoming: s.bookings.filter((b) => b.mine && b.status === 0).length,
      stories: s.posts.filter((p) => p.on).length,
      unread: s.inbox.filter((n) => n.unread).length,
      addrCount: s.addrs.length,
      addrTag: (s.addrs[s.addr] ?? s.addrs[0]).tag,
      pay: payLabel(s, true),
    })),
  );
  const user = useSession((s) => s.user);
  const role = useSession((s) => s.role);
  const isAdmin = !!user && role === 'admin';
  const staffRole = user && isStaff(role) && role !== 'admin' ? role : null;
  const tier = st.points >= 2500 ? 'Gold' : st.points >= 1000 ? 'Silver' : 'Bronze';
  const go =
    (href: Href, needsUser = false) =>
    () => {
      if (needsUser && !user) router.push('/login');
      else router.push(href);
    };

  const profRows: { icon: IconName; l: string; s: string; go: () => void }[] = [
    { icon: 'receipt_long', l: 'سجل الطلبات', s: st.active ? 'طلب في الطريق' : cnt(st.myCount, 'طلب سابق'), go: go('/orders', true) },
    { icon: 'loyalty', l: 'مكافآت توصيلة', s: `${st.points.toLocaleString('en-US')} نقطة · ${tier === 'Gold' ? 'ذهبي' : tier === 'Silver' ? 'فضي' : 'برونزي'}`, go: go('/rewards') },
    { icon: 'event_seat', l: 'حجوزاتي', s: st.upcoming ? `${st.upcoming} حجز قادم` : 'احجز طاولتك الآن', go: go('/my-bookings') },
    { icon: 'auto_stories', l: 'مجلة توصيلة', s: `${st.stories} قصة من مطبخنا`, go: go('/journal') },
    { icon: 'notifications', l: 'الإشعارات', s: st.unread ? `${st.unread} إشعار غير مقروء` : 'أنت على اطلاع بكل جديد', go: go('/inbox') },
  ];
  const acctRows: { icon: IconName; l: string; s: string; go: () => void }[] = [
    { icon: 'person', l: 'تعديل الملف الشخصي', s: 'الاسم والبريد الإلكتروني ورقم الهاتف', go: go('/edit-profile', true) },
    { icon: 'location_on', l: 'عناويني', s: `${cnt(st.addrCount, 'عنوان محفوظ')} · ${st.addrTag} الافتراضي`, go: go('/addresses') },
    { icon: 'credit_card', l: 'طرق الدفع', s: `${st.pay} · رصيد ${money(st.credit)}`, go: go('/payments') },
    { icon: 'settings', l: 'الإعدادات', s: 'اللغة والإشعارات والخصوصية', go: go('/settings') },
    { icon: 'help', l: 'المساعدة', s: 'الطلبات والاسترداد والتواصل معنا', go: go('/help') },
  ];

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: chrome.contentTop, paddingBottom: chrome.bottomPad, paddingHorizontal: 20, gap: 14, direction: 'rtl' }}
          showsVerticalScrollIndicator={false}
        >
          <Reveal i={0} style={{ paddingTop: 8, paddingHorizontal: 4 }}>
            <Txt s={32} w={700} ls={-0.03} style={{ textAlign: 'right' }}>
              توصيلة
            </Txt>
          </Reveal>

          <Reveal i={1}>
            <View style={[styles.userCard, { backgroundColor: c.surface1, borderColor: c.line, direction: 'rtl' }]}>
              <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
                {user ? (
                  <Txt s={22} w={600} color={c.accentText}>
                    {initials(user.name)}
                  </Txt>
                ) : (
                  <Icon name="person" size={28} fill color={c.accentText} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Txt s={18} w={700} numberOfLines={1}>
                  {user ? user.name : 'زائر'}
                </Txt>
                <Txt s={13} lh={1.4} color={c.text2}>
                  {user ? user.email : 'سجّل الدخول للطلب ومتابعة التوصيل'}
                </Txt>
              </View>
              {!user ? (
                <AccentButton label="تسجيل الدخول" height={42} fontSize={14} onPress={() => router.push('/login')} style={{ paddingHorizontal: 16 }} />
              ) : null}
            </View>
          </Reveal>

          {/* the role comes from the server (Users & roles in the console) */}
          {isAdmin ? (
            <Reveal i={1}>
              <PressableScale onPress={() => router.push('/admin')} scaleTo={0.98} style={styles.admin}>
                <View style={styles.adminTile}>
                  <Icon name="storefront" size={22} fill color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={15} w={700} color={fixed.paper}>
                    إدارة المطعم
                  </Txt>
                  <Txt s={12.5} color={fixed.paperA(0.72)}>
                    الطلبات والقائمة والعروض والإعدادات
                  </Txt>
                </View>
                <Icon name="chevron_right" size={22} color={fixed.paper} />
              </PressableScale>
            </Reveal>
          ) : null}
          {staffRole ? (
            <Reveal i={1}>
              <PressableScale
                onPress={() => router.push('/staff')}
                scaleTo={0.98}
                style={styles.admin}
                accessibilityLabel={`Staff, ${ROLE_INFO[staffRole].label}`}
              >
                <View style={styles.adminTile}>
                  <Icon name={ROLE_ICON[staffRole]} size={22} fill color="#FFFFFF" />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={15} w={700} color={fixed.paper}>
                    فريق العمل · {ROLE_INFO[staffRole].label}
                  </Txt>
                  <Txt s={12.5} color={fixed.paperA(0.72)}>
                    مهامي — {ROLE_INFO[staffRole].desc.toLowerCase()}
                  </Txt>
                </View>
                <Icon name="chevron_right" size={22} color={fixed.paper} />
              </PressableScale>
            </Reveal>
          ) : null}

          <Reveal i={2}>
            <Eyebrow style={{ paddingTop: 6, paddingHorizontal: 4 }}>استكشف</Eyebrow>
          </Reveal>
          <Reveal i={2}>
            <ListCard radius={24}>
              {profRows.map((r, i) => (
                <ListRow key={r.l} icon={r.icon} title={r.l} sub={r.s} onPress={r.go} last={i === profRows.length - 1} bare minHeight={88} />
              ))}
            </ListCard>
          </Reveal>

          <Reveal i={3}>
            <Eyebrow style={{ paddingTop: 18, paddingHorizontal: 4 }} size={12}>الحساب</Eyebrow>
          </Reveal>
          <Reveal i={3}>
            <ListCard radius={24}>
              {acctRows.map((r, i) => (
                <ListRow key={r.l} icon={r.icon} title={r.l} sub={r.s} onPress={r.go} last={i === acctRows.length - 1} bare minHeight={88} />
              ))}
            </ListCard>
          </Reveal>
          <Reveal i={3}>
            <ListCard radius={24}>
              <PressableScale
                onPress={() => useApp.getState().setOrderNotif(!st.orderNotif)}
                scaleTo={0.985}
                style={[styles.toggleRow, { flexDirection: 'row-reverse' }]}
                accessibilityRole="switch"
                accessibilityState={{ checked: st.orderNotif }}
              >
                <Txt s={15.5} w={600} style={{ textAlign: 'right' }}>
                  إشعارات الطلبات
                </Txt>
                <Toggle on={st.orderNotif} />
              </PressableScale>
            </ListCard>
          </Reveal>

          {user ? (
            <OutlineButton
              label="تسجيل الخروج"
              color={c.err}
              onPress={() => {
                void signOutAccount();
                router.navigate('/home');
                router.push('/login');
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, borderWidth: 1 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: fixed.ink },
  adminTile: { width: 42, height: 42, borderRadius: 14, backgroundColor: fixed.orange, alignItems: 'center', justifyContent: 'center' },
  toggleRow: { minHeight: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
