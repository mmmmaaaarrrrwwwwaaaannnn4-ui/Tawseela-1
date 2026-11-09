import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { AdminHeader, StepPill, useAdminPadding } from '@/components/admin/admin-ui';
import { Timeline } from '@/components/staff/staff-ui';
import { Icon, type IconName } from '@/components/icons/icon';
import { AccentButton, CircleButton, OutlineButton } from '@/components/ui/buttons';
import { FloatingBar } from '@/components/ui/layout';
import { Avatar, DishImage } from '@/components/ui/media';
import { Reveal, RevealScope, useEntered } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { useConfirmTap } from '@/hooks/use-confirm-tap';
import { useNow } from '@/hooks/use-simulation';
import { api } from '@/lib/api';
import type { OrderStage } from '@/lib/contract';
import { agoLabel, cnt, initials, money, orderTime } from '@/lib/format';
import { callNumber } from '@/lib/ops';
import type { Order } from '@/data/types';
import { useApp } from '@/store/app-store';
import { accentGradient } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

const STEPS: [string, IconName][] = [
  ['New', 'receipt_long'],
  ['Preparing', 'skillet'],
  ['On the way', 'two_wheeler'],
  ['Delivered', 'home'],
];
/** The console's one-tap advance, by fulfilment stage (the server picks the least busy rider for "Hand to courier"). */
const NEXT: Partial<Record<OrderStage, [string, IconName]>> = {
  placed: ['Accept & start cooking', 'skillet'],
  confirmed: ['Mark ready', 'room_service'],
  packed: ['Hand to courier', 'two_wheeler'],
  assigned: ['Picked up by courier', 'two_wheeler'],
  out_for_delivery: ['Mark as delivered', 'check_circle'],
};
const nextOf = (o: Order) => (o.stage === 'packed' && o.mode === 'pickup' ? (['Handed to customer', 'check_circle'] as [string, IconName]) : NEXT[o.stage]);
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export default function AdminOrderDetail() {
  return (
    <RevealScope>
      <OrderDetail />
    </RevealScope>
  );
}

function OrderDetail() {
  const { c } = useTheme();
  useStatusBar();
  const { no } = useLocalSearchParams<{ no: string }>();
  const order = useApp((s) => s.orders.find((o) => o.no === no));
  const [missing, setMissing] = useState(false);
  const pad = useAdminPadding('push');

  // a link straight to an order the board hasn't loaded yet
  useEffect(() => {
    if (order || !no) return;
    let live = true;
    api
      .get<Order>(`/v1/admin/orders/${encodeURIComponent(no)}`)
      .then((o) => live && useApp.getState().mergeOrders([o]))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [no, order]);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[pad, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
          <Txt s={15} w={600} color={c.text2}>
            {missing ? 'Order not found' : 'Loading the order…'}
          </Txt>
        </View>
        <AdminHeader title="Order" back />
      </View>
    );
  }
  return <Detail order={order} />;
}

