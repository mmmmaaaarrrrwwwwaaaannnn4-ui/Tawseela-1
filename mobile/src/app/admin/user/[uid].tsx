import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AdminHeader, AdminInput, FieldLabel, ToggleCardRow, useAdminPadding } from '@/components/admin/admin-ui';
import { Icon } from '@/components/icons/icon';
import { ROLE_ICON, RolePill } from '@/components/staff/staff-ui';
import { AccentButton } from '@/components/ui/buttons';
import { Radio } from '@/components/ui/controls';
import { FloatingBar } from '@/components/ui/layout';
import { Avatar } from '@/components/ui/media';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Reveal, RevealScope } from '@/components/ui/reveal';
import { Txt } from '@/components/ui/txt';
import { useConfirmTap } from '@/hooks/use-confirm-tap';
import { useStatusBar } from '@/hooks/use-status-bar';
import { ROLE_INFO, type Role, type UserRow } from '@/lib/contract';
import { cnt, initials, money } from '@/lib/format';
import { ROLE_ORDER, createUser, updateUser, useTeam } from '@/lib/team';
import { useApp } from '@/store/app-store';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

export default function AdminUser() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return <RevealScope>{uid === 'new' ? <NewUser /> : <EditUser uid={uid} />}</RevealScope>;
}

const toast = (title: string, sub: string, icon: Parameters<ReturnType<typeof useApp.getState>['showToast']>[2]) =>
  useApp.getState().showToast(title, sub, icon);

/** Role cards: what each role can do, so the admin picks knowingly. */
function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {ROLE_ORDER.map((r) => {
        const on = r === value;
        return (
          <PressableScale
            key={r}
            onPress={() => !disabled && onChange(r)}
            disabled={disabled}
            scaleTo={0.985}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            style={[styles.role, { backgroundColor: on ? c.accentSoft : c.surface1, borderColor: on ? c.accent : c.line, opacity: disabled && !on ? 0.5 : 1 }]}
          >
            <View style={[styles.tile, { backgroundColor: on ? c.accent : c.surface2 }]}>
              <Icon name={ROLE_ICON[r]} size={20} fill={on} color={on ? c.accentInk : c.text2} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt s={14.5} w={700}>
                {ROLE_INFO[r].label}
              </Txt>
              <Txt s={12} color={c.text3}>
                {ROLE_INFO[r].desc}
              </Txt>
            </View>
            <Radio on={on} />
          </PressableScale>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ add */

function NewUser() {
  const { c } = useTheme();
  useStatusBar();
  const pad = useAdminPadding('cta');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('callcenter');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast('Name and email needed', 'Add their name and a valid email', 'error');
      return;
    }
    if (password.length < 8) {
      toast('Password too short', 'Use at least 8 characters', 'error');
      return;
    }
    setSaving(true);
    const u = await createUser({ name: name.trim(), email: email.trim(), password, role, phone: phone.trim() || null });
    setSaving(false);
    if (!u) return;
    toast('Account created', `${u.name} · ${ROLE_INFO[u.role].label}. Share the email and password with them.`, 'group_add');
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Reveal i={0} style={{ gap: 8 }}>
          <FieldLabel>Name</FieldLabel>
          <AdminInput value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" autoComplete="off" />
          <FieldLabel>Email</FieldLabel>
          <AdminInput
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FieldLabel>Phone (optional)</FieldLabel>
          <AdminInput value={phone} onChangeText={setPhone} placeholder="+1 (212) 555-0100" keyboardType="phone-pad" />
          <FieldLabel>First password</FieldLabel>
          <AdminInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="off"
          />
          <Txt s={12.5} lh={1.45} color={c.text3} style={{ paddingHorizontal: 4 }}>
            They sign in with this email and password, and can change it with “Forgot password”.
          </Txt>
        </Reveal>
        <Reveal i={1} style={{ gap: 8 }}>
          <FieldLabel>Role</FieldLabel>
          <RolePicker value={role} onChange={setRole} />
        </Reveal>
      </ScrollView>
      <AdminHeader title="Add a user" back />
      <FloatingBar>
        <AccentButton label="Create account" icon="group_add" loading={saving} loadingLabel="Creating…" onPress={() => void save()} />
      </FloatingBar>
    </View>
  );
}

/* ------------------------------------------------------------------ edit */

function EditUser({ uid }: { uid: string }) {
  const { c } = useTheme();
  useStatusBar();
  const user = useTeam((s) => s.users.find((u) => u.uid === uid));
  const pad = useAdminPadding('push');

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[pad, { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }]}>
          <Icon name="search_off" size={32} color={c.text3} />
          <Txt s={15} w={600}>
            Account not loaded
          </Txt>
          <Txt s={13.5} color={c.text2} align="center">
            Go back and open it from the list.
          </Txt>
        </View>
        <AdminHeader title="User" back />
      </View>
    );
  }
  return <EditForm key={user.uid} user={user} />;
}

