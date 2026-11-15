import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

export const TAWSELA_CARD_GRADIENT = ['#087A56', '#00583F', '#003D2D', '#00251B'] as const;
export const CARD_INK = '#FFFDF3';

/** The exact supplied Tawsela transparent logo is used on both card faces. */
export function CardLogo({ side = 'front' }: { side?: 'front' | 'back' }) {
  return (
    <Image
      pointerEvents="none"
      source={require('../../assets/branding/tawsela-card-logo.png')}
      resizeMode="contain"
      style={side === 'front' ? styles.logoFront : styles.logoBack}
    />
  );
}

export function CardSurface({
  bg = TAWSELA_CARD_GRADIENT,
  children,
  style,
  logo,
}: {
  bg?: readonly [string, string, ...string[]];
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  logo?: 'front' | 'back';
}) {
  return (
    <View style={[styles.card, style]}>
      <LinearGradient colors={bg} start={{ x: 0.04, y: 0.04 }} end={{ x: 0.98, y: 0.96 }} style={StyleSheet.absoluteFill} />
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 210" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="cardSheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#19B57F" stopOpacity="0.5" />
            <Stop offset="0.48" stopColor="#087A56" stopOpacity="0.1" />
            <Stop offset="1" stopColor="#001A12" stopOpacity="0.35" />
          </SvgGradient>
          <SvgGradient id="cardEdge" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#A7F1D0" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#00744E" stopOpacity="0" />
          </SvgGradient>
        </Defs>
        <Path d="M-45 210 L-45 130 C20 105 44 45 125 -15 L235 -15 C145 57 122 137 54 225Z" fill="url(#cardSheen)" />
        <Path d="M55 225 C142 142 166 67 270 -18 L365 -18 C273 80 271 155 206 225Z" fill="#16A878" opacity={0.18} />
        <Path d="M-30 180 C35 116 58 53 136 -10" fill="none" stroke="#B7F8DA" strokeWidth={0.8} strokeOpacity={0.36} />
        <Path d="M-15 198 C55 130 80 68 155 0" fill="none" stroke="#B7F8DA" strokeWidth={0.7} strokeOpacity={0.22} />
        <Path d="M65 225 C145 146 170 80 253 7" fill="none" stroke="#B7F8DA" strokeWidth={0.8} strokeOpacity={0.24} />
        <Path d="M90 225 C174 142 202 84 288 18" fill="none" stroke="#B7F8DA" strokeWidth={0.7} strokeOpacity={0.16} />
        <G fill="none" stroke="#A8F4D1" strokeOpacity={0.17} strokeWidth={0.65}>
          {Array.from({ length: 34 }, (_, i) => <Path key={i} d={`M${-22 + i * 4.2} 0 L${-22 + i * 4.2} 92`} />)}
        </G>
        <Circle cx={350} cy={-2} r={125} fill="none" stroke="#9AEBC7" strokeOpacity={0.08} strokeWidth={1} />
        <Rect x={1} y={1} width={358} height={208} rx={18} fill="none" stroke="url(#cardEdge)" strokeWidth={1.4} />
      </Svg>
      {logo ? <CardLogo side={logo} /> : null}
      {children}
    </View>
  );
}

/** Gold EMV contact chip with segmented contacts and metallic highlights. */
export function CardChip() {
  return (
    <Svg width={58} height={45} viewBox="0 0 100 76">
      <Defs>
        <SvgGradient id="chipGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF3C7" />
          <Stop offset="0.28" stopColor="#EBD18B" />
          <Stop offset="0.7" stopColor="#C59B45" />
          <Stop offset="1" stopColor="#F8E3A7" />
        </SvgGradient>
        <SvgGradient id="chipShine" x1="0" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.65" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </SvgGradient>
      </Defs>
      <Rect x={1} y={1} width={98} height={74} rx={10} fill="url(#chipGold)" stroke="#8C713B" strokeWidth={1.6} />
      <Path d="M5 7 Q28 -2 48 7 L48 68 Q20 73 5 62Z" fill="url(#chipShine)" />
      <G fill="none" stroke="#8E743D" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M0 25H25L32 18V0M100 25H75L68 18V0M0 51H25L32 58V76M100 51H75L68 58V76" />
        <Rect x={32} y={18} width={36} height={40} rx={4} />
        <Path d="M32 38H68M50 18V58M25 25V51M75 25V51" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { height: 210, borderRadius: 20, padding: 22, overflow: 'hidden', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(155,244,207,0.62)' },
  logoFront: { position: 'absolute', top: 18, right: 16, width: 142, height: 56 },
  logoBack: { position: 'absolute', right: 18, bottom: 2, width: 118, height: 46, opacity: 0.18 },
});