function Detail({ order }: { order: Order }) {
  const { c } = useTheme();
  const dishOf = useApp((s) => s.dishOf);
  const now = useNow(true, 30_000);
  const next = nextOf(order);
  const pad = useAdminPadding(next ? 'cta' : 'push');
  const on = useEntered();
  const cust = order.customer;
  const phone = order.address?.phone || cust.phone;
  const canc = order.step === 4;
  const count = order.items.reduce((a, b) => a + b.q, 0);
  const paid = order.payment.status === 'paid' && order.payment.method !== 'cash';
  const cancel = useConfirmTap(() => useApp.getState().cancelOrder(order.no), paid ? 'Tap again to cancel and refund' : 'Tap again to cancel');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={[pad, { gap: 12, paddingBottom: next ? pad.paddingBottom : 40 }]} showsVerticalScrollIndicator={false}>
        <Reveal i={0} style={styles.top}>
          <View style={{ gap: 3, flex: 1 }}>
            <Txt s={26} w={600} ls={-0.02}>
              {order.no}
            </Txt>
            <Txt s={12.5} w={500} color={c.text3} numberOfLines={1}>
              {orderTime(order.placedAt)} · {cnt(count, 'item')} · {order.pay}
            </Txt>
          </View>
          <StepPill step={order.step} size={11} padH={10} padV={6} radius={9} />
        </Reveal>

        <Reveal i={1}>
          <View style={[styles.steps, { borderColor: c.line, backgroundColor: c.surface1 }]}>
            {STEPS.map(([l, icon], i) => {
              const done = !canc && i <= order.step;
              return (
                <View key={l} style={styles.stepCol}>
                  {i < 3 ? (
                    <View style={[styles.line, { backgroundColor: c.lineStrong }]}>
                      <LineFill on={on && !canc && i < order.step} delay={200 + i * 160} />
                    </View>
                  ) : null}
                  <StepDot on={on} delay={120 + i * 160} done={done} icon={icon} />
                  <Txt s={11} w={600} color={done ? c.text1 : c.text3} align="center">
                    {l}
                  </Txt>
                </View>
              );
            })}
          </View>
        </Reveal>

        <Reveal i={2}>
          <View style={[styles.cust, { borderColor: c.line, backgroundColor: c.surface1 }]}>
            <Avatar text={initials(cust.name)} size={46} bg={c.accentSoft} color={c.accentText} fontSize={15} display />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt s={15} w={700}>
                {cust.name}
              </Txt>
              <Txt s={12.5} color={c.text3} numberOfLines={1}>
                {order.mode === 'pickup' ? 'Pickup at the counter' : order.address ? `${order.address.l1}, ${order.address.l2}` : cust.email}
              </Txt>
            </View>
            <CircleButton icon="chat" size={42} iconSize={19} variant="soft" label="Message" onPress={() => callNumber(phone, 'sms')} />
            <CircleButton icon="call" size={42} iconSize={19} variant="soft" label="Call" onPress={() => callNumber(phone)} />
          </View>
        </Reveal>

        <Reveal i={3}>
          <View style={[styles.lines, { borderColor: c.line, backgroundColor: c.surface1 }]}>
            {order.items.map((it, k) => {
              const d = dishOf(it.id);
              const meta = it.meta;
              return (
                <View key={`${it.id}-${k}`} style={[styles.lineRow, { borderBottomColor: c.line }]}>
                  <DishImage uri={d.img} size={44} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt s={14} w={700}>
                      {it.q} × {it.name}
                    </Txt>
                    {meta ? (
                      <Txt s={12} color={c.text3}>
                        {meta}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt s={14} w={600}>
                    {it.voucher ? 'Reward' : money(it.unit * it.q)}
                  </Txt>
                </View>
              );
            })}
            <View style={styles.totalRow}>
              <Txt s={14.5} w={700}>
                Total charged
              </Txt>
              <Txt s={22} w={600}>
                {money(order.total)}
              </Txt>
            </View>
          </View>
        </Reveal>

        {order.rider ? (
          <Reveal i={4}>
            <View style={[styles.cust, { borderColor: c.line, backgroundColor: c.surface1 }]}>
              <Avatar text={initials(order.rider.name)} size={46} fontSize={15} display />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt s={15} w={700}>
                  {order.rider.name}
                </Txt>
                <Txt s={12.5} color={c.text3}>
                  Courier ·{' '}
                  {order.stage === 'assigned' ? 'on the way to the kitchen' : order.stage === 'out_for_delivery' ? 'out for delivery' : 'delivered it'}
                </Txt>
              </View>
              {order.rider.phone ? (
                <CircleButton icon="call" size={42} iconSize={19} variant="soft" label="Call courier" onPress={() => callNumber(order.rider?.phone)} />
              ) : null}
            </View>
          </Reveal>
        ) : null}

        <Reveal i={5}>
          <Timeline order={order} ago={(at) => agoLabel(at, now)} />
        </Reveal>

        {order.step >= 3 ? (
          <View style={[styles.closed, { backgroundColor: c.surface2 }]}>
            <Txt s={13.5} w={600} color={c.text2} align="center">
              {canc ? (order.payment.status === 'refunded' ? 'Order cancelled · refund issued' : 'Order cancelled') : 'Delivered · nothing left to do'}
            </Txt>
          </View>
        ) : (
          <Reveal i={6} from={{ y: 0, scale: 1 }}>
            <OutlineButton
              label={cancel.armed ? 'Tap again to confirm' : paid ? 'Cancel & refund' : 'Cancel order'}
              color={c.err}
              borderColor={cancel.armed ? c.err : undefined}
              height={48}
              fontSize={14}
              onPress={cancel.onPress}
            />
          </Reveal>
        )}
      </ScrollView>
      <AdminHeader title="Order" back />
      {next ? (
        <FloatingBar>
          <AccentButton label={next[0]} icon={next[1]} iconFill iconSize={21} onPress={() => useApp.getState().advanceOrder(order.no)} />
        </FloatingBar>
      ) : null}
    </View>
  );
}

function LineFill({ on, delay }: { on: boolean; delay: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(on ? withDelay(delay, withTiming(100, { duration: 600, easing: EASE })) : withTiming(0, { duration: 200 }));
  }, [on, delay, w]);
  const st = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <Animated.View style={[{ height: '100%', overflow: 'hidden' }, st]}>
      <LinearGradient colors={accentGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function StepDot({ on, delay, done, icon }: { on: boolean; delay: number; done: boolean; icon: IconName }) {
  const { c } = useTheme();
  const s = useSharedValue(0.6);
  useEffect(() => {
    s.set(on ? withDelay(delay, withSpring(1, { damping: 10, stiffness: 200 })) : 0.6);
  }, [on, delay, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={[styles.dot, { borderColor: done ? c.accent : c.lineStrong, backgroundColor: done ? c.accent : c.surface1 }, st]}>
      <Icon name={icon} size={18} fill={done} color={done ? c.accentInk : c.text3} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  steps: { flexDirection: 'row', paddingTop: 18, paddingHorizontal: 14, paddingBottom: 14, borderRadius: 20, borderWidth: 1 },
  stepCol: { flex: 1, alignItems: 'center', gap: 8 },
  line: { position: 'absolute', top: 17, left: '50%', right: '-50%', marginLeft: 20, marginRight: 20, height: 2, overflow: 'hidden' },
  dot: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cust: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  lines: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12, paddingBottom: 8 },
  closed: { padding: 16, borderRadius: 18 },
});
