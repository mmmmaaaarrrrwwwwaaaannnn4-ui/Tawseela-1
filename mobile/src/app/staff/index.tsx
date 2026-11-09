import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AdminHeader, useAdminPadding } from '@/components/admin/admin-ui';
import { Icon } from '@/components/icons/icon';
import { ROLE_ICON, StagePill } from '@/components/staff/staff-ui';
import { OutlineButton } from '@/components/ui/buttons';
import { Spinner } from '@/components/ui/controls';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useNow } from '@/hooks/use-simulation';
import { useStatusBar } from '@/hooks/use-status-bar';
import { ROLE_INFO, isStaff, type OpsOrder, type StaffRole } from '@/lib/contract';
import { agoLabel, cnt, money } from '@/lib/format';
import { cashDue, itemCount, movedByMe, needsMe, syncOps, useOps } from '@/lib/ops';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function StaffQueueScreen() {
  return (
    <RevealScope>
      <Queue />
    </RevealScope>
  );
}

/** What each role is asked to do, for the empty state. */
const IDLE: Record<StaffRole, string> = {
  admin: 'No orders in progress.',
  callcenter: 'No new orders to confirm.',
  packer: 'Nothing waiting in the kitchen.',
  warehouse: 'No ready orders waiting for a courier.',
  delivery: 'No deliveries assigned to you right now.',
};

const lastMove = (o: OpsOrder) => o.timeline.at(-1)?.at ?? o.placedAt;

/** The signed-in team member's queue: orders waiting on them first, then others', then what they did. */
function Queue() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('push');
  const now = useNow(true, 30_000);
  const sessionRole = useSession((s) => s.role);
  const user = useSession((s) => s.user);
  const orders = useOps((s) => s.orders);
  const state = useOps((s) => s.state);
  const error = useOps((s) => s.error);
  const [refreshing, setRefreshing] = useState(false);

  const role: StaffRole = isStaff(sessionRole) ? sessionRole : 'admin';
  const uid = user?.uid ?? '';
  const todo = orders.filter((o) => needsMe(o, role, uid)).sort((a, b) => a.placedAt - b.placedAt);
  const rest = orders.filter((o) => !needsMe(o, role, uid));
  // in the queue but someone else's turn (a confirmed order, for the call center), then what you did
  const waiting = rest.filter((o) => !movedByMe(o, uid) && o.stage !== 'delivered' && o.stage !== 'cancelled').sort((a, b) => a.placedAt - b.placedAt);
  const done = rest.filter((o) => !waiting.includes(o)).sort((a, b) => lastMove(b) - lastMove(a));
  const showWhere = role === 'callcenter' || role === 'delivery' || role === 'admin';

  const refresh = async () => {
    setRefreshing(true);
    await syncOps();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 10 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.accent} progressViewOffset={pad.paddingTop} onRefresh={() => void refresh()} />}
      >
        <Reveal i={0}>
          <View style={[styles.role, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <View style={[styles.roleTile, { backgroundColor: c.accentSoft }]}>
              <Icon name={ROLE_ICON[role]} size={22} fill color={c.accentText} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt s={15} w={700} numberOfLines={1}>
                {user?.name ?? 'Team'} · {ROLE_INFO[role].label}
              </Txt>
              <Txt s={12.5} color={c.text3}>
                {ROLE_INFO[role].desc}
              </Txt>
            </View>
          </View>
        </Reveal>

        <Section title="Needs you" count={todo.length} />
        {state === 'loading' && !orders.length ? (
          <View style={styles.state}>
            <Spinner color={c.accent} size={22} />
            <Txt s={14} color={c.text2} align="center">
              Loading your queue…
            </Txt>
          </View>
        ) : null}
        {state === 'error' ? (
          <View style={[styles.state, styles.card, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <Icon name="error" size={28} color={c.err} />
            <Txt s={14} lh={1.45} color={c.text2} align="center">
              {error}
            </Txt>
            <OutlineButton label="Try again" icon="sync" height={44} fontSize={14} onPress={() => void refresh()} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : null}
        {state === 'ready' && !todo.length ? (
          <View style={styles.state}>
            <Icon name="check_circle" size={32} fill color={c.ok} />
            <Txt s={14} lh={1.45} color={c.text2} align="center">
              {IDLE[role]} New orders show up here on their own.
            </Txt>
          </View>
        ) : null}
        {todo.map((o, i) => (
          <Reveal key={o.id} i={1 + Math.min(i, 10)}>
            <OrderCard o={o} now={now} showWhere={showWhere} />
          </Reveal>
        ))}

        {waiting.length ? <Section title="Waiting on others" count={waiting.length} /> : null}
        {waiting.map((o) => (
          <OrderCard key={o.id} o={o} now={now} showWhere={showWhere} dim />
        ))}

        {done.length ? <Section title="Done by you · last 24 hours" count={done.length} /> : null}
        {done.map((o) => (
          <OrderCard key={o.id} o={o} now={now} showWhere={showWhere} dim />
        ))}
      </ScrollView>
      <AdminHeader title={role === 'admin' ? 'Fulfilment' : 'My queue'} back />
    </View>
  );
}

function Section({ title, count }: { title: string; count: number }) {
  const { c } = useTheme();
  return (
    <Txt s={12} w={600} ls={0.06} upper color={c.text3} style={{ marginTop: 8, paddingHorizontal: 4 }}>
      {title} · {count}
    </Txt>
  );
}

function OrderCard({ o, now, showWhere, dim }: { o: OpsOrder; now: number; showWhere: boolean; dim?: boolean }) {
  const { c } = useTheme();
  const where = o.mode === 'pickup' ? 'Pickup at the counter' : o.address ? `${o.address.l1}, ${o.address.l2}` : 'No address';
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/staff/order/[id]', params: { id: o.id } })}
      scaleTo={0.98}
      accessibilityLabel={`Order ${o.no}, ${o.customer.name}`}
      style={[styles.card, { backgroundColor: c.surface1, borderColor: c.line, opacity: dim ? 0.7 : 1 }]}
    >
      <View style={styles.between}>
        <Txt s={17} w={600} ls={-0.01}>
          {o.no}
        </Txt>
        <StagePill stage={o.stage} mode={o.mode} />
      </View>
      <Txt s={14} w={600} numberOfLines={1}>
        {o.customer.name}
        <Txt s={13} color={c.text3}>
          {' '}
          · {agoLabel(o.placedAt, now)}
        </Txt>
      </Txt>
      {showWhere ? (
        <Txt s={13} color={c.text2} numberOfLines={1}>
          {where}
        </Txt>
      ) : null}
      <View style={styles.between}>
        <Txt s={13} color={c.text3} numberOfLines={1} style={{ flexShrink: 1 }}>
          {cnt(itemCount(o), 'item')} · {money(o.total)}
          {o.rider ? ` · ${o.rider.name}` : ''}
        </Txt>
        {cashDue(o) ? (
          <Txt s={12.5} w={700} color={c.warn}>
            Collect {money(o.total)} cash
          </Txt>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  roleTile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 14, borderRadius: 20, borderWidth: 1, gap: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  state: { alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: 20 },
});
