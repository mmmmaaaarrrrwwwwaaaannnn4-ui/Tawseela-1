import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AdminHeader, AdminInput, FieldLabel, useAdminPadding } from '@/components/admin/admin-ui';
import { Icon } from '@/components/icons/icon';
import { StagePill, Timeline, useOrderActions } from '@/components/staff/staff-ui';
import { AccentButton, CircleButton, OutlineButton } from '@/components/ui/buttons';
import { Check, Spinner } from '@/components/ui/controls';
import { Avatar, DishImage } from '@/components/ui/media';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useNow } from '@/hooks/use-simulation';
import { useStatusBar } from '@/hooks/use-status-bar';
import type { OpsOrder } from '@/lib/contract';
import { agoLabel, cnt, initials, money } from '@/lib/format';
import { callNumber, cashDue, fetchOpsOrder, itemCount, openMaps, saveOrderContact, toggleItemDone, useOps } from '@/lib/ops';
import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function StaffOrderScreen() {
  return (
    <RevealScope>
      <StaffOrder />
    </RevealScope>
  );
}

/** One order, for whoever on the team is working it: contact, address, items, payment and their next move. */
function StaffOrder() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('push');
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useOps((s) => s.orders.find((o) => o.id === id));
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (order) return;
    let live = true;
    void fetchOpsOrder(id).then((o) => live && !o && setMissing(true));
    return () => {
      live = false;
    };
  }, [id, order]);

  if (!order) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[pad, styles.state]}>
          {missing ? <Icon name="search_off" size={32} color={c.text3} /> : <Spinner color={c.accent} size={22} />}
          <Txt s={15} w={600} align="center">
            {missing ? 'Order not found' : 'Loading the order'}
          </Txt>
          {missing ? (
            <Txt s={13.5} color={c.text2} align="center">
              It may have left your queue, or the server can’t be reached.
            </Txt>
          ) : null}
        </View>
        <AdminHeader title="Order" back />
      </View>
    );
  }
  return <Detail o={order} />;
}

