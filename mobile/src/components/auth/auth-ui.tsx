import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode, type Ref } from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type ViewStyle } from 'react-native';
import { create } from 'zustand';

import { Icon, type IconName } from '@/components/icons/icon';
import { Spinner } from '@/components/ui/controls';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { accentGradient } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';
import { familyForText } from '@/theme/typography';
import { arText } from '@/lib/ar';

/* ------------------------------------------------------------------ form state */

interface AuthForm {
  name: string;
  email: string;
  pw: string;
  showPw: boolean;
  terms: boolean;
  /** Which flow led to the verify screen (the link went to `email`). */
  from: 'register' | 'forgot';
  set: (p: Partial<Omit<AuthForm, 'set'>>) => void;
}

/** Shared between Login / Register / Forgot / Verify, like the prototype's `fm`. */
export const useAuthForm = create<AuthForm>()((set) => ({
  name: '',
  email: '',
  pw: '',
  showPw: false,
  terms: false,
  from: 'register',
  set: (p) => set(p),
}));

export const emailOk = (e: string) => !e || /.+@.+\..+/.test(e);
export const pwScore = (pw: string) => (pw.length >= 12 ? 3 : pw.length >= 8 ? 2 : pw.length ? 1 : 0);

/** Says what's missing before an auth form can be sent, or null when it's complete. */
export function missingAuth(f: { email: string; pw?: string; name?: string }, need: { pw?: boolean; name?: boolean } = {}): string | null {
  if (need.name && !f.name?.trim()) return 'Add your name';
  if (!f.email.trim()) return 'Enter your email';
  if (!emailOk(f.email.trim())) return 'That email address doesn’t look right';
  if (need.pw && !f.pw) return 'Enter your password';
  return null;
}

/* ------------------------------------------------------------------ inputs */

interface FieldProps extends Omit<TextInputProps, 'style'> {
  icon: IconName;
  height?: number;
  radius?: number;
  /** 'soft' — #F3F3F0 fill used on Login/Register; 'surface' — surface-1 + line border (Forgot). */
  tone?: 'soft' | 'surface';
  error?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
}

/** Text field with a leading Material icon, focus ring and optional trailing control. */
export function Field({ icon, height = 52, radius = 20, tone = 'soft', error, right, style, ref, onFocus, onBlur, ...rest }: FieldProps) {
  const { c, isDark } = useTheme();
  const [focus, setFocus] = useState(false);
  const softBg = isDark ? c.surface2 : '#F3F3F0';
  const bg = tone === 'soft' ? (focus ? c.surface1 : softBg) : c.surface1;
  const border = error ? c.err : focus ? (tone === 'soft' ? 'rgba(255,212,0,0.65)' : c.accent) : tone === 'soft' ? 'transparent' : c.line;
  return (
    <View style={[{ justifyContent: 'center' }, style]}>
      <TextInput
        ref={ref}
        placeholderTextColor={c.text3}
        placeholder={typeof rest.placeholder === 'string' ? arText(rest.placeholder) : rest.placeholder}
        textAlign="right"
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            height,
            borderRadius: radius,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: tone === 'soft' ? 1.5 : 1,
            color: c.text1,
            fontFamily: familyForText(rest.value ?? rest.defaultValue ?? rest.placeholder, 500),
            paddingLeft: tone === 'soft' ? 50 : 48,
            paddingRight: right ? 64 : 16,
          },
        ]}
      />
      <View pointerEvents="none" style={[styles.icon, { left: tone === 'soft' ? 18 : 16 }]}>
        <Icon name={icon} size={20} color={c.text3} />
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

/** "Show / Hide" toggle inside the password field. */
export function PwToggle() {
  const { c } = useTheme();
  const show = useAuthForm((s) => s.showPw);
  return (
    <PressableScale
      onPress={() => useAuthForm.getState().set({ showPw: !show })}
      scaleTo={0.95}
      style={{ height: 40, paddingHorizontal: 12, justifyContent: 'center' }}
    >
      <Txt s={12.5} w={600} color={c.text2}>
        {show ? 'Hide' : 'Show'}
      </Txt>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ buttons */

/** Olive gradient CTA with the brand glow. */
export function AuthCta({
  label,
  busyLabel,
  busy,
  onPress,
  height = 54,
  dim,
  weight = 600,
}: {
  label: string;
  busyLabel: string;
  busy: boolean;
  onPress: () => void;
  height?: number;
  dim?: boolean;
  weight?: 600 | 700;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.cta, { height, borderRadius: height / 2, opacity: dim ? 0.55 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <LinearGradient colors={accentGradient} style={[StyleSheet.absoluteFill, { borderRadius: height / 2 }]} />
      {busy ? <Spinner /> : null}
      <Txt s={16} w={weight} color="#111111">
        {busy ? busyLabel : label}
      </Txt>
    </PressableScale>
  );
}

/** Frosted white pill/circle used for Skip / Back on the auth screens. */
export function SoftChip({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label: string }) {
  const { isDark, c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.94}
      accessibilityLabel={label}
      style={[styles.soft, { backgroundColor: isDark ? c.surface1 : 'rgba(255,255,255,0.85)', borderColor: isDark ? c.line : 'rgba(26,26,26,0.06)' }, style]}
    >
      {children}
    </PressableScale>
  );
}

/** Pastel stat tile (Delivery 18 min, Rating 4.9 ★, perks). */
export function PastelTile({
  label,
  value,
  unit,
  colors,
  style,
}: {
  label: string;
  value: string;
  unit: string;
  colors: readonly [string, string];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pastel, { backgroundColor: colors[1] }, style]}>
      <LinearGradient colors={colors} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
      <Txt s={12.5} w={500} color="#3D3B35">
        {label}
      </Txt>
      <Txt s={19} w={600} color="#1A1A1A">
        {value}{' '}
        <Txt s={12.5} w={400} color="#6A675E">
          {unit}
        </Txt>
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  input: { fontSize: 15, paddingVertical: 0 },
  icon: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  right: { position: 'absolute', right: 8, top: 0, bottom: 0, justifyContent: 'center' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4C5B42',
    shadowColor: '#0D2818',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  soft: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  pastel: {
    paddingTop: 9,
    paddingBottom: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    gap: 3,
    shadowColor: '#1A1A1A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
    overflow: 'visible',
  },
});
