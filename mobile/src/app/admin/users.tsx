import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AccentPill, AdminHeader, SearchField, useAdminPadding } from '@/components/admin/admin-ui';
import { Icon } from '@/components/icons/icon';
import { RolePill } from '@/components/staff/staff-ui';
import { OutlineButton } from '@/components/ui/buttons';
import { Chip, Spinner } from '@/components/ui/controls';
import { Avatar } from '@/components/ui/media';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { ROLE_INFO, type Role } from '@/lib/contract';
import { cnt, initials, money } from '@/lib/format';
import { ROLE_ORDER, loadUsers, useTeam } from '@/lib/team';
import { useTheme } from '@/theme/theme';

export default function AdminUsers() {
  return (
    <RevealScope>
      <Users />
    </RevealScope>
  );
}

type Filter = 'all' | 'staff' | Role;

const match = (role: Role, f: Filter) => f === 'all' || (f === 'staff' ? role !== 'user' : role === f);
const openUser = (uid: string) => router.push({ pathname: '/admin/user/[uid]', params: { uid } });

/** Users & roles: every account. Anyone who signs up is a customer until they're given a team role here. */
function Users() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('push');
  const users = useTeam((s) => s.users);
  const state = useTeam((s) => s.state);
  const error = useTeam((s) => s.error);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadUsers();
  }, []);

  const count = (f: Filter) => users.filter((u) => match(u.role, f)).length;
  const needle = q.trim().toLowerCase();
  const shown = users
    .filter((u) => match(u.role, filter) && (!needle || `${u.name} ${u.email} ${u.phone ?? ''}`.toLowerCase().includes(needle)))
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const filters: Filter[] = ['all', 'staff', ...ROLE_ORDER];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 10 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            progressViewOffset={pad.paddingTop}
            onRefresh={async () => {
              setRefreshing(true);
              await loadUsers();
              setRefreshing(false);
            }}
          />
        }
      >
        <Reveal i={0} style={{ flexDirection: 'row', gap: 8 }}>
          <SearchField value={q} onChangeText={setQ} placeholder="Search name, email or phone" />
          <AccentPill label="Add" icon="group_add" onPress={() => openUser('new')} />
        </Reveal>
        <Reveal i={1} from={{ y: 0, scale: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={styles.chips}>
            {filters.map((f) => (
              <Chip
                key={f}
                label={`${f === 'all' ? 'All' : f === 'staff' ? 'Team' : ROLE_INFO[f].label} ${count(f)}`}
                on={filter === f}
                onPress={() => setFilter(f)}
                height={36}
                fontSize={13}
                padH={14}
              />
            ))}
          </ScrollView>
        </Reveal>

        {state === 'loading' ? (
          <View style={styles.state}>
            <Spinner color={c.accent} size={22} />
            <Txt s={14} color={c.text2}>
              Loading accounts…
            </Txt>
          </View>
        ) : null}
        {state === 'error' ? (
          <View style={[styles.state, styles.card, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <Icon name="error" size={28} color={c.err} />
            <Txt s={14} lh={1.45} color={c.text2} align="center">
              {error}
            </Txt>
            <OutlineButton label="Try again" icon="sync" height={44} fontSize={14} onPress={() => void loadUsers()} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : null}
        {state === 'ready' && !shown.length ? (
          <Txt s={14} color={c.text2} align="center" style={{ marginVertical: 24 }}>
            No accounts match.
          </Txt>
        ) : null}

        {shown.map((u, i) => (
          <Reveal key={u.uid} i={2 + Math.min(i, 12)}>
            <PressableScale
              onPress={() => openUser(u.uid)}
              scaleTo={0.985}
              accessibilityLabel={`${u.name}, ${ROLE_INFO[u.role].label}${u.disabled ? ', disabled' : ''}`}
              style={[styles.row, { borderColor: c.line, backgroundColor: c.surface1, opacity: u.disabled ? 0.55 : 1 }]}
            >
              <Avatar text={initials(u.name)} size={44} fontSize={13.5} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt s={14.5} w={700} numberOfLines={1}>
                  {u.name}
                </Txt>
                <Txt s={12} color={c.text3} numberOfLines={1}>
                  {u.disabled ? 'Disabled · ' : ''}
                  {u.email || 'No email'}
                  {u.role === 'user' && u.orders ? ` · ${cnt(u.orders, 'order')} · ${money(u.spent)}` : ''}
                </Txt>
              </View>
              <RolePill role={u.role} />
            </PressableScale>
          </Reveal>
        ))}
      </ScrollView>
      <AdminHeader title="Users & roles" back />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 24 },
});
