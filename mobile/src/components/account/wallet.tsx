import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
import { PaymentNetworkLogo } from './brand-logos';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import type { Card } from '@/data/types';

import { CARD_INK, CardChip, CardSurface, TAWSELA_CARD_GRADIENT } from './card-face';

/** Stacked, swipeable card wallet (`wallet` in the design). */
export function Wallet({
  cards,
  index,
  defId,
  holder,
  onIndex,
}: {
  cards: Card[];
  index: number;
  defId: string | null;
  holder: string;
  onIndex: (i: number) => void;
}) {
  const [w, setW] = useState(0);
  const cur = Math.min(index, cards.length - 1);
  // Touch tracking for the horizontal swipe (`walletDown` / `walletUp` in the design).
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const onStart = (e: GestureResponderEvent) => {
    start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    moved.current = false;
  };
  const onMove = (e: GestureResponderEvent) => {
    const s = start.current;
    if (s && Math.abs(e.nativeEvent.pageX - s.x) > 10) moved.current = true;
  };
  const onEnd = (e: GestureResponderEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.nativeEvent.pageX - s.x;
    const dy = e.nativeEvent.pageY - s.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    onIndex(Math.max(0, Math.min(cards.length - 1, cur + (dx < 0 ? 1 : -1))));
  };
  return (
    <View style={styles.wallet} onLayout={(e) => setW(e.nativeEvent.layout.width)} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
      {w
        ? cards.map((c, i) => (
            <WalletCard
              key={c.id}
              card={c}
              off={i - cur}
              width={w}
              isDef={defId === c.id}
              holder={c.name || holder.toUpperCase()}
              onPress={() => {
                if (!moved.current) onIndex(i);
              }}
            />
          ))
        : null}
    </View>
  );
}

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

function WalletCard({
  card,
  off,
  width,
  isDef,
  holder,
  onPress,
}: {
  card: Card;
  off: number;
  width: number;
  isDef: boolean;
  holder: string;
  onPress: () => void;
}) {
  const x = useSharedValue(off * 0.84 * width);
  const s = useSharedValue(off === 0 ? 1 : 0.88);
  const o = useSharedValue(Math.abs(off) > 1 ? 0 : off === 0 ? 1 : 0.5);
  const [flipped, setFlipped] = useState(false);
  const rotation = useSharedValue(0);
  useEffect(() => {
    x.set(withSpring(off * 0.84 * width, { damping: 15, stiffness: 150, mass: 0.9 }));
    s.set(withSpring(off === 0 ? 1 : 0.88, { damping: 15, stiffness: 150, mass: 0.9 }));
    o.set(withTiming(Math.abs(off) > 1 ? 0 : off === 0 ? 1 : 0.5, { duration: 440, easing: EASE }));
    if (off !== 0 && flipped) {
      setFlipped(false);
      rotation.set(withTiming(0, { duration: 260 }));
    }
  }, [off, width, x, s, o, flipped, rotation]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateX: x.value }, { scale: s.value }] }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: rotation.value < 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value}deg` }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: rotation.value >= 90 ? 1 : 0,
    transform: [{ perspective: 1000 }, { rotateY: `${rotation.value - 180}deg` }],
  }));
  const toggleFlip = () => {
    if (off !== 0) { onPress(); return; }
    const next = !flipped;
    setFlipped(next);
    rotation.set(withTiming(next ? 180 : 0, { duration: 700, easing: EASE }));
  };
  return (
    <Animated.View pointerEvents={Math.abs(off) > 1 ? 'none' : 'auto'} style={[StyleSheet.absoluteFill, styles.shadow, { zIndex: 10 - Math.abs(off) }, st]}>
      <PressableScale scaleTo={0.99} onPress={toggleFlip} accessibilityLabel={`${card.brand} ${card.num}. ${flipped ? 'Show front' : 'Show back'}`}>
        <View style={{ height: 210 }}>
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
            <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="front">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 38 }}>
                <CardChip />
                <Icon name="contactless" size={29} color="#FDF9E9" />
                {isDef ? <View style={[styles.def, { marginLeft: 'auto' }]}><Txt s={9} w={700} color="#FFFFFF">أساسية</Txt></View> : null}
              </View>
              <View style={{ gap: 13, marginTop: 'auto' }}>
                <Txt s={18} w={600} ls={0.13} color="#FFFFFF" tabular>{card.num || '••••  ••••  ••••  ••••'}</Txt>
                <View style={[styles.between, { alignItems: 'flex-end' }]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Txt s={9} w={500} color="rgba(253,250,235,0.76)">اسم حامل البطاقة</Txt>
                    <Txt s={12} w={600} color="#FFFFFF" numberOfLines={1}>{holder}</Txt>
                  </View>
                  <View style={{ gap: 3, alignItems: 'flex-start' }}>
                    <Txt s={9} w={500} color="rgba(253,250,235,0.76)">MM/YY</Txt>
                    <Txt s={12} w={600} color="#FFFFFF">{card.exp || '••/••'}</Txt>
                  </View>
                  <PaymentNetworkLogo brand={card.brand} width={46} height={28} />
                </View>
              </View>
            </CardSurface>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
            <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="back" style={{ padding: 0 }}>
              <View style={styles.backStripe} />
              <View style={styles.backSignature}>
                <View style={{ flex: 1, gap: 5 }}>
                  <Txt s={9} w={700} ls={0.08} upper color={CARD_INK}>Authorized signature</Txt>
                  <View style={styles.signaturePaper}>
                    <Txt s={15} w={600} color="#153D31">{holder}</Txt>
                  </View>
                </View>
                <View style={{ width: 52, gap: 5 }}>
                  <Txt s={9} w={700} ls={0.08} upper color={CARD_INK}>CVV</Txt>
                  <View style={styles.cvvPaper}>
                    <Txt s={13} w={700} color="#153D31">•••</Txt>
                  </View>
                </View>
              </View>
            </CardSurface>
          </Animated.View>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wallet: { height: 210, marginHorizontal: 22 },
  shadow: { borderRadius: 20, shadowColor: '#1A1A1A', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  def: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: 'rgba(253,250,235,0.18)' },
  backStripe: { position: 'absolute', top: 28, left: 0, right: 0, height: 42, backgroundColor: '#111111' },
  backSignature: { position: 'absolute', top: 92, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  signaturePaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', justifyContent: 'center', paddingHorizontal: 10 },
  cvvPaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', alignItems: 'center', justifyContent: 'center' },
});
