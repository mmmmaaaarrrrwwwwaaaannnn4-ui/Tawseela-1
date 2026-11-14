/**
 * Design tokens — a 1:1 port of the CSS custom properties in
 * design/fig-and-fennel.dc.html (`[data-ek]` light and `[data-theme="dark"]`).
 */

export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  surface1: string;
  surface2: string;
  line: string;
  lineStrong: string;
  glass: string;
  glassStrong: string;
  glassLine: string;
  navGlass: string;
  navHi: string;
  navLo: string;
  navPill: string;
  navPillHi: string;
  text1: string;
  text2: string;
  text3: string;
  scrim: string;
  ok: string;
  warn: string;
  err: string;
  info: string;
  accent: string;
  accentInk: string;
  accentText: string;
  accentSoft: string;
  /** Solid fallback for glass surfaces where native blur is unavailable (Android). */
  glassSolid: string;
  navSolid: string;
}

export const light: Palette = {
  bg: '#F8F8F1',
  surface1: '#FFFDF0',
  surface2: '#E9F0E9',
  line: 'rgba(0,58,43,0.10)',
  lineStrong: 'rgba(0,58,43,0.18)',
  glass: 'rgba(255,253,240,0.68)',
  glassStrong: 'rgba(255,253,240,0.90)',
  glassLine: 'rgba(0,58,43,0.10)',
  navGlass: 'rgba(255,253,240,0.62)',
  navHi: 'rgba(255,253,240,0.96)',
  navLo: 'rgba(0,58,43,0.10)',
  navPill: 'rgba(225,255,0,0.28)',
  navPillHi: 'rgba(255,255,255,0.75)',
  text1: '#003A2B',
  text2: '#31594D',
  text3: '#60766D',
  scrim: 'rgba(0,38,28,0.42)',
  ok: '#3E9B70',
  warn: '#B58A20',
  err: '#B83B35',
  info: '#326D8C',
  accent: '#E5FF00',
  accentInk: '#003A2B',
  accentText: '#00523D',
  accentSoft: 'rgba(225,255,0,0.28)',
  glassSolid: 'rgba(255,253,250,0.96)',
  navSolid: 'rgba(255,255,255,0.94)',
};

export const dark: Palette = {
  bg: '#002F23',
  surface1: '#004332',
  surface2: '#07513F',
  line: 'rgba(255,253,240,0.12)',
  lineStrong: 'rgba(255,253,240,0.20)',
  glass: 'rgba(0,55,40,0.72)',
  glassStrong: 'rgba(0,43,31,0.92)',
  glassLine: 'rgba(255,253,240,0.16)',
  navGlass: 'rgba(0,55,40,0.72)',
  navHi: 'rgba(229,255,0,0.22)',
  navLo: 'rgba(0,25,18,0.45)',
  navPill: 'rgba(255,253,240,0.16)',
  navPillHi: 'rgba(229,255,0,0.18)',
  text1: '#F8F8F1',
  text2: '#C4D8CE',
  text3: '#91B2A4',
  scrim: 'rgba(0,20,14,0.62)',
  ok: '#8ED6A8',
  warn: '#F0D45A',
  err: '#FF8A75',
  info: '#83C9E8',
  accent: '#E5FF00',
  accentInk: '#003A2B',
  accentText: '#E5FF00',
  accentSoft: 'rgba(225,255,0,0.28)',
  glassSolid: 'rgba(30,27,24,0.97)',
  navSolid: 'rgba(42,38,34,0.95)',
};

/** Theme-independent colours used literally in the design. */
export const fixed = {
  ink: '#080808',
  paper: '#F8F8F1',
  orange: '#E5FF00',
  peach: '#E5FF00',
  star: '#E5FF00',
  white: '#FFFDF0',
  black: '#000000',
  splashBg: '#003A2B',
  leaf: '#E5FF00',
  coffee: '#003A2B',
  inputFill: '#E9F0E9',
  /** rgba(22,14,8,a) — the warm-black used for photo overlays. */
  roast: (a: number) => `rgba(22,14,8,${a})`,
  paperA: (a: number) => `rgba(248,248,246,${a})`,
  whiteA: (a: number) => `rgba(255,255,255,${a})`,
} as const;

/** `linear-gradient(180deg,#E5FF00 0%,#B7D900 100%)` */
export const accentGradient = ['#E5FF00', '#B7D900'] as const;

/** Mimics `color-mix(in oklch, <hex> N%, transparent)` for the solid hex tokens. */
export function alpha(color: string, a: number): string {
  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${a})`);
  }
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const radius = {
  pill: 999,
} as const;

/** Easing curves from the prototype, as cubic-bezier control points. */
export const curves = {
  /** E — cubic-bezier(.22,1,.36,1) */
  out: [0.22, 1, 0.36, 1] as const,
  /** SP — cubic-bezier(.3,1.32,.5,1) springy overshoot */
  spring: [0.3, 1.32, 0.5, 1] as const,
  /** IO — cubic-bezier(.32,.72,0,1) */
  io: [0.32, 0.72, 0, 1] as const,
  /** OUT — cubic-bezier(.16,1,.3,1) */
  expo: [0.16, 1, 0.3, 1] as const,
};
