import { ScrollView, StyleSheet, View } from 'react-native';

import { AdminHeader, useAdminPadding } from '@/components/admin/admin-ui';
import { StatusPill } from '@/components/ui/controls';
import { Avatar } from '@/components/ui/media';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { cnt, initials, money } from '@/lib/format';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

export default function AdminCustomers() {
  return (
    <RevealScope>
      <Customers />
    </RevealScope>
  );
}

function Customers() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('push');
  const customers = useApp((s) => s.customers);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={[pad, { gap: 10 }]} showsVerticalScrollIndicator={false}>
        {!customers.length ? (
          <Txt s={14} w={500} color={c.text3} align="center" style={{ padding: 24 }}>
            Loading customers…
          </Txt>
        ) : null}
        {customers.map((cu, i) => {
          const tc = cu.tier === 'VIP' ? c.accentText : cu.tier === 'New' ? c.info : c.text2;
          return (
            <Reveal key={cu.id} i={Math.min(i, 12)}>
              <View style={[styles.row, { borderColor: c.line, backgroundColor: c.surface1 }]}>
                <Avatar text={initials(cu.name)} size={44} fontSize={13.5} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt s={14.5} w={700}>
                    {cu.name}
                  </Txt>
                  <Txt s={12} color={c.text3}>
                    {cnt(cu.orders, 'order')} · {money(cu.spent)}
                  </Txt>
                </View>
                <StatusPill label={cu.tier} color={tc} padH={9} />
              </View>
            </Reveal>
          );
        })}
      </ScrollView>
      <AdminHeader title="Customers" back />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1 },
});
