import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { IconName } from '@/components/icons/icon';
import { Icon } from '@/components/icons/icon';
import { AccentButton, OutlineButton } from '@/components/ui/buttons';
import { StatusPill } from '@/components/ui/controls';
import { FloatingBar } from '@/components/ui/layout';
import { Sheet } from '@/components/ui/overlays';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useConfirmTap } from '@/hooks/use-confirm-tap';
import { ROLE_INFO, STAGE_LABEL, movesFor, type OpsOrder, type OrderStage, type RiderLoad, type Role, type StageMove } from '@/lib/contract';
import { money } from '@/lib/format';
import { advanceOrder, cashDue, fetchRiders } from '@/lib/ops';
import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import type { Palette } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

/* ------------------------------------------------------------------ roles */

export const ROLE_ICON: Record<Role, IconName> = {
  admin: 'shield_lock',
  callcenter: 'support_agent',
  packer: 'inventory_2',
  warehouse: 'local_shipping',
  delivery: 'two_wheeler',
  user: 'person',
};

export function roleColor(role: Role, c: Palette): string {
  return role === 'user' ? c.text2 : role === 'admin' ? c.accentText : c.info;
}

export function RolePill({ role }: { role: Role }) {
  const { c } = useTheme();
  return <StatusPill label={ROLE_INFO[role].label} color={roleColor(role, c)} padH={9} />;
}

/* ------------------------------------------------------------------ stages */

/** Tint per fulfilment stage — the same family as the console's order steps. */
export function stageColor(stage: OrderStage, c: Palette): string {
  switch (stage) {
    case 'placed':
      return c.info;
    case 'confirmed':
      return c.warn;
    case 'delivered':
      return c.ok;
    case 'cancelled':
      return c.err;
    default:
      return c.accentText;
  }
}

export const stageLabel = (stage: OrderStage, mode: OpsOrder['mode']) => (stage === 'packed' && mode === 'pickup' ? 'Ready for pickup' : STAGE_LABEL[stage]);

export function StagePill({ stage, mode, big }: { stage: OrderStage; mode: OpsOrder['mode']; big?: boolean }) {
  const { c } = useTheme();
  return big ? (
    <StatusPill label={stageLabel(stage, mode)} color={stageColor(stage, c)} size={11} padH={10} padV={6} radius={9} />
  ) : (
    <StatusPill label={stageLabel(stage, mode)} color={stageColor(stage, c)} />
  );
}

const MOVE_ICON: Partial<Record<OrderStage, IconName>> = {
  confirmed: 'check_circle',
  packed: 'inventory_2',
  assigned: 'two_wheeler',
  out_for_delivery: 'two_wheeler',
  delivered: 'home',
  cancelled: 'cancel',
};

/** "Delivered" for a cash order says the money was collected (the server records it with the move). */
const moveLabel = (m: StageMove, o: OpsOrder) => (m.to === 'delivered' && cashDue(o) ? `Delivered · ${money(o.total)} collected` : m.label);

/* ------------------------------------------------------------------ actions */

/**
 * The moves the signed-in team member can make on this order — from the same rules the server enforces.
 * Returns the pieces for the order screen: the first move as the floating CTA (`bar`), any others and
 * the cancel button for the page (`inline`), and the rider picker (`sheet`). Assigning opens the picker;
 * cancelling asks for a second tap. `blocked` holds the main move back with a reason (packing checklist).
 */
