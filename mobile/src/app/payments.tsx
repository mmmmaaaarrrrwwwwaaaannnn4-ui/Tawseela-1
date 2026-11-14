import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { blankCard, CardSheet } from '@/components/account/card-sheet';
import { IconTile, SelectRow } from '@/components/account/rows';
import { Wallet } from '@/components/account/wallet';
import { Icon, type IconName } from '@/components/icons/icon';
import { AccentFill } from '@/components/ui/buttons';
import { PagerDots } from '@/components/ui/controls';
import { Eyebrow, ListCard, ScreenHeader, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { money, orderTime } from '@/lib/format';
import { api } from '@/lib/api';
import { cardBrandOf } from '@/data/seed';
import { payLabel, selectMyOrders, useApp, type NewCard } from '@/store/app-store';
import { useSession } from '@/store/session';
import { fixed } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

const OTHER: { l: string; icon: IconName; s: string; m: number }[] = [
  { l: 'Apple Pay', icon: 'phone_iphone', s: 'Face ID · instant', m: 0 },
  { l: 'Cash on delivery', icon: 'payments', s: 'Pay the courier at the door', m: 2 },
];

export default function PaymentsScreen() {
  const { c } = useTheme();
  const chrome = useChrome();
  useStatusBar();
  const cards = useApp((s) => s.cards);
  const defCard = useApp((s) => s.defCard);
  const payM = useApp((s) => s.payM);
  const credit = useApp((s) => s.credit);
  const user = useSession((s) => s.user);
  const defLabel = useApp((s) => payLabel(s));
  const history = useApp(useShallow((s) => selectMyOrders(s).slice(0, 4)));
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NewCard>(() => blankCard());
  const [err, setErr] = useState(false);
  const [flip, setFlip] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards')
      .then((result) => { if (!active) return; const next = result.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; }); useApp.setState({ cards: next, defCard: useApp.getState().defCard && next.some((x) => x.id === useApp.getState().defCard) ? useApp.getState().defCard : (next[0]?.id ?? '') }); })
      .catch(() => { if (active) useApp.setState({ cards: [], defCard: '' }); });
    return () => { active = false; };
  }, []);

  const cur = cards[Math.min(idx, cards.length - 1)];
  const curIsDef = !!cur && payM === 1 && defCard === cur.id;

  const startCard = () => {
    setDraft(blankCard(user?.name ?? ''));
    setErr(false);
    setFlip(false);
    setOpen(true);
  };
  const saveCard = async () => {
    const digits = draft.num.replace(/\D/g, '');
    const validExpiry = /^(0[1-9]|1[0-2])\/\d{2}$/.test(draft.exp);
    const validCvv = /^\d{3,4}$/.test(draft.cvv);
    if (digits.length < 15 || !draft.name.trim() || !validExpiry || !validCvv) { setErr(true); return; }
    if (saving) return;
    setSaving(true);
    try {
      const intent = await api.get<{ endpoint: string; merchantId: string; customerReference: string; hash: string }>('/v1/me/cards/tokenization-intent');
      const response = await fetch(intent.endpoint, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'Kashier-Hash': intent.hash },
        body: JSON.stringify({
          merchantId: intent.merchantId,
          customerReference: intent.customerReference,
          paymentMethod: { type: 'CARD', card: { number: digits, nameOnCard: draft.name.trim(), expiry: { month: draft.exp.slice(0, 2), year: draft.exp.slice(-2) }, securityCode: draft.cvv } },
          customer: { reference: intent.customerReference },
        }),
      });
      const result: any = await response.json().catch(() => ({}));
      const token = result?.response?.paymentMethod?.card?.cardToken ?? result?.response?.paymentMethod?.card?.cardDataToken;
      if (!response.ok || result?.status !== 'SUCCESS' || typeof token !== 'string') throw new Error(result?.messages?.ar || result?.messages?.en || 'Kashier did not return a saved card token.');
      await api.post('/v1/me/cards', { cardToken: token });
      const saved = await api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards');
      const next = saved.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; });
      useApp.setState({ cards: next, defCard: token, payM: 1 });
      setIdx(Math.max(0, next.findIndex((x) => x.id === token)));
      setErr(false); setFlip(false); setOpen(false);
      useApp.getState().showToast('تم حفظ البطاقة', 'تم حفظ رمز البطاقة لدى Kashier بنجاح.', 'check_circle');
      router.replace('/checkout');
    } catch (error) {
      setErr(true);
      useApp.getState().showToast('تعذر حفظ البطاقة', error instanceof Error ? error.message : 'حاول مرة أخرى.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: chrome.underHeader, paddingBottom: 40, gap: 18 }}>
          <View style={styles.titleRow}>
            <Txt s={18} w={600} ls={-0.01}>
              Your cards
            </Txt>
            <Txt s={12} w={500} color={c.text3}>
              Default: {defLabel}
            </Txt>
          </View>

          {cards.length ? (
            <>
              <Reveal i={0}>
                <Wallet cards={cards} index={idx} defId={payM === 1 ? defCard : null} holder={user?.name ?? 'Alex Morgan'} onIndex={setIdx} />
              </Reveal>
              <PagerDots count={cards.length} index={Math.min(idx, cards.length - 1)} onPick={setIdx} activeWidth={20} />
              <View style={styles.actions}>
                {curIsDef ? (
                  <View style={[styles.action, { backgroundColor: c.accentSoft }]}>
                    <Icon name="verified" size={21} fill color={c.accentText} />
                    <Txt s={12} w={700} color={c.accentText}>
                      Default card
                    </Txt>
                  </View>
                ) : (
                  <PressableScale
                    scaleTo={0.96}
                    onPress={() => cur && useApp.getState().makeDefaultCard(cur.id)}
                    style={[styles.action, { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface1 }]}
                  >
                    <Icon name="check_circle" size={21} color={c.accent} />
                    <Txt s={12} w={700}>
                      Make default
                    </Txt>
                  </PressableScale>
                )}
                <PressableScale scaleTo={0.96} onPress={startCard} style={styles.action}>
                  <AccentFill radius={20} />
                  <Icon name="add_card" size={21} color={c.accentInk} />
                  <Txt s={12} w={700} color={c.accentInk}>
                    Add card
                  </Txt>
                </PressableScale>
                <PressableScale
                  scaleTo={0.96}
                  onPress={() => {
                    if (cur) void api.delete(`/v1/me/cards/${encodeURIComponent(cur.id)}`).then(async () => { const saved = await api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards'); const next = saved.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; }); useApp.setState({ cards: next, defCard: next[0]?.id ?? '' }); setIdx(0); }).catch((e) => useApp.getState().showToast('تعذر حذف البطاقة', e instanceof Error ? e.message : 'حاول مرة أخرى.', 'error'));
                  }}
                  style={[styles.action, { borderWidth: 1, borderColor: c.line, backgroundColor: c.surface1 }]}
                >
                  <Icon name="delete" size={21} color={c.err} />
                  <Txt s={12} w={700} color={c.err}>
                    Remove
                  </Txt>
                </PressableScale>
              </View>
            </>
          ) : (
            <PressableScale scaleTo={0.98} onPress={startCard} style={[styles.firstCard, { borderColor: c.lineStrong }]}>
              <Icon name="add_card" size={32} color={c.accentText} />
              <Txt s={15} w={700} color={c.accentText}>
                Add your first card
              </Txt>
            </PressableScale>
          )}

          <View style={styles.credit}>
            <View style={styles.creditTile}>
              <Icon name="redeem" size={23} fill color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt s={12} w={600} color={fixed.paperA(0.7)}>
                Fig credit
              </Txt>
              <Txt s={24} w={600} lh={1.05} color={fixed.paper}>
                {money(credit)}
              </Txt>
              <Txt s={11.5} color={fixed.paperA(0.6)}>
                Applied automatically at checkout
              </Txt>
            </View>
            <PressableScale scaleTo={0.95} onPress={() => useApp.getState().addGiftCard()} style={styles.gift}>
              <Txt s={12.5} w={700} color={fixed.paper}>
                Add gift card
              </Txt>
            </PressableScale>
          </View>

          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            <Eyebrow>Other ways to pay</Eyebrow>
            {OTHER.map((o) => (
              <SelectRow
                key={o.l}
                on={payM === o.m}
                onPress={() => useApp.getState().setCheckout({ payM: o.m })}
                minHeight={64}
                left={<IconTile icon={o.icon} />}
              >
                <Txt s={14.5} w={700}>
                  {o.l}
                </Txt>
                <Txt s={12} color={c.text3}>
                  {o.s}
                </Txt>
              </SelectRow>
            ))}
          </View>

          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            <Eyebrow>Recent payments</Eyebrow>
            <ListCard radius={20}>
              {history.map((o, i) => {
                const refund = o.step === 4;
                return (
                  <View key={o.no} style={[styles.pay, { borderBottomColor: c.line, borderBottomWidth: i === history.length - 1 ? 0 : 1 }]}>
                    <IconTile icon={refund ? 'undo' : 'receipt_long'} size={36} radius={11} iconSize={19} />
                    <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                      <Txt s={13.5} w={700}>
                        {refund ? 'Refund' : 'Order'} {o.no}
                      </Txt>
                      <Txt s={11.5} color={c.text3} numberOfLines={1}>
                        {orderTime(o.placedAt)} · {o.pay}
                      </Txt>
                    </View>
                    <Txt s={14} w={700} color={refund ? c.ok : c.text1}>
                      {(refund ? '+' : '−') + money(o.total)}
                    </Txt>
                  </View>
                );
              })}
            </ListCard>
          </View>

          <View style={styles.secure}>
            <Icon name="lock" size={17} fill color={c.ok} />
            <Txt s={12} w={500} lh={1.5} color={c.text3} style={{ flex: 1 }}>
              Card details are encrypted and never stored on your phone.
            </Txt>
          </View>
        </ScrollView>
        <ScreenHeader title="Payment methods" />
        <CardSheet
          visible={open}
          value={draft}
          onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
          showErrors={err}
          flipped={flip}
          onFlip={setFlip}
          onSave={() => void saveCard()}
          onClose={() => {
            setOpen(false);
            setFlip(false);
          }}
        />
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  titleRow: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  action: { flex: 1, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 4 },
  firstCard: {
    marginHorizontal: 20,
    height: 170,
    borderRadius: 26,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  credit: { marginHorizontal: 20, padding: 16, borderRadius: 22, backgroundColor: fixed.ink, flexDirection: 'row', alignItems: 'center', gap: 14 },
  creditTile: { width: 46, height: 46, borderRadius: 15, backgroundColor: fixed.orange, alignItems: 'center', justifyContent: 'center' },
  gift: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  secure: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
