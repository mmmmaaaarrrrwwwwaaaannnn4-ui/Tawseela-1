// Local font files supplied for Tawseela. Keep filenames in sync with mobile/src/assets/fonts.
export type Weight = 300 | 400 | 500 | 600 | 700 | 800;

export const fontAssets = {
  BfLight: require('../assets/fonts/bf_light.ttf'),
  BfRegular: require('../assets/fonts/bf_regular.ttf'),
  BfSemiBold: require('../assets/fonts/bf_semi_bold.ttf'),
  BfBold: require('../assets/fonts/bf_bold.ttf'),
  BfExtraBold: require('../assets/fonts/bf_extra_bold.ttf'),
  BfLightArabic: require('../assets/fonts/bf_light_ar.ttf'),
  BfRegularArabic: require('../assets/fonts/bf_regular_ar.ttf'),
  BfSemiBoldArabic: require('../assets/fonts/bf_semi_bold_ar.ttf'),
  BfBoldArabic: require('../assets/fonts/bf_bold_ar.ttf'),
  BfExtraBoldArabic: require('../assets/fonts/bf_extra_bold_ar.ttf'),
  PoppinsLight: require('../assets/fonts/poppins_light.ttf'),
  PoppinsRegular: require('../assets/fonts/poppins_regular.ttf'),
  PoppinsBold: require('../assets/fonts/poppins_bold.ttf'),
  MontserratLight: require('../assets/fonts/montserrat_light.ttf'),
  MontserratRegular: require('../assets/fonts/montserrat_regular.ttf'),
  MontserratSemiBold: require('../assets/fonts/montserrat_semi_bold.ttf'),
  MontserratBold: require('../assets/fonts/montserrat_bold.ttf'),
};

const BF: Record<Weight, string> = {
  300: 'BfLight',
  400: 'BfRegular',
  500: 'BfSemiBold',
  600: 'BfSemiBold',
  700: 'BfBold',
  800: 'BfExtraBold',
};

const BF_ARABIC: Record<Weight, string> = {
  300: 'BfLightArabic',
  400: 'BfRegularArabic',
  500: 'BfSemiBoldArabic',
  600: 'BfSemiBoldArabic',
  700: 'BfBoldArabic',
  800: 'BfExtraBoldArabic',
};

export function family(weight: Weight): string {
  return BF[weight];
}

export function arabicFamily(weight: Weight): string {
  return BF_ARABIC[weight];
}

// Optional brand families for specific Latin headings or promotional treatments.
export const poppinsFamily: Record<300 | 400 | 700, string> = {
  300: 'PoppinsLight',
  400: 'PoppinsRegular',
  700: 'PoppinsBold',
};

export const montserratFamily: Record<300 | 400 | 600 | 700, string> = {
  300: 'MontserratLight',
  400: 'MontserratRegular',
  600: 'MontserratSemiBold',
  700: 'MontserratBold',
};
