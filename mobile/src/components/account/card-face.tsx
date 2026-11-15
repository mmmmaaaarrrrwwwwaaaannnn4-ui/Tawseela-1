import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

const TAWSELA_LOGO = require('../../assets/branding/tawsela_logo.png');

const TAWSELA_CARD_GRADIENT = ['#0C7D58', '#056244', '#014835', '#012B20', '#011B14'] as const;
export { TAWSELA_CARD_GRADIENT };
export const CARD_INK = '#FDFAEB';

/** Original transparent Tawsela logo extracted from the supplied Flip Card reference file. */
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
      <View style={styles.orb} />
      {logo ? <CardLogo side={logo} /> : null}
      {children}
    </View>
  );
}

/** Silver EMV chip with contact pattern. */
export function CardChip() {
  return (
    <Svg width={42} height={30} viewBox="0 0 100 72">
      <Defs>
        <SvgGradient id="tawselaCardChipSilver" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F7F7F7" />
          <Stop offset="0.55" stopColor="#E2E2E2" />
          <Stop offset="1" stopColor="#B9B9B9" />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={72} rx={9} fill="url(#tawselaCardChipSilver)" />
      <G fill="none" stroke="#4A4A4A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M0 26H23L28 21V12L36 0" />
        <Path d="M100 26H77L72 21V12L64 0" />
        <Path d="M0 46H23L28 51V60L36 72" />
        <Path d="M100 46H77L72 51V60L64 72" />
        <Rect x={28} y={21} width={44} height={30} />
        <Path d="M23 26V46M77 26V46" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: { height: 196, borderRadius: 26, padding: 20, overflow: 'hidden', justifyContent: 'space-between' },
  orb: { position: 'absolute', right: -40, top: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' },
  logoFront: { position: 'absolute', top: 15, right: 16, width: '36%', aspectRatio: 1000 / 390 },
  logoBack: { position: 'absolute', left: '-5%', bottom: -22, width: '110%', aspectRatio: 1000 / 390, opacity: 0.20 },
});
