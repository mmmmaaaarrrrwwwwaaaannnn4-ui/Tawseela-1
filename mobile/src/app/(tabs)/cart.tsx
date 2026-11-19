import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { openDish } from '@/components/dish-card';
import { browseMenu, EmptyHero, goCheckout } from '@/components/empty-hero';
import { Icon } from '@/components/icons/icon';
import { AccentButton, InkButton } from '@/components/ui/buttons';
import { ProgressBar, Stepper } from '@/components/ui/controls';
import { Card, Divider, SummaryRow, TotalRow, useChrome } from '@/components/ui/layout';
import { DishImage } from '@/components/ui/media';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { cnt, money } from '@/lib/format';
import { lineMeta, lineUnit } from '@/lib/pricing';
import { useApp } from '@/store/app-store';
import { selectSignedIn, useSession } from '@/store/session';
import { alpha } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { family } from '@/theme/typography';

export default function CartScreen() {
  useStatusBar();
  const { c } = useTheme();
  const chrome = useChrome();
  const signedIn = useSession(selectSignedIn);
  const s = useApp(
    useShallow((st) => ({
      cart: st.cart,
      promo: st.promo,
      promoDraft: st.promoDraft,
      freeAt: st.freeAt,
      storeOpen: st.storeOpen,
      mode: st.mode,
      fee: st.fee,
      speed: st.speed,
      menu: st.menu,
    })),
  );
  const totals = useApp((st) => st.totals)();
  const dishOf = useApp((st) => st.dishOf);
  const [err, setErr] = useState('');
  const promoIn = s.promoDraft;
  const setPromoIn = (v: string) => {
    useApp.getState().setPromoDraft(v.toUpperCase());
    setErr('');
  };

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: chrome.contentTop, paddingBottom: chrome.bottomPad, paddingHorizontal: 20, gap: 12 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Reveal i={0} style={styles.cartTopBar}>
            <View style={{ flex: 1, gap: 3, alignItems: 'flex-end' }}>
              <Txt s={30} w={700} ls={-0.03} align="right">سلة مشترياتك</Txt>
              <Txt s={13.5} w={500} color={c.text3} align="right">{cnt(totals.count, 'item')} · توصيلة</Txt>
            </View>
            <PressableScale onPress={() => router.push('/saved')} scaleTo={0.92}
              accessibilityRole="button" accessibilityLabel="المفضلة"
              style={[styles.favoriteButton, { backgroundColor: c.surface1, borderColor: c.line }]}>
              <Icon name="favorite" size={23} color={c.accent} fill />
            </PressableScale>
          </Reveal>

          {!s.cart.length ? (
            <View style={{ marginHorizontal: 10 }}>
              <EmptyHero
                top={50}
                icon="add_shopping_cart"
                title="سلتك فارغة"
                text="اختار منتجاتك المفضلة وابدأ طلبك"
                cta="تصفح المنتجات"
                onPress={browseMenu}
              />
            </View>
          ) : null}

          {s.cart.map((line, i) => {
            const d = dishOf(line.id);
            return (
              <Reveal key={`${line.id}-${line.s}-${line.ex.join('.')}-${line.deal ? 'd' : ''}`} i={1 + i} from={{ x: 24 }}>
                <View style={[styles.line, { backgroundColor: c.surface1, borderColor: c.line, direction: 'rtl' }]}>
                  <PressableScale onPress={() => openDish(line.id)} scaleTo={0.95} accessibilityLabel={d.name}>
                    <DishImage uri={d.img} size={74} />
                  </PressableScale>
                  <View style={{ flex: 1, minWidth: 0, gap: 3, alignItems: 'flex-end' }}>
                    <Txt s={15} w={700} numberOfLines={1} align="right">
                      {d.name}
                    </Txt>
                    <Txt s={12} color={c.text3} numberOfLines={1}>
                      {lineMeta(line, d) || 'عادي'}
                      {line.deal ? (line.dealPct === 100 ? ' · Reward' : ` · Deal −${line.dealPct}%`) : ''}
                    </Txt>
                    <Txt s={16} w={600} color={c.text1} style={{ marginTop: 2 }} align="right">
                      {money(lineUnit(line, d) * line.q)}
                    </Txt>
                  </View>
                  <Stepper value={line.q} onDec={() => useApp.getState().setQty(i, -1)} onInc={() => useApp.getState().setQty(i, 1)} />
                </View>
              </Reveal>
            );
          })}

          {s.cart.length ? (
            <Reveal i={2} style={{ gap: 12 }}>
              <Card radius={20} style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="two_wheeler" size={19} fill color={c.accent} />
                  <Txt s={13.5} w={600}>
                    {totals.sub >= s.freeAt ? 'تم تفعيل التوصيل المجاني' : `أضف ${money(s.freeAt - totals.sub)} للحصول على توصيل مجاني`}
                  </Txt>
                </View>
                <ProgressBar pct={Math.min(100, (totals.sub / s.freeAt) * 100)} height={7} gradient />
              </Card>

              {!s.promo ? (
                <View style={{ gap: 6 }}>
                  <View style={[styles.promo, { backgroundColor: c.surface1, borderColor: c.line }]}>
                    <Icon name="sell" size={20} color={c.text3} />
                    <TextInput
                      value={promoIn}
                      onChangeText={setPromoIn}
                      placeholder="كود الخصم"
                      placeholderTextColor={c.text3}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() =>
                        void useApp
                          .getState()
                          .applyPromo(promoIn)
                          .then((e) => setErr(e ?? ''))
                      }
                      style={[styles.promoInput, { color: c.text1, fontFamily: family(600) }]}
                    />
                    <InkButton
                      label="تطبيق"
                      onPress={() =>
                        void useApp
                          .getState()
                          .applyPromo(promoIn)
                          .then((e) => setErr(e ?? ''))
                      }
                    />
                  </View>
                  {err ? (
                    <Txt s={12.5} w={600} color={c.err} style={{ paddingLeft: 16 }}>
                      {err}
                    </Txt>
                  ) : null}
                </View>
              ) : (
                <View style={[styles.applied, { backgroundColor: alpha(c.ok, 0.12) }]}>
                  <Icon name="check_circle" size={20} fill color={c.ok} />
                  <Txt s={14} w={700} style={{ flex: 1 }}>
                    {s.promo.code} · {s.promo.pct}% off
                  </Txt>
                  <PressableScale
                    onPress={() => useApp.getState().removePromo()}
                    scaleTo={0.95}
                    style={{ height: 36, paddingHorizontal: 12, justifyContent: 'center' }}
                  >
                    <Txt s={13} w={600} color={c.text2}>
                      Remove
                    </Txt>
                  </PressableScale>
                </View>
              )}

              <View style={{ gap: 8 }}>
                <Txt s={17} w={700} align="right">ملاحظات إضافية</Txt>
                <PressableScale onPress={() => { updateNoteDraft(s.note); setNoteSheetOpen(true); }} style={[styles.noteSummary, { borderColor: c.line, backgroundColor: c.surface1 }]}>
                  <Icon name="edit_note" size={22} color={c.accent} />
                  <Txt s={14} w={500} style={{ color: s.note.trim() ? c.text1 : c.text3, flex: 1, textAlign: 'right' }} numberOfLines={2}>{s.note.trim() || 'هل تود أن تخبرنا أي شيء آخر؟'}</Txt>
                  <Icon name="chevron_left" size={18} color={c.text3} />
                </PressableScale>
              </View>
              <Card style={{ padding: 16, gap: 10 }}>
                <SummaryRow label="المجموع الفرعي" value={money(totals.sub)} />
                <SummaryRow label="التوصيل" value={totals.fee ? money(totals.fee) : 'مجاني'} />
                {s.promo ? <SummaryRow label="الخصم" value={'−' + money(totals.disc)} valueColor={c.ok} /> : null}
                <Divider />
                <TotalRow value={money(totals.cartTotal)} />
              </Card>

              <AccentButton height={58} glow dim={!s.storeOpen} onPress={goCheckout} contentStyle={styles.ckContent} accessibilityLabel="Checkout">
                <Txt s={16.5} w={700} color={c.accentInk}>
                  {!s.storeOpen ? 'المطعم مغلق' : signedIn ? 'إتمام الطلب' : 'سجّل الدخول لإتمام الطلب'}
                </Txt>
                <View style={[styles.ckPill, { backgroundColor: c.text1 }]}>
                  <Txt s={15} w={700} color={c.surface1}>
                    {money(totals.cartTotal)}
                  </Txt>
                  <Icon name="arrow_forward" size={18} color={c.surface1} />
                </View>
              </AccentButton>
            </Reveal>
          ) : null}
        </ScrollView>
      <Modal visible={noteSheetOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={closeNoteSheet}>
        <View style={styles.noteModalRoot}>
          <PressableScale onPress={closeNoteSheet} style={StyleSheet.absoluteFill} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.noteModalSheet}>
            <View style={styles.noteHandle} />
            <View style={styles.noteHeader}>
              <View style={{ flex: 1 }} />
              <PressableScale onPress={closeNoteSheet} style={styles.noteClose}><X size={24} color="#1F1F1F" /></PressableScale>
            </View>
            <View style={styles.noteEditor}>
              <TextInput value={noteDraft} onChangeText={updateNoteDraft} placeholder="هل تود أن تخبرنا أي شيء آخر؟" placeholderTextColor="#A7A7A7" multiline autoFocus returnKeyType="done" blurOnSubmit onSubmitEditing={saveNoteDraft} style={[styles.noteInput, { color: '#1F1F1F', fontFamily: family(500) }]} />
              <View style={styles.noteTools}>
                <PressableScale onPress={toggleNoteSpeech} style={[styles.noteTool, speechActive && { backgroundColor: '#FDECEC', borderColor: '#D92D20' }]}><Mic size={19} color={speechActive ? '#D92D20' : '#12291F'} /></PressableScale>
                <View style={{ flex: 1 }} />
                {speechProcessing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><ActivityIndicator size="small" color="#12291F" /><Txt s={12} color="#7A7A7A">جارٍ تحويل الصوت إلى نص</Txt></View> : null}
                <PressableScale onPress={saveNoteDraft} style={styles.noteSave}><Icon name="check" size={22} color="#FFFFFF" /></PressableScale>
              </View>
            </View>
            {speechActive ? <Txt s={12} w={600} style={{ color: '#D92D20', textAlign: 'center' }}>جارٍ الاستماع… اضغط الميكروفون لإيقاف الإملاء</Txt> : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  cartTopBar: { paddingTop: 6, minHeight: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  
  favoriteButton: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 22, borderWidth: 1, minHeight: 104 },
  
  promo: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, paddingLeft: 16, borderRadius: 22, borderWidth: 1 },
  
  promoInput: { flex: 1, minWidth: 0, fontSize: 14.5, letterSpacing: 0.58, paddingVertical: 0, height: 42 },
  applied: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 16, paddingRight: 8, borderRadius: 20 },
  ckContent: { justifyContent: 'space-between', paddingLeft: 24, paddingRight: 10, flexDirection: 'row' },
  
  ckPill: { height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.14)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteSummary: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteModalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  noteModalSheet: { minHeight: '42%', maxHeight: '82%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24, gap: 14 },
  noteHandle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: '#C9C9C9' },
  noteHeader: { height: 48, flexDirection: 'row', alignItems: 'center' },
  noteClose: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: '#E1E3E6', alignItems: 'center', justifyContent: 'center' },
  noteEditor: { minHeight: 190, borderWidth: 1.5, borderColor: '#1F1F1F', borderRadius: 22, padding: 14, gap: 10 },
  noteInput: { minHeight: 110, textAlign: 'right', textAlignVertical: 'top', padding: 0, fontSize: 14 },
  noteTools: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  noteTool: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#E1E3E6', alignItems: 'center', justifyContent: 'center' },
  noteSave: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#12291F', alignItems: 'center', justifyContent: 'center' },

});
