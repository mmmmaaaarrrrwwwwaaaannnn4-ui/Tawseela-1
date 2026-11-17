import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { cardBrandOf } from '@/data/seed';
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
              <View pointerEvents="none" style={styles.chipCenter}>
                <CardChip />
              </View>
              <Txt s={16} w={500} ls={0.13} color="#FFFFFF" tabular style={styles.last4}>•• {card.num.replace(/\D/g, '').slice(-4) || '••••'}</Txt>
              {['VISA', 'MASTERCARD', 'AMEX', 'MEEZA', 'MADA', 'DISCOVER'].includes(cardBrandOf(card.num.replace(/\D/g, '')).name !== 'CARD' ? cardBrandOf(card.num.replace(/\D/g, '')).name : card.brand.toUpperCase()) ? (
                <View style={styles.networkLogo}>
                  <PaymentNetworkLogo brand={cardBrandOf(card.num.replace(/\D/g, '')).name !== 'CARD' ? cardBrandOf(card.num.replace(/\D/g, '')).name : card.brand} width={64} height={34} />
                </View>
              ) : null}
              {isDef ? <View style={styles.def}><Txt s={9} w={700} color="#FFFFFF">أساسية</Txt></View> : null}
            </CardSurface>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
            <CardSurface bg={TAWSELA_CARD_GRADIENT} logo="back" style={{ padding: 0 }}>
              <Txt s={14} w={500} color={CARD_INK} style={styles.currency}>EGP</Txt>
              <Txt s={15} w={500} color={CARD_INK} tabular style={styles.number}>••••  ••••  ••••  {card.num.replace(/\D/g, '').slice(-4) || '••••'}</Txt>
              <Txt s={13} w={500} color={CARD_INK} numberOfLines={1} style={styles.holder}>{holder.toUpperCase()}</Txt>
              <View style={styles.securityInfo}>
                <View style={styles.securityCell}>
                  <Txt s={11} color={CARD_INK}>CVV</Txt>
                  <Txt s={13} w={500} color={CARD_INK}>•••</Txt>
                </View>
                <View style={styles.securityCell}>
                  <Txt s={11} color={CARD_INK}>صالحة حتى</Txt>
                  <Txt s={13} w={500} color={CARD_INK}>{card.exp || '••/••'}</Txt>
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
  chipCenter: { position: 'absolute', top: 0, bottom: 0, left: '5.3%', justifyContent: 'center' },
  last4: { position: 'absolute', left: '5.6%', bottom: '8.2%' },
  networkLogo: { position: 'absolute', right: '4.2%', bottom: '6.5%' },
  def: { position: 'absolute', top: '7%', right: '5%', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: 'rgba(253,250,235,0.16)' },
  currency: { position: 'absolute', left: '5.3%', top: '8.4%' },
  number: { position: 'absolute', right: '5.3%', top: '53%' },
  holder: { position: 'absolute', left: '5.3%', bottom: '8.5%', maxWidth: '48%' },
  securityInfo: { position: 'absolute', right: '5.3%', bottom: '8%', flexDirection: 'row', gap: 18, alignItems: 'flex-end' },
  securityCell: { alignItems: 'flex-start', gap: 3 },
});
