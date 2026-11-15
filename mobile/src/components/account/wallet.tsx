import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icons/icon';
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
        <View style={{ height: 196 }}>
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
            <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="front">
              <View style={styles.between}>
                <View style={{ gap: 2 }}>
                  <Txt s={11} w={600} ls={0.08} upper color="rgba(253,250,235,0.78)">
                    {card.nick || 'Card'}
                  </Txt>
                  <Txt s={16} w={800} ls={0.12} color={CARD_INK}>{card.brand}</Txt>
                </View>
                {isDef ? (
                  <View style={styles.def}>
                    <Txt s={10} w={700} ls={0.08} upper color="#FFFFFF">Default</Txt>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CardChip />
                <View style={{ opacity: 0.85 }}>
                  <Icon name="contactless" size={24} color="#FFFFFF" />
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <Txt s={20} w={600} ls={0.16} color="#FFFFFF">•••• {card.num}</Txt>
                <View style={[styles.between, { opacity: 0.85 }]}>
                  <Txt s={11.5} w={600} ls={0.08} color="#FFFFFF">{holder}</Txt>
                  <Txt s={11.5} w={600} ls={0.08} color="#FFFFFF">EXP {card.exp}</Txt>
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
  wallet: { height: 196, marginHorizontal: 32 },
  shadow: { borderRadius: 26, shadowColor: '#1A1A1A', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 22 }, elevation: 10 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  def: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9, backgroundColor: 'rgba(253,250,235,0.18)' },
  backStripe: { position: 'absolute', top: 28, left: 0, right: 0, height: 42, backgroundColor: '#111111' },
  backSignature: { position: 'absolute', top: 92, left: 20, right: 20, flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  signaturePaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', justifyContent: 'center', paddingHorizontal: 10 },
  cvvPaper: { height: 34, borderRadius: 4, backgroundColor: '#F8F7F0', alignItems: 'center', justifyContent: 'center' },
});
