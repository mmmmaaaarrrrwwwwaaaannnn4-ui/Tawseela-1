import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Txt } from '@/components/ui/txt';

type NetworkLogoProps = { brand: string; width: number; height: number };
type WalletLogoProps = { provider: string; phone?: string; width: number; height: number };

const NETWORK_ASSETS = {
  VISA: require('../../assets/payments/visa.webp'),
  MASTERCARD: require('../../assets/payments/mastercard.webp'),
  MEEZA: require('../../assets/payments/meeza.png'),
  AMEX: require('../../assets/payments/amex-safekey.jpg'),
} as const;

export function PaymentNetworkLogo({ brand, width, height }: NetworkLogoProps) {
  const key = brand.toUpperCase().replace(/[^A-Z]/g, '');
  const asset = key.includes('VISA') ? NETWORK_ASSETS.VISA
    : key.includes('MASTER') ? NETWORK_ASSETS.MASTERCARD
    : key.includes('MEEZA') ? NETWORK_ASSETS.MEEZA
    : key.includes('AMEX') || key.includes('AMERICAN') ? NETWORK_ASSETS.AMEX
    : NETWORK_ASSETS.MASTERCARD;
  return <Image source={asset} style={{ width, height }} contentFit="contain" />;
}

export function WalletProviderLogo({ provider, phone = '', width, height }: WalletLogoProps) {
  const digits = phone.replace(/\\D/g, '');
  const name = provider.toLowerCase();
  const asset = digits.startsWith('012') || name.includes('orange') ? require('../../assets/payments/orange-cash.png')
    : digits.startsWith('010') || name.includes('vodafone') ? require('../../assets/payments/vodafone-cash.png')
    : digits.startsWith('011') || name.includes('etisalat') || name.includes('e&') ? require('../../assets/payments/etisalat-cash.png')
    : digits.startsWith('015') || name === 'we' || name.includes('we pay') ? require('../../assets/payments/we-pay.png')
    : name.includes('insta') ? require('../../assets/payments/instapay.png')
    : null;
  if (asset) return <Image source={asset} style={{ width, height }} contentFit="contain" />;
  return <View style={[styles.logo, { width, height }]}><Txt s={11} w={600} color="#66736B">محفظة</Txt></View>;
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', justifyContent: 'center' },
});