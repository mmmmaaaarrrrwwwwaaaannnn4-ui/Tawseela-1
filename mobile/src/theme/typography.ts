import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
} from '@expo-google-fonts/readex-pro';
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
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
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

const READEX_ARABIC: Record<Weight, string> = {
  300: 'ReadexPro_400Regular',
  400: 'ReadexPro_400Regular',
  500: 'ReadexPro_500Medium',
  600: 'ReadexPro_600SemiBold',
  700: 'ReadexPro_600SemiBold',
  800: 'ReadexPro_600SemiBold',
};

export function family(w: Weight): string {
  return OUTFIT[w];
}

export function arabicFamily(w: Weight): string {
  return READEX_ARABIC[w];
}