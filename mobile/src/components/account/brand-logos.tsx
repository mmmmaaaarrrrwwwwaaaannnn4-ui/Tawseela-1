import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Txt } from '@/components/ui/txt';

type NetworkLogoProps = { brand: string; width: number; height: number };
type WalletLogoProps = { provider: string; width: number; height: number };

export function PaymentNetworkLogo({ brand, width, height }: NetworkLogoProps) {
  const key = brand.toUpperCase().replace(/[^A-Z]/g, '');
  if (key.includes('VISA')) {
    return <Svg width={width} height={height} viewBox="0 0 48 16"><Path d="M19 1 12 15H6L3 4c-.2-.8-.4-1-1.2-1.3L0 2.2V1h9l2 9 4-9h4Zm5 0-3 14h-5l3-14h5Zm12 4c0-1-.8-1.5-2.4-1.5-1.4 0-2.8.3-4 .8l.7-3.1C31.5.7 33 .4 34.8.4c4 0 6.2 1.6 6.2 4.3 0 4.7-6.5 4.9-6.5 6.5 0 .5.6.8 1.7.8 1.5 0 3.1-.4 4.4-1l-.7 3.3c-1.4.5-2.8.7-4.4.7-4 0-6.2-1.5-6.2-4.1C29.3 6.4 36 6.2 36 5Z" fill="#1A1F71" /></Svg>;
  }
  if (key.includes('MASTER')) {
    return <Svg width={width} height={height} viewBox="0 0 64 42"><Circle cx="23" cy="21" r="20" fill="#EB001B"/><Circle cx="41" cy="21" r="20" fill="#F79E1B"/><Path d="M32 5a20 20 0 0 1 0 32 20 20 0 0 1 0-32Z" fill="#FF5F00"/></Svg>;
  }
  if (key.includes('AMEX') || key.includes('AMERICAN')) {
    return <Svg width={width} height={height} viewBox="0 0 70 44"><Rect width="70" height="44" rx="4" fill="#1677C8"/><SvgText x="35" y="28" fill="#FFF" fontSize="16" fontWeight="bold" textAnchor="middle">AMEX</SvgText></Svg>;
  }
  if (key.includes('MEEZA') || key.includes('ميزة')) {
    return <View style={[styles.logo, { width, height }]}><Txt s={Math.max(11,height*.55)} w={800} color="#087B55">ميزة</Txt></View>;
  }
  if (key.includes('DISCOVER')) {
    return <View style={[styles.logo,{width,height}]}><Txt s={Math.max(10,height*.45)} w={800} color="#333">DISCOVER</Txt></View>;
  }
  return <View style={[styles.logo,{width,height}]}><Txt s={Math.max(11,height*.5)} w={700} color="#777">CARD</Txt></View>;
}

export function WalletProviderLogo({ provider, phone = '', width, height }: WalletLogoProps & { phone?: string }) {
  const name = provider.toLowerCase();
  const digits = phone.replace(/\\D/g, '');
  const orange = name.includes('orange') || digits.startsWith('012');
  const vodafone = name.includes('vodafone') || digits.startsWith('010');
  const etisalat = name.includes('etisalat') || digits.startsWith('011');
  const we = name === 'we' || name.includes(' telecom') || digits.startsWith('015');
  const color = vodafone ? '#E60000' : orange ? '#F58220' : etisalat ? '#007C52' : we ? '#6A2C91' : '#176B87';
  const label = vodafone ? 'V' : orange ? 'Orange' : etisalat ? 'e&' : we ? 'WE' : 'IP';
  return (
    <View style={[styles.walletLogo, { width, height }]}>
      {vodafone ? (
        <Svg width={width * .72} height={height * .82} viewBox="0 0 48 48"><Path d="M25 4c-10 0-18 8-18 18s8 18 18 18c8 0 14-5 17-12-3 2-6 3-10 3-8 0-14-6-14-14 0-5 2-9 7-13Z" fill="#E60000"/><Path d="M35 5c4 2 7 6 8 11-4-2-8-2-12-1 1-4 2-7 4-10Z" fill="#E60000"/></Svg>
      ) : orange ? (
        <Svg width={width * .9} height={height * .8} viewBox="0 0 90 32"><Rect x="1" y="1" width="88" height="30" rx="6" fill="#F58220"/><SvgText x="45" y="21" fill="#FFFFFF" fontSize="17" fontWeight="bold" textAnchor="middle">Orange</SvgText></Svg>
      ) : etisalat ? (
        <Svg width={width * .72} height={height * .82} viewBox="0 0 48 48"><Path d="M8 13c6-8 23-10 31 0-6-2-11 0-15 5-5 6-11 8-18 4 5-1 8-4 10-8-3-2-5-2-8-1Zm1 12c8 4 15 2 20-3 5-5 10-7 14-5-3 9-12 17-23 17-5 0-9-3-11-9Z" fill="#007C52"/></Svg>
      ) : (
        <View style={[styles.walletMark, { backgroundColor: color }]}><Txt s={Math.max(10, height * .42)} w={800} color="#FFFFFF">{label}</Txt></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', justifyContent: 'center' },
  walletLogo: { alignItems: 'center', justifyContent: 'center' },
  walletMark: { minWidth: 28, minHeight: 24, paddingHorizontal: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