function Detail({ o }: { o: OpsOrder }) {
  const { c } = useTheme();
  const now = useNow(true, 30_000);
  const role = useSession((s) => s.role);
  const bagged = o.kitchen.done;
  const dishOf = useApp((s) => s.dishOf);
  const canEdit = (role === 'callcenter' || role === 'admin') && (o.stage === 'placed' || o.stage === 'confirmed');
  const packing = (role === 'packer' || role === 'admin') && o.stage === 'confirmed';
  const left = o.items.length - bagged.length;
  const actions = useOrderActions(o, packing && left > 0 ? `Tick ${cnt(left, 'more item')} into the bag first` : null);
  const pad = useAdminPadding(actions.hasBar ? 'cta' : 'push');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Reveal i={0} style={styles.top}>
          <View style={{ gap: 3, flex: 1, minWidth: 0 }}>
            <Txt s={26} w={600} ls={-0.02}>
              {o.no}
            </Txt>
            <Txt s={12.5} w={500} color={c.text3} numberOfLines={2}>
              {agoLabel(o.placedAt, now)} · {cnt(itemCount(o), 'item')} · {o.mode === 'pickup' ? 'Pickup' : 'Delivery'} · {o.pay}
            </Txt>
          </View>
          <StagePill stage={o.stage} mode={o.mode} big />
        </Reveal>

        {cashDue(o) ? (
          <Reveal i={1}>
            <View style={[styles.cash, { backgroundColor: c.surface2 }]}>
              <Icon name="payments" size={20} fill color={c.warn} />
              <Txt s={13.5} w={700} color={c.warn} style={{ flex: 1 }}>
                Collect {money(o.total)} in cash on delivery
              </Txt>
            </View>
          </Reveal>
        ) : null}

        <Reveal i={2}>{canEdit ? <ContactEditor o={o} /> : <Contact o={o} />}</Reveal>

        <Reveal i={3}>
          <View style={[styles.lines, { borderColor: c.line, backgroundColor: c.surface1 }]}>
            <View style={{ paddingTop: 8, paddingBottom: 2 }}>
              <FieldLabel>{packing ? `Pack · ${bagged.length} of ${o.items.length} in the bag` : 'Items'}</FieldLabel>
            </View>
            {o.items.map((l, k) => {
              const on = bagged.includes(k);
              const row = (
                <View style={[styles.lineRow, { borderBottomColor: c.line }]}>
                  {packing ? <Check on={on} /> : null}
                  <DishImage uri={dishOf(l.id).img} size={44} opacity={packing && on ? 0.5 : 1} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt s={14} w={700} strike={packing && on} color={packing && on ? c.text3 : c.text1}>
                      {l.q} × {l.name}
                    </Txt>
                    {l.meta ? (
                      <Txt s={12} color={c.text3}>
                        {l.meta}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt s={14} w={600}>
                    {l.voucher ? 'Reward' : money(l.unit * l.q)}
                  </Txt>
                </View>
              );
              return packing ? (
                <PressableScale
                  key={k}
                  onPress={() => void toggleItemDone(o, k)}
                  scaleTo={0.99}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${l.q} × ${l.name}`}
                >
                  {row}
                </PressableScale>
              ) : (
                <View key={k}>{row}</View>
              );
            })}
            {o.note ? (
              <Txt s={13} lh={1.45} color={c.text2} style={{ paddingTop: 10 }}>
                Note: {o.note}
              </Txt>
            ) : null}
            <View style={styles.totalRow}>
              <Txt s={14.5} w={700}>
                Total
              </Txt>
              <Txt s={22} w={600}>
                {money(o.total)}
              </Txt>
            </View>
          </View>
        </Reveal>

        {o.rider ? (
          <Reveal i={4}>
            <View style={[styles.cust, { borderColor: c.line, backgroundColor: c.surface1 }]}>
              <View style={[styles.tile, { backgroundColor: c.accentSoft }]}>
                <Icon name="two_wheeler" size={22} fill color={c.accentText} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt s={15} w={700}>
                  {o.rider.name}
                </Txt>
                <Txt s={12.5} color={c.text3}>
                  Delivery rider
                </Txt>
              </View>
              {o.rider.phone ? (
                <CircleButton icon="call" size={42} iconSize={19} variant="soft" label={`Call ${o.rider.name}`} onPress={() => callNumber(o.rider?.phone)} />
              ) : null}
            </View>
          </Reveal>
        ) : null}

        {actions.inline ? <Reveal i={5}>{actions.inline}</Reveal> : null}

        <Reveal i={6}>
          <Timeline order={o} ago={(at) => agoLabel(at, now)} />
        </Reveal>

        {o.stage === 'delivered' || o.stage === 'cancelled' ? (
          <View style={[styles.closed, { backgroundColor: c.surface2 }]}>
            <Txt s={13.5} w={600} color={c.text2} align="center">
              {o.stage === 'cancelled' ? 'Order cancelled' : 'Delivered · nothing left to do'}
            </Txt>
          </View>
        ) : null}
      </ScrollView>
      <AdminHeader title="Order" back />
      {actions.bar}
      {actions.sheet}
    </View>
  );
}

/** Customer, phone and where it's going. */
function Contact({ o }: { o: OpsOrder }) {
  const { c } = useTheme();
  const phone = o.address?.phone || o.customer.phone;
  return (
    <View style={[styles.contact, { borderColor: c.line, backgroundColor: c.surface1 }]}>
      <View style={[styles.row, { padding: 14 }]}>
        <Avatar text={initials(o.customer.name)} size={46} bg={c.accentSoft} color={c.accentText} fontSize={15} display />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt s={15} w={700} numberOfLines={1}>
            {o.customer.name}
          </Txt>
          <Txt s={12.5} color={c.text3} numberOfLines={1}>
            {phone || 'No phone number'}
          </Txt>
        </View>
        <CircleButton icon="call" size={42} iconSize={19} variant="soft" label={`Call ${o.customer.name}`} onPress={() => callNumber(phone)} />
      </View>
      <View style={[styles.row, styles.addr, { borderTopColor: c.line }]}>
        <Icon name={o.mode === 'pickup' ? 'storefront' : 'location_on'} size={21} color={c.text2} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {o.mode === 'delivery' && o.address ? (
            <>
              <Txt s={14} w={600}>
                {o.address.tag} · {o.address.l1}
              </Txt>
              <Txt s={12.5} color={c.text3}>
                {o.address.l2}
                {o.address.note ? ` · ${o.address.note}` : ''}
              </Txt>
            </>
          ) : (
            <Txt s={14} w={600}>
              {o.mode === 'pickup' ? 'Pickup at the counter' : 'No address on the order'}
            </Txt>
          )}
        </View>
        {o.mode === 'delivery' && o.address ? (
          <CircleButton icon="directions" size={42} iconSize={19} variant="soft" label="Open in Maps" onPress={() => openMaps(o.address)} />
        ) : null}
      </View>
    </View>
  );
}

/** Front of house: check the details with the customer and fix them before confirming. */
function ContactEditor({ o }: { o: OpsOrder }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(o.address?.phone || o.customer.phone || '');
  const [l1, setL1] = useState(o.address?.l1 ?? '');
  const [l2, setL2] = useState(o.address?.l2 ?? '');
  const [note, setNote] = useState(o.address?.note ?? '');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <View style={{ gap: 8 }}>
        <Contact o={o} />
        <OutlineButton label="Edit address or phone" icon="edit" height={46} fontSize={14} onPress={() => setEditing(true)} />
      </View>
    );
  }
  const save = async () => {
    const toast = useApp.getState().showToast;
    if (o.mode === 'delivery' && !l1.trim()) {
      toast('Address needed', 'Add the street address', 'error');
      return;
    }
    setSaving(true);
    const next = await saveOrderContact(o, {
      phone: phone.trim() || null,
      ...(o.mode === 'delivery' && o.address
        ? { address: { ...o.address, l1: l1.trim(), l2: l2.trim(), note: note.trim(), ...(phone.trim() ? { phone: phone.trim() } : {}) } }
        : {}),
    });
    setSaving(false);
    if (!next) return;
    toast('Details saved', next.no, 'check');
    setEditing(false);
  };
  return (
    <View style={[styles.contact, { borderColor: c.line, backgroundColor: c.surface1, gap: 8, padding: 14 }]}>
      <Txt s={15} w={700}>
        {o.customer.name}
      </Txt>
      <FieldLabel>Phone</FieldLabel>
      <AdminInput value={phone} onChangeText={setPhone} placeholder="+1 (212) 555-0100" keyboardType="phone-pad" />
      {o.mode === 'delivery' ? (
        <>
          <FieldLabel>Street</FieldLabel>
          <AdminInput value={l1} onChangeText={setL1} placeholder="221 Mercer St, Apt 4B" />
          <FieldLabel>City, ZIP</FieldLabel>
          <AdminInput value={l2} onChangeText={setL2} placeholder="New York, NY 10012" />
          <FieldLabel>Courier note</FieldLabel>
          <AdminInput value={note} onChangeText={setNote} placeholder="Buzzer, floor, landmarks…" fontWeight={500} />
        </>
      ) : null}
      <View style={[styles.row, { marginTop: 4 }]}>
        <OutlineButton label="Cancel" height={46} fontSize={14} onPress={() => setEditing(false)} style={{ flex: 1 }} />
        <AccentButton label="Save" height={46} fontSize={14} loading={saving} loadingLabel="Saving…" onPress={() => void save()} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  cash: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  contact: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addr: { borderTopWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  cust: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  tile: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  lines: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 12, paddingBottom: 8 },
  closed: { padding: 16, borderRadius: 18 },
});
