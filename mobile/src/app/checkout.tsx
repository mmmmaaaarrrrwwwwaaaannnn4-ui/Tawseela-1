import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { WebView } from 'react-native-webview';

import { Icon, type IconName } from '@/components/icons/icon';
import { AccentButton, LinkButton } from '@/components/ui/buttons';
import { Radio } from '@/components/ui/controls';
import { Card, Divider, FloatingBar, ScreenHeader, SummaryRow, TotalRow, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { placeOrder } from '@/lib/checkout';
import { API_URL, api } from '@/lib/api';
import { cardBrandOf } from '@/data/seed';
import { cnt, money } from '@/lib/format';
import { SPEEDS } from '@/lib/pricing';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';
import { family } from '@/theme/typography';

export default function CheckoutScreen() {
  return (
    <RevealScope>
      <Checkout />
    </RevealScope>
  );
}

function Checkout() {
  useStatusBar();
  const { c } = useTheme();
  const chrome = useChrome();
  const s = useApp(
    useShallow((st) => ({
      mode: st.mode,
      prep: st.prep,
      addr: st.addrs[st.addr] ?? st.addrs[0],
      speed: st.speed,
      payM: st.payM,
      cards: st.cards,
      defCard: st.defCard,
      note: st.note,
      cart: st.cart,
      promo: st.promo,
      fee: st.fee,
      freeAt: st.freeAt,
    })),
  );
  const t = useApp((st) => st.totals)();
  const [paying, setPaying] = useState(false);
  const [cardsReady, setCardsReady] = useState(false);
  useEffect(() => { useApp.setState({ cards: [], defCard: '' }); let active = true; api.get<{ cards: { id: string; number: string; name: string; expiry?: { month?: string; year?: string } | null; brand: string }[] }>('/v1/me/cards').then((result) => { if (!active) return; const next = result.cards.map((x) => { const b = cardBrandOf(x.number.replace(/\D/g, '')); return { id: x.id, brand: x.brand || b.name, num: x.number, exp: x.expiry ? `${String(x.expiry.month ?? '').padStart(2, '0')}/${String(x.expiry.year ?? '').slice(-2)}` : '', bg: b.bg, nick: '', name: x.name }; }); useApp.setState({ cards: next, defCard: next.some((x) => x.id === useApp.getState().defCard) ? useApp.getState().defCard : (next[0]?.id ?? '') }); }).catch(() => { if (active) useApp.setState({ cards: [], defCard: '' }); }).finally(() => { if (active) setCardsReady(true); }); return () => { active = false; }; }, []);
  const [savedCardCvv, setSavedCardCvv] = useState('');
  const [walletPhone, setWalletPhone] = useState('');
  const [paymentSheet, setPaymentSheet] = useState(false);
  const [walletProvider, setWalletProvider] = useState('');
  const [threeDSUrl, setThreeDSUrl] = useState<string | null>(null);
  const [threeDSError, setThreeDSError] = useState(false);
  const [threeDSReload, setThreeDSReload] = useState(0);
  const challengeResolver = useRef<(() => void) | null>(null);
  const finishThreeDS = () => {
    setThreeDSUrl(null);
    challengeResolver.current?.();
    challengeResolver.current = null;
  };
  const set = useApp((st) => st.setCheckout);

  /** The server validates and settles online payments; provider details stay out of customer-facing copy. */
  const pay = async () => {
    if (paying || !s.cart.length) return;
    if (s.payM !== 2 && s.payM !== 3 && !cardsReady) { useApp.getState().showToast('انتظر قليلًا', 'جارٍ تحميل بطاقات الدفع المحفوظة.', 'info'); return; }
    const toast = useApp.getState().showToast;
    if (s.payM === 3 && !/^01[0125]\d{8}$/.test(walletPhone.replace(/[\s()-]/g, ''))) {
      toast('رقم المحفظة غير صحيح', 'أدخل رقم محفظة مصريًا صحيحًا يبدأ بـ 010 أو 011 أو 012 أو 015.', 'error');
      return;
    }
    const selectedCard = s.cards.find((card) => card.id === s.defCard);
    if ((s.payM === 0 || s.payM === 1) && (!selectedCard || !/^\d{3,4}$/.test(savedCardCvv))) {
      toast('اختر بطاقة محفوظة', 'اختر بطاقة محفوظة وأدخل رمز الأمان لإتمام الدفع.', 'error');
      return;
    }
    setPaying(true);
    const r = await placeOrder(
      s.payM === 0 || s.payM === 1 ? { token: selectedCard!.id, cvv: savedCardCvv } : undefined,
      s.payM === 3 ? walletPhone : undefined,
      (url) => new Promise<void>((resolve) => {
        challengeResolver.current = resolve;
        setThreeDSError(false);
        setThreeDSUrl(url);
      }),
    );
    setSavedCardCvv(''); setWalletPhone('');
    setPaying(false);
    if (r.ok) router.replace('/success');
    else if (r.priceChanged) toast('Prices changed', `The menu was just updated — your new total is ${money(r.total ?? t.total)}`, 'sync');
    else if (r.cancelled) toast('Payment cancelled', r.message, 'info');
    else toast('Order not placed', r.message, 'error');
  };

  const walletOptions = [
    { name: 'Orange Cash', color: '#F58220', mark: 'O' },
    { name: 'Vodafone Cash', color: '#E60000', mark: 'V' },
    { name: 'Etisalat Cash', color: '#087B43', mark: 'e&' },
    { name: 'WE Pay', color: '#6B2D91', mark: 'WE' },
  ];
  const sel = (on: boolean) => ({ borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface1 });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: chrome.underHeader, paddingBottom: chrome.bottomPad - 10, paddingHorizontal: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {s.mode === 'pickup' ? (
          <Reveal i={0} style={{ gap: 10 }}>
            <Txt s={18} w={600} ls={-0.01}>
              Pick up at
            </Txt>
            <Card radius={20} style={styles.addrCard}>
              <View style={[styles.tile, { backgroundColor: c.accentSoft }]}>
                <Icon name="storefront" size={23} fill color={c.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt s={15} w={700}>
                  Fig & Fennel, SoHo
                </Txt>
                <Txt s={13} color={c.text2}>
                  112 Spring St · ready in ~{s.prep} min
                </Txt>
              </View>
              <LinkButton label="Deliver" onPress={() => useApp.getState().setMode('delivery')} style={{ paddingHorizontal: 10 }} />
            </Card>
          </Reveal>
        ) : (
          <>
            <Reveal i={0} style={{ gap: 10 }}>
              <Txt s={18} w={600} ls={-0.01}>
                Deliver to
              </Txt>
              <Card radius={20} style={styles.addrCard}>
                <View style={[styles.tile, { backgroundColor: c.accentSoft }]}>
                  <Icon name={s.addr.icon} size={23} fill color={c.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt s={15} w={700}>
                    {s.addr.tag}
                  </Txt>
                  <Txt s={13} color={c.text2} numberOfLines={1}>
                    {s.addr.l1}
                  </Txt>
                </View>
                <LinkButton label="Change" size={13.5} onPress={() => router.push('/addresses')} style={{ paddingHorizontal: 12 }} />
              </Card>
            </Reveal>
            <Reveal i={1} style={{ gap: 10 }}>
              <Txt s={18} w={600} ls={-0.01}>
                Delivery speed
              </Txt>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {SPEEDS.map((o, i) => (
                  <PressableScale key={o.t} onPress={() => set({ speed: i })} scaleTo={0.97} style={[styles.speed, sel(s.speed === i)]}>
                    <View style={styles.speedTop}>
                      <Txt s={15} w={700}>
                        {o.t}
                      </Txt>
                      <Radio on={s.speed === i} />
                    </View>
                    <Txt s={13} color={c.text2}>
                      {o.s}
                    </Txt>
                    <Txt s={12.5} w={700} style={{ marginTop: 4 }}>
                      {o.fee ? '+' + money(o.fee) : 'No extra fee'}
                    </Txt>
                  </PressableScale>
                ))}
              </View>
            </Reveal>
          </>
        )}

        <Reveal i={2} style={{ gap: 10 }}>
          <Txt s={18} w={600}>طريقة الدفع</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PressableScale onPress={() => { set({ payM: 2 }); setPaymentSheet(false); }} scaleTo={0.98}
              style={[styles.choice, sel(s.payM === 2)]}>
              <Icon name="payments" size={22} color={s.payM === 2 ? c.accent : c.text1} />
              <Txt s={13} w={700} align="center">الدفع النقدي عند الاستلام</Txt>
              <Radio on={s.payM === 2} />
            </PressableScale>
            <PressableScale onPress={() => setPaymentSheet(true)} scaleTo={0.98}
              style={[styles.choice, sel(s.payM !== 2)]}>
              <Icon name="credit_card" size={22} color={s.payM !== 2 ? c.accent : c.text1} />
              <Txt s={13} w={700} align="center">اختيار طريقة دفع</Txt>
              <Radio on={s.payM !== 2} />
            </PressableScale>
          </View>
          {s.payM === 3 ? (
            <Card radius={20} style={{ padding: 16, gap: 10 }}>
              <Txt s={15} w={700}>{walletProvider || 'محفظة الموبايل'}</Txt>
              <TextInput value={walletPhone} onChangeText={(v) => setWalletPhone(v.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="01XXXXXXXXX" keyboardType="phone-pad" maxLength={11}
                style={[styles.note, { minHeight: 52, borderColor: c.line, backgroundColor: c.surface1, color: c.text1 }]} />
            </Card>
          ) : null}
          {(s.payM === 0 || s.payM === 1) ? (
            <Card radius={20} style={{ padding: 16, gap: 10 }}>
              <Txt s={14} w={700}>بطاقات الدفع المحفوظة</Txt>
              {s.cards.length ? s.cards.map((card) => (
                <PressableScale key={card.id} onPress={() => { useApp.getState().makeDefaultCard(card.id); set({ payM: 1 }); }} style={[styles.sheetRow, { borderColor: card.id === s.defCard ? c.accent : c.line, backgroundColor: card.id === s.defCard ? c.accentSoft : c.surface1 }]}>
                  <Icon name="credit_card" size={22} color={c.accent} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt s={14} w={700}>{card.brand} · {card.num}</Txt>
                    <Txt s={11.5} color={c.text3}>{card.name}</Txt>
                  </View>
                  <Radio on={card.id === s.defCard} />
                </PressableScale>
              )) : (
                <Txt s={13} color={c.text2}>لا توجد بطاقة محفوظة حتى الآن.</Txt>
              )}
              {s.cards.length ? <TextInput value={savedCardCvv} onChangeText={(v) => setSavedCardCvv(v.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="رمز الأمان CVV" keyboardType="number-pad" secureTextEntry maxLength={4} style={[styles.note, { minHeight: 50, borderColor: c.line, backgroundColor: c.surface1, color: c.text1 }]} /> : null}
              <AccentButton label={s.cards.length ? 'إدارة البطاقات' : 'إضافة فيزا أو ماستركارد'} onPress={() => router.push('/payments')} icon="add_card" />
            </Card>
          ) : null}
        </Reveal>

        <Reveal i={4} style={{ gap: 10 }}>
          <Txt s={18} w={600} ls={-0.01}>
            Note for the courier
          </Txt>
          <TextInput
            value={s.note}
            onChangeText={(v) => set({ note: v })}
            placeholder="Buzzer 4B, leave at the door…"
            placeholderTextColor={c.text3}
            multiline
            style={[styles.note, { borderColor: c.line, backgroundColor: c.surface1, color: c.text1, fontFamily: family(500) }]}
          />
        </Reveal>

        <Reveal i={5}>
          <Card style={{ padding: 16, gap: 10 }}>
            <SummaryRow label={`Subtotal · ${cnt(t.count, 'item')}`} value={money(t.sub)} />
            <SummaryRow label="Delivery" value={t.fee + t.speedFee ? money(t.fee + t.speedFee) : 'Free'} />
            {s.promo ? <SummaryRow label="Discount" value={'−' + money(t.disc)} valueColor={c.ok} /> : null}
            <Divider />
            <TotalRow value={money(t.total)} />
          </Card>
        </Reveal>
      </ScrollView>

      <ScreenHeader
        title="Checkout"
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="lock" size={16} fill color={c.ok} />
            <Txt s={12} w={600} color={c.ok}>
              Secure
            </Txt>
          </View>
        }
      />

      <Modal visible={paymentSheet} transparent animationType="slide" onRequestClose={() => setPaymentSheet(false)}>
        <PressableScale onPress={() => setPaymentSheet(false)} style={styles.sheetBackdrop}>
          <View />
        </PressableScale>
        <View style={[styles.sheet, { backgroundColor: c.surface1, borderColor: c.line }]}>
          <View style={styles.sheetHandle} />
          <Txt s={19} w={700}>اختار طريقة الدفع</Txt>
          <PressableScale style={styles.sheetRow} onPress={() => { set({ payM: 0 }); setWalletProvider(''); setPaymentSheet(false); }}>
            <View style={[styles.brandMark, { backgroundColor: '#111111' }]}><Txt color="#FFFFFF" w={800}>Pay</Txt></View>
            <View style={{ flex: 1 }}><Txt s={15} w={700}>بطاقة محفوظة</Txt><Txt s={12} color={c.text3}>الدفع باستخدام بطاقة محفوظة عبر Kashier</Txt></View>
            <Radio on={s.payM === 0} />
          </PressableScale>
          {walletOptions.map((w) => (
            <PressableScale key={w.name} style={styles.sheetRow} onPress={() => { set({ payM: 3 }); setWalletProvider(w.name); setPaymentSheet(false); }}>
              <View style={[styles.brandMark, { backgroundColor: w.color }]}><Txt color="#FFFFFF" w={800}>{w.mark}</Txt></View>
              <View style={{ flex: 1 }}><Txt s={15} w={700}>{w.name}</Txt></View>
              <Radio on={s.payM === 3 && walletProvider === w.name} />
            </PressableScale>
          ))}
          <PressableScale style={styles.sheetRow} onPress={() => { set({ payM: 1 }); setPaymentSheet(false); router.push('/payments'); }}>
            <View style={[styles.brandMark, { backgroundColor: '#E8E8E8' }]}><Icon name="credit_card" size={22} /></View>
            <View style={{ flex: 1 }}><Txt s={15} w={700}>إضافة فيزا</Txt><Txt s={12} color={c.text3}>Visa أو Mastercard</Txt></View>
            <Icon name="chevron_right" size={20} color={c.text3} />
          </PressableScale>
          <PressableScale onPress={() => setPaymentSheet(false)} style={styles.sheetClose}><Txt s={14} w={700}>إغلاق</Txt></PressableScale>
        </View>
      </Modal>
      <Modal visible={!!threeDSUrl} transparent animationType="slide" onRequestClose={finishThreeDS}>
        <View style={styles.threeDSRoot}>
          <View style={[styles.threeDSSheet, { backgroundColor: c.bg, borderColor: c.line }]}>
          <View style={[styles.threeDSHeader, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <PressableScale onPress={finishThreeDS} style={[styles.threeDSClose, { backgroundColor: c.bg, borderColor: c.line }]} accessibilityRole="button" accessibilityLabel="إغلاق التحقق">
              <Icon name="close" size={21} color={c.text1} />
            </PressableScale>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Txt s={16} w={700}>التحقق من البنك</Txt>
              <Txt s={11.5} color={c.text3}>أدخل رمز التأكيد داخل التطبيق</Txt>
            </View>
            <View style={styles.threeDSEmpty} />
          </View>
          {threeDSUrl ? (
            <WebView
              key={threeDSReload}
              source={{ uri: threeDSUrl }}
              style={styles.threeDSWebView}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled
              setSupportMultipleWindows={false}
              originWhitelist={['https://*']}
              onShouldStartLoadWithRequest={(request) => {
                let returnUrl = '';
                try { returnUrl = decodeURIComponent(new URL(threeDSUrl).searchParams.get('merchantRedirect') || ''); } catch {}
                const target = request.url;
                const isReturn = target.startsWith(API_URL + '/v1/payments/kashier/return') ||
                  (returnUrl.length > 0 && target.startsWith(returnUrl));
                if (isReturn) {
                  finishThreeDS();
                  return false;
                }
                return target.startsWith('https://');
              }}
              onError={() => setThreeDSError(true)}
              onHttpError={(event) => { if (event.nativeEvent.statusCode >= 400) setThreeDSError(true); }}
              startInLoadingState
              renderLoading={() => <View style={styles.threeDSLoading}><Txt s={13} color={c.text2}>جارٍ تحميل صفحة التحقق الآمنة…</Txt></View>}
            />
          ) : null}
          {threeDSError ? (
            <View style={[styles.threeDSError, { backgroundColor: c.surface1 }]}>
              <Txt s={13} w={600} color={c.err}>تعذر تحميل صفحة البنك. تحقق من اتصال الإنترنت وحاول مرة أخرى.</Txt>
              <PressableScale onPress={() => { setThreeDSError(false); setThreeDSReload((v) => v + 1); }}><Txt s={13} w={700} color={c.accent}>إعادة المحاولة</Txt></PressableScale>
            </View>
          ) : null}
          </View>
        </View>
      </Modal>
      <FloatingBar>
        <AccentButton
          height={54}
          loading={paying}
          loadingLabel={s.payM === 2 ? 'جارٍ تأكيد الطلب…' : s.payM === 3 ? 'في انتظار موافقة المحفظة…' : 'جارٍ معالجة البطاقة…'}
          label={s.payM === 2 ? `تأكيد الطلب · ${money(t.total)}` : s.payM === 3 ? `ادفع بالمحفظة · ${money(t.total)}` : `ادفع ${money(t.total)}`}
          icon="lock"
          iconFill
          onPress={() => void pay()}
        />
      </FloatingBar>
    </View>
  );
}

const styles = StyleSheet.create({
  threeDSRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.48)' },
  threeDSSheet: { height: '94%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, overflow: 'hidden', paddingTop: 12 },
  threeDSHeader: { minHeight: 66, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  threeDSClose: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  threeDSEmpty: { width: 40, height: 40 },
  threeDSWebView: { flex: 1, backgroundColor: '#FFFFFF' },
  threeDSLoading: { position: 'absolute', top: '48%', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  threeDSError: { position: 'absolute', bottom: 20, left: 16, right: 16, padding: 14, borderRadius: 16, gap: 10 },
  addrCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  tile: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  speed: { flex: 1, padding: 14, borderRadius: 18, borderWidth: 1.5, gap: 4 },
  speedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pay: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1.5 },
  choice: { flex: 1, minHeight: 116, padding: 12, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 34, gap: 10 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#B8B8B8', marginBottom: 8 },
  sheetRow: { minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: '#E6E6E6', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandMark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sheetClose: { height: 48, alignItems: 'center', justifyContent: 'center' },
  payTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  note: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14.5, minHeight: 76, textAlignVertical: 'top' },
});
