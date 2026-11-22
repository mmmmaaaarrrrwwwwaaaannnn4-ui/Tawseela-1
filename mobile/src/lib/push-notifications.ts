import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { api } from './api';

let registeredToken: string | null = null;
let registering = false;

export async function registerForPushNotifications(uid: string): Promise<void> {
  if (!uid || Platform.OS === 'web' || registering) return;
  registering = true;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'إشعارات توصيلة',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4c5b42',
      });
    }

    let permissions = await Notifications.getPermissionsAsync();
    const hasPushPermission = () =>
      permissions.granted ||
      (Platform.OS === 'ios' &&
        permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL);

    if (!hasPushPermission()) {
      if (permissions.status === 'denied' && !permissions.canAskAgain) return;
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (!hasPushPermission()) return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      if (__DEV__) console.warn('[push] EAS projectId is missing; push token was not requested.');
      return;
    }
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = result.data;
    if (token && token !== registeredToken) {
      await api.post('/v1/me/push-token', { token });
      registeredToken = token;
    }
  } catch (error) {
    if (__DEV__) console.warn('[push] registration failed:', error);
  } finally {
    registering = false;
  }
}
