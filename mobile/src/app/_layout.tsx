import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FlyLayer, ToastHost } from '@/components/ui/overlays';
import { useAccountSession } from '@/lib/account';
import '@/lib/remote';
import { useActiveOrderSync, useServerSync } from '@/lib/sync';
import { useAppHydrated } from '@/store/app-store';
import { selectIsAdmin, selectIsStaff, selectSignedIn, useSession, useSessionHydrated } from '@/store/session';
import { AppThemeProvider, useTheme } from '@/theme/theme';
import { fontAssets } from '@/theme/typography';

// Keep the app's component geometry stable (the screens use explicit RTL text).
// Global forceRTL mirrors every row and animated selection track, reversing visual states.
I18nManager.allowRTL(true);
I18nManager.forceRTL(false);

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ duration: 300, fade: true });

export default function RootLayout() {
  const [loaded, error] = useFonts(fontAssets);
  // the saved cart, settings and session load from the device first, so guards never bounce anyone on launch
  const appHydrated = useAppHydrated();
  const sessionHydrated = useSessionHydrated();
  const ready = (loaded || !!error) && appHydrated && sessionHydrated;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <RootNavigator />
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Firebase session → the session store; then the catalog (cached, revalidated with its ETag), the
 * account (role, points, orders, bookings) and any order on its way, from the API.
 */
function AccountSync() {
  useAccountSession();
  useServerSync();
  useActiveOrderSync();
  return null;
}

const push = { animation: 'slide_from_right' } as const;
const rise = { animation: 'slide_from_bottom' } as const;

/**
 * Who may open which screens. A guard that's false hides its screens: a link to one lands on Home
 * instead, and anyone on one when they lose access (signing out, a role change) is moved off it.
 * The API checks the same rules on every call; this is about what each person sees.
 */
function RootNavigator() {
  const { c, isDark } = useTheme();
  const signedIn = useSession(selectSignedIn);
  const staff = useSession(selectIsStaff);
  const admin = useSession(selectIsAdmin);
  const pathname = usePathname();
  const sessionReady = useSession((s) => s.ready);
  const user = useSession((s) => s.user);

  useEffect(() => {
    const authRoutes = ['/login', '/register', '/forgot', '/verify'];
    const requiresVerification =
      user?.provider === 'password' && user.emailVerified !== true;

    if (
      sessionReady &&
      requiresVerification &&
      !authRoutes.includes(pathname)
    ) {
      router.replace('/verify');
    }
  }, [sessionReady, user?.uid, user?.provider, user?.emailVerified, pathname]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => undefined);
  }, [c.bg]);

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: c.bg, card: c.bg, text: c.text1, border: c.line, primary: c.accent } };
  }, [isDark, c]);

  return (
    <ThemeProvider value={navTheme}>
      <AccountSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, statusBarStyle: isDark ? 'light' : 'dark', ...push }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="dish/[id]" options={{ animation: 'fade_from_bottom' }} />
        {/* iOS 26 swipes back from anywhere; keep it to the edge so the card wallet can swipe right. */}
        <Stack.Screen name="payments" options={{ fullScreenGestureEnabled: false }} />

        {/* the customer's own account: signed-in only */}
        <Stack.Protected guard={signedIn} redirectTo="/home">
          <Stack.Screen name="checkout" />
          <Stack.Screen name="addresses" options={{ presentation: "transparentModal", animation: "slide_from_bottom", contentStyle: { backgroundColor: "transparent" } }} />
          <Stack.Screen name="address-map" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="success" options={{ ...rise, gestureEnabled: false }} />
          <Stack.Screen name="orders" />
          <Stack.Screen name="track/[no]" />
          <Stack.Screen name="rate/[no]" options={rise} />
          <Stack.Screen name="edit-profile" />
        </Stack.Protected>

        {/* the team: any staff role sees its queue; only admins see the restaurant console */}
        <Stack.Protected guard={staff} redirectTo="/home">
          <Stack.Screen name="staff" />
          <Stack.Protected guard={admin} redirectTo="/home">
            <Stack.Screen name="admin" options={{ gestureEnabled: false }} />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
      <FlyLayer />
      <ToastHost />
    </ThemeProvider>
  );
}