export function useOrderActions(order: OpsOrder, blocked?: string | null) {
  const role = useSession((s) => s.role);
  const uid = useSession((s) => s.user?.uid ?? '');
  const toast = useApp((s) => s.showToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const moves = movesFor({ stage: order.stage, mode: order.mode, riderUid: order.rider?.uid ?? null }, role, uid);
  const main = moves.filter((m) => !m.danger);
  const danger = moves.find((m) => m.danger) ?? null;
  const [first, ...rest] = main;
  const key = (m: StageMove) => m.to + m.label;

  const run = async (m: StageMove, riderUid?: string) => {
    if (busy) return;
    setBusy(key(m));
    const next = await advanceOrder(order, m.to, riderUid ? { riderUid } : {});
    setBusy(null);
    if (!next) return;
    toast(m.to === 'assigned' ? `Assigned to ${next.rider?.name ?? 'rider'}` : stageLabel(next.stage, next.mode), next.no, MOVE_ICON[m.to] ?? 'check');
  };
  const press = (m: StageMove) => {
    if (m.rider) setPicking(true);
    else void run(m);
  };

  const inline =
    rest.length || danger ? (
      <View style={{ gap: 8 }}>
        {rest.map((m) => (
          <OutlineButton
            key={key(m)}
            label={busy === key(m) ? 'Updating…' : moveLabel(m, order)}
            icon={MOVE_ICON[m.to]}
            height={48}
            fontSize={14}
            onPress={() => press(m)}
          />
        ))}
        {danger ? <CancelButton busy={busy === key(danger)} paid={order.payment.status === 'paid'} onConfirm={() => void run(danger)} /> : null}
      </View>
    ) : null;

  const bar = first ? (
    <FloatingBar>
      <AccentButton
        label={moveLabel(first, order)}
        icon={MOVE_ICON[first.to]}
        iconFill
        iconSize={21}
        loading={busy === key(first)}
        loadingLabel="Updating…"
        dim={!!blocked}
        onPress={() => (blocked ? toast('Not yet', blocked, 'info') : press(first))}
      />
    </FloatingBar>
  ) : null;

  const sheet = (
    <RiderPicker
      visible={picking}
      current={order.rider?.uid ?? null}
      onClose={() => setPicking(false)}
      onPick={(r) => {
        setPicking(false);
        const m = main.find((x) => x.rider);
        if (m) void run(m, r.uid);
      }}
    />
  );

  return { inline, bar, sheet, hasBar: !!first };
}

function CancelButton({ busy, paid, onConfirm }: { busy: boolean; paid: boolean; onConfirm: () => void }) {
  const { c } = useTheme();
  const confirm = useConfirmTap(onConfirm, paid ? 'Tap again to cancel and refund this order' : 'Tap again to cancel this order');
  const label = busy ? 'Cancelling…' : confirm.armed ? 'Tap again to confirm' : paid ? 'Cancel & refund' : 'Cancel order';
  return (
    <OutlineButton
      label={label}
      color={c.err}
      borderColor={confirm.armed ? c.err : undefined}
      height={48}
      fontSize={14}
      onPress={busy ? undefined : confirm.onPress}
    />
  );
}

/** Sheet listing active delivery riders, least busy first. */
function RiderPicker({ visible, current, onClose, onPick }: { visible: boolean; current: string | null; onClose: () => void; onPick: (r: RiderLoad) => void }) {
  const { c } = useTheme();
  const [riders, setRiders] = useState<RiderLoad[] | null>(null);
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setRiders(null);
      void fetchRiders().then(setRiders);
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Assign a courier" subtitle="Least busy first">
      {riders === null ? <ActivityIndicator style={{ marginVertical: 24 }} color={c.accent} /> : null}
      {riders?.length === 0 ? (
        <Txt s={14} lh={1.5} color={c.text2} align="center" style={{ marginVertical: 20 }}>
          No active riders. An admin can give someone the Delivery role under Users & roles.
        </Txt>
      ) : null}
      {riders?.map((r) => (
        <PressableScale
          key={r.uid}
          onPress={() => onPick(r)}
          scaleTo={0.98}
          accessibilityLabel={`Assign to ${r.name}`}
          style={[styles.rider, { backgroundColor: c.surface1, borderColor: r.uid === current ? c.accent : c.line }]}
        >
          <View style={[styles.tile, { backgroundColor: c.accentSoft }]}>
            <Icon name="two_wheeler" size={21} fill color={c.accentText} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt s={15} w={700}>
              {r.name}
            </Txt>
            <Txt s={12.5} color={c.text3}>
              {r.active ? `${r.active} on the road` : 'Free now'}
              {r.uid === current ? ' · assigned' : ''}
            </Txt>
          </View>
          <Icon name="chevron_right" size={21} color={c.text3} />
        </PressableScale>
      ))}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ history */

/** Who moved the order, and when. */
export function Timeline({ order, ago }: { order: OpsOrder; ago: (at: number) => string }) {
  const { c } = useTheme();
  if (!order.timeline.length) return null;
  return (
    <View style={[styles.card, { backgroundColor: c.surface1, borderColor: c.line }]}>
      <Txt s={12} w={600} ls={0.06} upper color={c.text3}>
        History
      </Txt>
      {[...order.timeline].reverse().map((e, i) => (
        <View key={`${e.stage}-${e.at}-${i}`} style={styles.event}>
          <View style={[styles.dot, { backgroundColor: stageColor(e.stage, c) }]} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Txt s={13.5} w={600}>
              {e.note?.startsWith('Contact') ? e.note : stageLabel(e.stage, order.mode)}
              {e.by ? (
                <Txt s={13.5} color={c.text3}>
                  {' '}
                  · {e.by.name} ({ROLE_INFO[e.by.role].label})
                </Txt>
              ) : null}
            </Txt>
            <Txt s={12} color={c.text3}>
              {ago(e.at)}
              {e.note && !e.note.startsWith('Contact') ? ` · ${e.note}` : ''}
            </Txt>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rider: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5 },
  tile: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 14, borderRadius: 20, borderWidth: 1, gap: 10 },
  event: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
});