function EditForm({ user }: { user: UserRow }) {
  const { c } = useTheme();
  const meUid = useSession((s) => s.user?.uid);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role);
  const [saving, setSaving] = useState(false);
  const self = user.uid === meUid;
  const nextName = name.trim();
  const changed = (!!nextName && nextName !== user.name) || role !== user.role;
  const pad = useAdminPadding(changed ? 'cta' : 'push');

  const save = async () => {
    if (saving || !changed) return;
    setSaving(true);
    const u = await updateUser(user.uid, { ...(nextName && nextName !== user.name ? { name: nextName } : {}), ...(role !== user.role ? { role } : {}) });
    setSaving(false);
    if (!u) {
      setRole(user.role);
      return;
    }
    toast(
      role !== user.role ? 'Role changed' : 'Name saved',
      role !== user.role ? `${u.name} is now ${ROLE_INFO[u.role].label}. It applies within seconds.` : u.name,
      'check_circle',
    );
  };

  const setDisabled = async (disabled: boolean) => {
    const u = await updateUser(user.uid, { disabled });
    if (u)
      toast(
        u.disabled ? 'Account disabled' : 'Account enabled',
        u.disabled ? `${u.name} is signed out everywhere` : `${u.name} can sign in again`,
        u.disabled ? 'block' : 'check',
      );
  };
  const disable = useConfirmTap(() => void setDisabled(true), `Tap again to disable ${user.name}`);
  const signsInWith =
    user.provider === 'google.com'
      ? 'Google'
      : user.provider === 'apple.com'
        ? 'Apple'
        : user.provider === 'password' || !user.provider
          ? 'email and password'
          : user.provider;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[pad, { gap: 12 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <Reveal i={0}>
          <View style={[styles.card, { backgroundColor: c.surface1, borderColor: c.line }]}>
            <Avatar text={initials(user.name)} size={52} bg={c.accentSoft} color={c.accentText} fontSize={17} display />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt s={16} w={700} numberOfLines={1}>
                {user.name}
              </Txt>
              <Txt s={12.5} color={c.text3} numberOfLines={1}>
                {user.email || 'No email'}
                {user.phone ? ` · ${user.phone}` : ''}
              </Txt>
              <Txt s={12.5} color={c.text3} numberOfLines={1}>
                Signs in with {signsInWith}
                {user.orders ? ` · ${cnt(user.orders, 'order')} · ${money(user.spent)}` : ''}
              </Txt>
            </View>
            <RolePill role={user.role} />
          </View>
        </Reveal>

        <Reveal i={1} style={{ gap: 8 }}>
          <FieldLabel>Name</FieldLabel>
          <AdminInput value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
        </Reveal>

        <Reveal i={2} style={{ gap: 8 }}>
          <FieldLabel>Role</FieldLabel>
          {self ? (
            <Txt s={12.5} color={c.text3} style={{ paddingHorizontal: 4 }}>
              You can’t change your own role — ask another admin.
            </Txt>
          ) : null}
          <RolePicker value={role} onChange={setRole} disabled={self} />
        </Reveal>

        {!self ? (
          <Reveal i={3}>
            <ToggleCardRow
              title="Account active"
              sub={
                user.disabled ? 'Disabled — can’t sign in' : disable.armed ? 'Tap again to disable · signs them out everywhere' : 'Can sign in and use the app'
              }
              on={!user.disabled && !disable.armed}
              onPress={() => (user.disabled ? void setDisabled(false) : disable.onPress())}
            />
          </Reveal>
        ) : null}
      </ScrollView>
      <AdminHeader title={user.name} back />
      {changed ? (
        <FloatingBar>
          <AccentButton
            label={role !== user.role ? `Set role: ${ROLE_INFO[role].label}` : 'Save name'}
            icon="check"
            loading={saving}
            loadingLabel="Saving…"
            onPress={() => void save()}
          />
        </FloatingBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5 },
  tile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
});
