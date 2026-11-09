import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AuthHero } from '@/components/auth/auth-hero';
import { useAuthForm } from '@/components/auth/auth-ui';
import { Icon } from '@/components/icons/icon';
import { AccentButton } from '@/components/ui/buttons';
import { useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { AUTH_IMAGES } from '@/data/images';
import { useAuthExit, useFinishAuth } from '@/hooks/use-auth-nav';
import { useStatusBar } from '@/hooks/use-status-bar';
import { checkEmailVerified, resendVerification, sendPasswordReset } from '@/lib/account';
import { emulatorMode } from '@/lib/firebase-config';
import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

/**
 * "Check your inbox". Firebase confirms an address with a link, not a code, so this screen shows where
 * the link went and whether it has been opened yet — after signing up (verification) or after
 * "Forgot password" (reset). Ordering never waits on verification.
 */
export default function VerifyScreen() {
  useStatusBar('light');
  const { c } = useTheme();
  const chrome = useChrome();
  const exit = useAuthExit();
  const finish = useFinishAuth();
  const f = useAuthForm();
  const forgot = f.from === 'forgot';
  const user = useSession((s) => s.user);
  const verified = !forgot && !!user?.emailVerified;
  const email = (forgot ? f.email : user?.email || f.email).trim();
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState(30);

  useEffect(() => {
    if (resend <= 0) return;
    const t = setTimeout(() => setResend((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resend]);

  // While waiting on a sign-up link: look again every few seconds and on coming back from Mail.
  useFocusEffect(
    useCallback(() => {
      if (forgot) return;
      void checkEmailVerified();
      const id = setInterval(() => void checkEmailVerified(), 6000);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && void checkEmailVerified());
      return () => {
        clearInterval(id);
        sub.remove();
      };
    }, [forgot]),
  );

  /** Sign-up: check the link once more, then into the app either way. */
  const proceed = async () => {
    if (busy) return;
    if (forgot) {
      router.dismissTo('/login');
      return;
    }
    const current = useSession.getState().user;
    if (!current) {
      exit();
      return;
    }
    setBusy(true);
    const ok = await checkEmailVerified();
    setBusy(false);
    const name = current.name.split(' ')[0];
    if (ok) finish(current, 'Email verified', `Welcome to Fig & Fennel, ${name}`);
    else finish(current, 'Account created', 'Open the link we emailed whenever you like — you can order meanwhile');
  };

  const again = async () => {
    const r = forgot ? await sendPasswordReset(email) : await resendVerification();
    const toast = useApp.getState().showToast;
    if (!r.ok) {
      toast('Link not sent', r.message, 'error');
      return;
    }
    setResend(30);
    toast('Link resent', `Check ${email || 'your inbox'}`, 'mail');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(chrome.insets.bottom, 16) + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthHero
            img={AUTH_IMAGES.verify}
            eyebrow={forgot ? 'Account recovery' : 'One more step'}
            title="Check your inbox"
            onBack={() => (forgot ? (router.canGoBack() ? router.back() : router.replace('/forgot')) : void proceed())}
          />
          <View style={{ paddingTop: 14, paddingHorizontal: 24, gap: 14 }}>
            <Txt s={14.5} lh={1.5} color={c.text2}>
              {forgot
                ? `We sent a password reset link to ${email || 'your email'}. Open it to choose a new password, then sign in with it here.`
                : `We sent a verification link to ${email || 'your email'}. Open it to confirm your address — you can keep ordering in the meantime.`}
            </Txt>
            <View
              style={[styles.cell, { borderColor: verified ? c.ok : c.line, backgroundColor: c.surface1 }]}
              accessibilityRole="text"
              accessibilityLabel={
                forgot ? `Reset link sent to ${email}` : verified ? `${email} is verified` : `Waiting for you to open the link sent to ${email}`
              }
            >
              <View style={[styles.mailTile, { backgroundColor: verified ? `${c.ok}22` : c.accentSoft }]}>
                <Icon name={verified ? 'verified' : 'mail'} size={22} fill color={verified ? c.ok : c.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt s={15} w={600} numberOfLines={1}>
                  {email || 'Your email'}
                </Txt>
                <Txt s={12.5} w={500} color={verified ? c.ok : c.text3} numberOfLines={1}>
                  {forgot ? 'Reset link sent' : verified ? 'Email verified' : 'Waiting for you to open the link'}
                </Txt>
              </View>
            </View>
            <AccentButton label={forgot ? 'Back to sign in' : 'Continue'} height={56} loading={busy} loadingLabel="Checking…" onPress={() => void proceed()} />
            <View style={{ alignItems: 'center', gap: 6 }}>
              {resend <= 0 ? (
                <PressableScale onPress={() => void again()} scaleTo={0.96} style={{ paddingVertical: 6 }}>
                  <Txt s={13.5} w={700} color={c.accentText}>
                    Resend link
                  </Txt>
                </PressableScale>
              ) : (
                <Txt s={13.5} w={500} color={c.text2}>
                  Resend in 0:{String(resend).padStart(2, '0')}
                </Txt>
              )}
              {emulatorMode ? (
                <Txt s={12} lh={1.4} color={c.text3} align="center">
                  Local emulator: the link is printed in the Firebase emulator’s log, not sent by email.
                </Txt>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { height: 68, borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  mailTile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
