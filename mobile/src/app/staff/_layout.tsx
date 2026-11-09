import { Stack } from 'expo-router';

import { useOpsSync } from '@/lib/ops';
import { selectIsStaff, useSession } from '@/store/session';
import { useTheme } from '@/theme/theme';

/**
 * The team's work area: call center, packers, warehouse and riders each see their own queue here (admins
 * see every order in progress). The root layout only opens it for staff roles; the API checks the role
 * on every call as well. While it's open the queue refreshes every few seconds.
 */
export default function StaffLayout() {
  const { c, isDark } = useTheme();
  const staff = useSession(selectIsStaff);
  useOpsSync(staff);
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: c.bg }, statusBarStyle: isDark ? 'light' : 'dark' }}
    />
  );
}
