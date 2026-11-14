import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';

export const fontAssets = {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_700Bold,
};

export type Weight = 300 | 400 | 500 | 600 | 700 | 800;

const OUTFIT: Record<Weight, string> = {
  300: 'Outfit_300Light',
  400: 'Outfit_400Regular',
  500: 'Outfit_500Medium',
  600: 'Outfit_600SemiBold',
  700: 'Outfit_700Bold',
  800: 'Outfit_800ExtraBold',
};

const IBM_PLEX_ARABIC: Record<Weight, string> = {
  300: 'IBMPlexSansArabic_400Regular',
  400: 'IBMPlexSansArabic_400Regular',
  500: 'IBMPlexSansArabic_500Medium',
  600: 'IBMPlexSansArabic_700Bold',
  700: 'IBMPlexSansArabic_700Bold',
  800: 'IBMPlexSansArabic_700Bold',
};

export function family(w: Weight): string {
  return OUTFIT[w];
}

export function arabicFamily(w: Weight): string {
  return IBM_PLEX_ARABIC[w];
}