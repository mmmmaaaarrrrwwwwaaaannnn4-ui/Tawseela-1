import {
  Cairo_300Light,
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
} from '@expo-google-fonts/cairo';
import {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';

/** Outfit for Latin text; Cairo for Arabic text. */
export const fontAssets = {
  Cairo_300Light,
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
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

const CAIRO: Record<Weight, string> = {
  300: 'Cairo_300Light',
  400: 'Cairo_400Regular',
  500: 'Cairo_500Medium',
  600: 'Cairo_600SemiBold',
  700: 'Cairo_700Bold',
  800: 'Cairo_800ExtraBold',
};

export function family(w: Weight): string {
  return OUTFIT[w];
}

export function arabicFamily(w: Weight): string {
  return CAIRO[w];
}