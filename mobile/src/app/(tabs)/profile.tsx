import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { Icon, type IconName } from '@/components/icons/icon';
import { ROLE_ICON } from '@/components/staff/staff-ui';
import { AccentButton, OutlineButton } from '@/components/ui/buttons';
import { Toggle } from '@/components/ui/controls';
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

type MenuRow = { icon: IconName; title: string; sub: string; onPress: () => void };

function GroupCard({ rows }: { rows: MenuRow[] }) {
  const { c } = useTheme();
  return (
    <View style={[styles.groupCard, { backgroundColor: c.surface1, borderColor: c.line }]}>
      {rows.map((row, index) => (
        <PressableScale
          key={row.title}
          onPress={row.onPress}
          scaleTo={0.99}
          style={[styles.menuRow, { borderBottomColor: c.line, borderBottomWidth: index === rows.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
          accessibilityRole="button"
        >
          <View style={styles.rowText}>
            <Txt s={16} w={600} style={styles.rtlText}>{row.title}</Txt>
            <Txt s={13} w={400} color={c.text3} style={styles.rtlText} numberOfLines={1}>{row.sub}</Txt>
          </View>
          <Icon name={row.icon} size={27} color={c.text2} />
          <View style={styles.chevron}>
            <Icon name="chevron_right" size={22} color={c.text3} />
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { c } = useTheme();
  return <Txt s={12} w={600} color={c.text3} style={styles.sectionLabel}>{children}</Txt>;
}

export default function ProfileScreen() {
  useStatusBar();
  const { c } = useTheme();
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
      addrTag: (s.addrs[s.addr] ?? s.addrs[0])?.tag ?? 'المنزل',
      pay: payLabel(s, true),
    })),
  );
  const user = useSession((s) => s.user);
  const role = useSession((s) => s.role);
  const isAdmin = !!user && role === 'admin';
  const staffRole = user && isStaff(role) && role !== 'admin' ? role : null;
  const tier = st.points >= 2500 ? 'Gold' : st.points >= 1000 ? 'Silver' : 'Bronze';
  const go = (href: Href, needsUser = false) => () => {
    if (needsUser && !user) router.push('/login');
    else router.push(href);
  };

  const exploreRows: MenuRow[] = [
    { icon: 'receipt_long', title: 'سجل الطلبات', sub: st.active ? 'طلب في الطريق' : cnt(st.myCount, 'طلب سابق'), onPress: go('/orders', true) },
    { icon: 'loyalty', title: 'مكافآت توصيلة', sub: `${st.points.toLocaleString('en-US')} نقطة · ${tier === 'Gold' ? 'ذهبي' : tier === 'Silver' ? 'فضي' : 'برونزي'}`, onPress: go('/rewards') },
    { icon: 'event_seat', title: 'حجوزاتي', sub: st.upcoming ? `${st.upcoming} حجز قادم` : 'احجز طاولتك الآن', onPress: go('/my-bookings') },
    { icon: 'auto_stories', title: 'مجلة توصيلة', sub: `${st.stories} قصة من مطبخنا`, onPress: go('/journal') },
    { icon: 'notifications', title: 'الإشعارات', sub: st.unread ? `${st.unread} إشعار غير مقروء` : 'أنت على اطلاع بكل جديد', onPress: go('/inbox') },
  ];
  const accountRows: MenuRow[] = [
    { icon: 'person', title: 'تعديل الملف الشخصي', sub: 'الاسم والبريد الإلكتروني ورقم الهاتف', onPress: go('/edit-profile', true) },
    { icon: 'location_on', title: 'عناويني', sub: `${cnt(st.addrCount, 'عنوان محفوظ')} · ${st.addrTag} الافتراضي`, onPress: go('/addresses') },
    { icon: 'credit_card', title: 'طرق الدفع', sub: `${st.pay} · رصيد ${money(st.credit)}`, onPress: go('/payments') },
    { icon: 'settings', title: 'الإعدادات', sub: 'اللغة والإشعارات والخصوصية', onPress: go('/settings') },
    { icon: 'help', title: 'المساعدة', sub: 'الطلبات والاسترداد والتواصل معنا', onPress: go('/help') },
  ];

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Reveal i={0}>
            <Txt s={31} w={700} style={styles.pageTitle}>توصيلة</Txt>
          </Reveal>

          <Reveal i={1}>
            <View style={[styles.userCard, { backgroundColor: c.surface1, borderColor: c.line }]}>
              <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
                {user ? (
                  <Txt s={22} w={700} color={c.accentText}>{initials(user.name)}</Txt>
                ) : (
                  <Icon name="person" size={28} fill color={c.accentText} />
                )}
              </View>
              <View style={styles.userInfo}>
                <Txt s={19} w={700} style={styles.rtlText} numberOfLines={1}>{user ? user.name : 'زائر'}</Txt>
                <Txt s={13} color={c.text2} style={styles.rtlText} numberOfLines={1}>
                  {user ? user.email : 'سجّل الدخول للطلب ومتابعة التوصيل'}
                </Txt>
              </View>
              {!user ? <AccentButton label="تسجيل الدخول" height={42} fontSize={13} onPress={() => router.push('/login')} style={{ paddingHorizontal: 12 }} /> : null}
            </View>
          </Reveal>

          {isAdmin ? (
            <Reveal i={1}>
              <PressableScale onPress={() => router.push('/admin')} scaleTo={0.985} style={styles.adminCard}>
                <View style={styles.adminIcon}><Icon name="storefront" size={25} color="#FFFFFF" /></View>
                <View style={styles.adminText}>
                  <Txt s={16} w={600} color={fixed.paper} style={styles.rtlText}>إدارة المطعم</Txt>
                  <Txt s={13} color={fixed.paperA(0.72)} style={styles.rtlText}>الطلبات والقائمة والعروض والإعدادات</Txt>
                </View>
                <Icon name="chevron_right" size={23} color={fixed.paper} />
              </PressableScale>
            </Reveal>
          ) : null}
          {staffRole ? (
            <Reveal i={1}>
              <PressableScale onPress={() => router.push('/staff')} scaleTo={0.985} style={styles.adminCard} accessibilityLabel={`Staff, ${ROLE_INFO[staffRole].label}`}>
                <View style={styles.adminIcon}><Icon name={ROLE_ICON[staffRole]} size={25} color="#FFFFFF" /></View>
                <View style={styles.adminText}>
                  <Txt s={16} w={600} color={fixed.paper} style={styles.rtlText}>فريق العمل · {ROLE_INFO[staffRole].label}</Txt>
                  <Txt s={13} color={fixed.paperA(0.72)} style={styles.rtlText}>مهامي — {ROLE_INFO[staffRole].desc.toLowerCase()}</Txt>
                </View>
                <Icon name="chevron_right" size={23} color={fixed.paper} />
              </PressableScale>
            </Reveal>
          ) : null}

          <Reveal i={2}><SectionLabel>استكشف</SectionLabel></Reveal>
          <Reveal i={2}><GroupCard rows={exploreRows} /></Reveal>

          <Reveal i={3}><SectionLabel>الحساب</SectionLabel></Reveal>
          <Reveal i={3}><GroupCard rows={accountRows} /></Reveal>

          <Reveal i={3}>
            <View style={[styles.toggleCard, { backgroundColor: c.surface1, borderColor: c.line }]}>
              <PressableScale
                onPress={() => useApp.getState().setOrderNotif(!st.orderNotif)}
                scaleTo={0.99}
                style={styles.toggleRow}
                accessibilityRole="switch"
                accessibilityState={{ checked: st.orderNotif }}
              >
                <View style={styles.toggleLabel}>
                  <Txt s={16} w={600} style={styles.rtlText}>إشعارات الطلبات</Txt>
                  <Txt s={13} color={c.text3} style={styles.rtlText}>التحكم في تنبيهات حالة طلباتك</Txt>
                </View>
                <Toggle on={st.orderNotif} />
              </PressableScale>
            </View>
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

          <Txt s={12} color={c.text3} align="center" style={styles.versionText}>توصيلة</Txt>
        </ScrollView>
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingTop: 58, paddingBottom: 150, paddingHorizontal: 20, gap: 18, direction: 'rtl' },
  pageTitle: { textAlign: 'right', writingDirection: 'rtl', paddingHorizontal: 4, marginBottom: 2 },
  userCard: { minHeight: 112, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, padding: 16, borderRadius: 26, borderWidth: 1 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-end' },
  adminCard: { minHeight: 92, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 26, backgroundColor: '#080808' },
  adminIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: fixed.orange, alignItems: 'center', justifyContent: 'center' },
  adminText: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-end' },
  sectionLabel: { textAlign: 'right', writingDirection: 'rtl', paddingHorizontal: 6, paddingTop: 12, marginBottom: -6 },
  groupCard: { borderRadius: 26, borderWidth: 1, overflow: 'hidden' },
  menuRow: { minHeight: 88, flexDirection: 'row-reverse', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14 },
  rowText: { flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
  chevron: { width: 22, alignItems: 'center', justifyContent: 'center' },
  toggleCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  toggleRow: { minHeight: 86, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, gap: 16 },
  toggleLabel: { flex: 1, alignItems: 'flex-end', gap: 4 },
  versionText: { paddingVertical: 8 },
});
