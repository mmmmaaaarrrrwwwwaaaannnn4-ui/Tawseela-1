import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AuthHero } from '@/components/auth/auth-hero';
import { Field, missingAuth, useAuthForm } from '@/components/auth/auth-ui';
import { Icon } from '@/components/icons/icon';
import { AccentButton } from '@/components/ui/buttons';
import { Card, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { AUTH_IMAGES } from '@/data/images';
import { useStatusBar } from '@/hooks/use-status-bar';
import { sendPasswordReset } from '@/lib/account';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

const toLogin = () => (router.canGoBack() ? router.back() : router.replace('/login'));

export default function ForgotScreen() {
  useStatusBar('light');
  const { c } = useTheme();
  const chrome = useChrome();
  const f = useAuthForm();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    const toast = useApp.getState().showToast;
    const missing = missingAuth(f);
    if (missing) {
      toast('Almost there', missing, 'info');
      return;
    }
    setBusy(true);
    const r = await sendPasswordReset(f.email);
    setBusy(false);
    if (!r.ok) {
      toast('Link not sent', r.message, 'error');
      return;
    }
    f.set({ from: 'forgot' });
    router.push('/verify');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(chrome.insets.bottom, 16) + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <AuthHero img={AUTH_IMAGES.forgot} eyebrow="Account recovery" title="Reset your password" onBack={toLogin} />
          <View style={{ flex: 1, paddingTop: 14, paddingHorizontal: 24, gap: 12 }}>
            <Txt s={14.5} lh={1.5} color={c.text2}>
              Enter the email on your account and we’ll send you a link to choose a new password.
            </Txt>
            <Field
              tone="surface"
              icon="mail"
              height={54}
              radius={18}
              value={f.email}
              onChangeText={(email) => f.set({ email })}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
            <AccentButton label="Send reset link" height={56} loading={busy} loadingLabel="Sending…" onPress={() => void send()} />
            <Card radius={18} style={{ paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="info" size={20} color={c.accent} />
              <Txt s={13} lh={1.5} color={c.text2} style={{ flex: 1 }}>
                Reset links expire after an hour. No access to this email? Chat with us from Help.
              </Txt>
            </Card>
            <PressableScale onPress={toLogin} scaleTo={0.97} style={{ alignSelf: 'center', marginTop: 'auto', paddingTop: 10 }}>
              <Txt s={13.5} w={600} color={c.text2}>
                Back to sign in
              </Txt>
            </PressableScale>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
