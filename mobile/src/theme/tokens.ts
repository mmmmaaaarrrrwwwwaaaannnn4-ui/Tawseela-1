/** Shared Tawseela visual system — clean white delivery UI inspired by the supplied references. */
export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string; surface1: string; surface2: string; line: string; lineStrong: string;
  glass: string; glassStrong: string; glassLine: string; navGlass: string; navHi: string;
  navLo: string; navPill: string; navPillHi: string; text1: string; text2: string; text3: string;
  scrim: string; ok: string; warn: string; err: string; info: string; accent: string;
  accentInk: string; accentText: string; accentSoft: string; glassSolid: string; navSolid: string;
}

export const light: Palette = {
  bg: '#FFFFFF',
  surface1: '#FFFFFF',
  surface2: '#F7F7F7',
  line: '#E5E5E5',
  lineStrong: '#D7D7D7',
  glass: 'rgba(255,255,255,0.94)',
  glassStrong: 'rgba(255,255,255,0.98)',
  glassLine: '#E5E5E5',
  navGlass: 'rgba(255,255,255,0.96)',
  navHi: '#FFFFFF',
  navLo: '#F2F2F2',
  navPill: 'rgba(37,89,66,0.10)',
  navPillHi: 'rgba(37,89,66,0.18)',
  text1: '#202020',
  text2: '#555555',
  text3: '#8A8A8A',
  scrim: 'rgba(0,0,0,0.48)',
  ok: '#278653',
  warn: '#B7791F',
  err: '#D92D20',
  info: '#3478A8',
  accent: '#255942',
  accentInk: '#FFFFFF',
  accentText: '#255942',
  accentSoft: 'rgba(37,89,66,0.10)',
  glassSolid: '#FFFFFF',
  navSolid: '#FFFFFF',
};

export const dark: Palette = {
  bg: '#111111',
  surface1: '#1C1C1C',
  surface2: '#262626',
  line: '#383838',
  lineStrong: '#505050',
  glass: 'rgba(28,28,28,0.94)',
  glassStrong: 'rgba(20,20,20,0.98)',
  glassLine: '#383838',
  navGlass: 'rgba(28,28,28,0.96)',
  navHi: '#292929',
  navLo: '#101010',
  navPill: 'rgba(37,89,66,0.20)',
  navPillHi: 'rgba(37,89,66,0.28)',
  text1: '#FFFFFF',
  text2: '#D0D0D0',
  text3: '#999999',
  scrim: 'rgba(0,0,0,0.68)',
  ok: '#65C58A',
  warn: '#E7B65D',
  err: '#FF8176',
  info: '#78BCE5',
  accent: '#255942',
  accentInk: '#FFFFFF',
  accentText: '#255942',
  accentSoft: 'rgba(37,89,66,0.14)',
  glassSolid: '#1C1C1C',
  navSolid: '#111111',
};

/** Theme-independent colours used literally in the design. */
export const fixed = {
  ink: '#202020',
  paper: '#FFFFFF',
  orange: '#255942',
  peach: '#DCE9E1',
  star: '#255942',
  white: '#FFFFFF',
  black: '#000000',
  splashBg: '#FFFFFF',
  leaf: '#255942',
  coffee: '#202020',
  inputFill: '#FFFFFF',
  roast: (a: number) => `rgba(22,14,8,${a})`,
  paperA: (a: number) => `rgba(255,255,255,${a})`,
  whiteA: (a: number) => `rgba(255,255,255,${a})`,
} as const;

export const accentGradient = ['#326D50', '#1D4935'] as const;

export function alpha(color: string, a: number): string {
  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\\(([^,]+),([^,]+),([^,]+),[^)]+\\)/, `rgba($1,$2,$3,${a})`);
  }
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const radius = { pill: 999 } as const;
export const curves = {
  out: [0.22, 1, 0.36, 1] as const,
  spring: [0.3, 1.32, 0.5, 1] as const,
  io: [0.32, 0.72, 0, 1] as const,
  expo: [0.16, 1, 0.3, 1] as const,
};
