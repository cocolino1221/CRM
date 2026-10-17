import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

const PUSH_TOKEN_KEY = 'device_push_token';

// Show notifications even when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // Check/request permissions
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    // Get native device push token (FCM on Android, APNs on iOS)
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data as string;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    // Check if already registered
    const savedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (savedToken === token) {
      return token; // Already registered
    }

    // Register with backend
    await api.post('/notifications/device-token', { token, platform });
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    console.log(`Push token registered (${platform}):`, token.substring(0, 20) + '...');
    return token;
  } catch (err) {
    console.error('Failed to register push notifications:', err);
    return null;
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (token) {
      await api.delete('/notifications/device-token', { data: { token } });
      await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    }
  } catch (err) {
    console.error('Failed to unregister push token:', err);
  }
}

export async function clearDeviceNotifications(): Promise<void> {
  try {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  } catch (err) {
    console.error('Failed to clear device notifications:', err);
  }
}

// Set up Android notification channel
export function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('crm_notifications', {
      name: 'CRM Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0c4a6e',
      sound: 'default',
    });
  }
}
