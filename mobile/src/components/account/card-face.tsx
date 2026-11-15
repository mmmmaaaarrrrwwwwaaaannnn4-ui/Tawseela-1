import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

const TAWSELA_LOGO = require('../../assets/branding/tawsela_logo.png');

const TAWSELA_CARD_GRADIENT = ['#004B37', '#003B2C', '#00271D', '#001A14'] as const;
export { TAWSELA_CARD_GRADIENT };
export const CARD_INK = '#FDF9E9';

/** The supplied Tawsela mark, kept as a transparent image on the card face. */
export function CardLogo({ side = 'front' }: { side?: 'front' | 'back' }) {
  return (
    <Image
      pointerEvents="none"
      source={TAWSELA_LOGO}
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
      <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 210" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="tawselaCardWave" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#25A77C" stopOpacity="0.48" />
            <Stop offset="0.52" stopColor="#0A7656" stopOpacity="0.18" />
            <Stop offset="1" stopColor="#001C14" stopOpacity="0.05" />
          </SvgGradient>
        </Defs>
        <Path d="M-30 182 C35 110 65 55 155 -20 L245 -20 C155 65 145 112 76 230Z" fill="url(#tawselaCardWave)" />
        <Path d="M95 230 C170 145 185 65 290 -18 L360 -18 C278 70 270 155 210 230Z" fill="#0C8A63" opacity={0.22} />
        <Path d="M-12 150 C70 75 93 32 164 -8" fill="none" stroke="#7BE0B7" strokeOpacity={0.22} strokeWidth={1.1} />
        <Path d="M60 220 C138 133 160 70 244 5" fill="none" stroke="#7BE0B7" strokeOpacity={0.16} strokeWidth={1} />
        <Path d="M176 220 C240 148 254 87 340 20" fill="none" stroke="#7BE0B7" strokeOpacity={0.13} strokeWidth={1} />
        <G opacity={0.12} stroke="#B7F5D9" strokeWidth={0.6}>
          {Array.from({ length: 18 }, (_, i) => <Path key={i} d={`M${-20 + i * 5} 0 L${-20 + i * 5} 75`} />)}
        </G>
      </Svg>
      {logo ? <CardLogo side={logo} /> : null}
      {children}
    </View>
  );
}

/** Metallic gold EMV chip matching the supplied card reference. */
export function CardChip() {
  return (
    <Svg width={56} height={42} viewBox="0 0 100 72">
      <Defs>
        <SvgGradient id="tawselaCardChipGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF0B2" />
          <Stop offset="0.42" stopColor="#E4C46B" />
          <Stop offset="0.72" stopColor="#C49A3D" />
          <Stop offset="1" stopColor="#F4D987" />
        </SvgGradient>
      </Defs>
      <Rect x={1} y={1} width={98} height={70} rx={10} fill="url(#tawselaCardChipGold)" stroke="#8D702E" strokeWidth={1.4} />
      <G fill="none" stroke="#927638" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M0 24H25L31 18V0M100 24H75L69 18V0M0 48H25L31 54V72M100 48H75L69 54V72" />
        <Rect x={31} y={18} width={38} height={36} rx={4} />
        <Path d="M31 36H69M50 18V54M25 24V48M75 24V48" />
      </G>
      <Path d="M8 5H38" stroke="#FFF9D9" strokeWidth={2} opacity={0.7} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { height: 196, borderRadius: 24, padding: 20, overflow: 'hidden', justifyContent: 'space-between', borderWidth: 1, borderColor: 'rgba(118,226,183,0.34)' },
  logoFront: { position: 'absolute', top: 14, right: 14, width: '47%', height: 54, opacity: 0.98 },
  logoBack: { position: 'absolute', left: '-5%', bottom: -22, width: '110%', height: 92, opacity: 0.16 },
});
