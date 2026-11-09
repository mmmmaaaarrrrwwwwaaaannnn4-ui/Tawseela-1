import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Field } from '@/components/account/field';
import { Icon } from '@/components/icons/icon';
import { AccentButton, AccentFill } from '@/components/ui/buttons';
import { FloatingBar, ScreenHeader, useChrome } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { changeEmail, sendPasswordReset, updateAccountProfile } from '@/lib/account';
import { initials } from '@/lib/format';
import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function EditProfileScreen() {
  const { c } = useTheme();
  const chrome = useChrome();
  useStatusBar();
  const user = useSession((s) => s.user);
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const toast = useApp((s) => s.showToast);

  const save = async () => {
    if (busy || !user) return;
    const nextName = name.trim() || user.name;
    const nextEmail = email.trim();
    const emailChanged = !!nextEmail && nextEmail.toLowerCase() !== user.email.toLowerCase();
    if (emailChanged && !/.+@.+\..+/.test(nextEmail)) {
      toast('Check your email', 'That address doesn’t look right', 'error');
      return;
    }
    setBusy(true);
    await updateAccountProfile({ name: nextName, phone: phone.trim() || undefined });
    const moved = emailChanged ? await changeEmail(nextEmail) : null;
    setBusy(false);
    router.back();
    if (moved && !moved.ok) toast('Email not changed', moved.message, 'error');
    else if (moved) toast('Confirm your new email', `We sent a link to ${nextEmail}`, 'mail');
    else toast('Profile updated', nextName, 'person');
  };

  const resetPassword = async () => {
    const to = user?.email;
    if (!to) return;
    const r = await sendPasswordReset(to);
    if (r.ok) toast('Reset link sent', 'Check ' + to, 'mail');
    else toast('Link not sent', r.message, 'error');
  };

  return (
    <RevealScope>
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingTop: chrome.underHeader, paddingHorizontal: 20, paddingBottom: chrome.bottomPad, gap: 14 }}
        >
          <Reveal i={0} style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4 }}>
            <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
              <Txt s={34} w={600} color={c.accentText}>
                {initials(name.trim() || user?.name || 'Fig')}
              </Txt>
              <PressableScale
                scaleTo={0.9}
                accessibilityLabel="Change photo"
                onPress={() => toast('Photo picker', 'Choose from library or camera', 'photo_camera')}
                style={[styles.camera, { borderColor: c.bg }]}
              >
                <AccentFill radius={18} />
                <Icon name="photo_camera" size={17} color={c.accentInk} />
              </PressableScale>
            </View>
          </Reveal>
          <Reveal i={1} style={{ gap: 10 }}>
            <Field
              icon="person"
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              height={54}
              radius={18}
              borderWidth={1}
              iconLeft={16}
              padLeft={48}
              autoComplete="name"
            />
            <Field
              icon="mail"
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              height={54}
              radius={18}
              borderWidth={1}
              iconLeft={16}
              padLeft={48}
              autoComplete="email"
            />
            <Field
              icon="call"
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone"
              keyboardType="phone-pad"
              height={54}
              radius={18}
              borderWidth={1}
              iconLeft={16}
              padLeft={48}
              autoComplete="tel"
            />
          </Reveal>
          <Reveal i={2}>
            <PressableScale scaleTo={0.98} onPress={resetPassword} style={[styles.pw, { borderColor: c.line, backgroundColor: c.surface1 }]}>
              <Icon name="lock_reset" size={21} />
              <Txt s={14.5} w={600} style={{ flex: 1 }}>
                Change password
              </Txt>
              <Icon name="chevron_right" size={21} color={c.text3} />
            </PressableScale>
          </Reveal>
        </ScrollView>
        <ScreenHeader title="Edit profile" />
        <FloatingBar>
          <AccentButton label="Save changes" loading={busy} loadingLabel="Saving…" onPress={save} />
        </FloatingBar>
      </View>
    </RevealScope>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  camera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pw: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
});
