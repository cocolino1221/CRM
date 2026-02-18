import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import api from './api';

let initialized = false;

export async function initPushNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  try {
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.log('Push notification permission not granted');
      return;
    }

    await PushNotifications.register();

    // When we get the FCM token, send it to the backend
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration token:', token.value);
      localStorage.setItem('fcmToken', token.value);
      try {
        const platform = Capacitor.getPlatform(); // 'ios' or 'android'
        await api.post('/notifications/device-token', {
          token: token.value,
          platform,
        });
      } catch (err) {
        console.error('Failed to register device token:', err);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', err);
    });

    // Handle received push while app is in foreground
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground:', notification);
    });

    // Handle push notification tap (open app from notification)
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification.data;
      if (data?.link) {
        window.location.href = data.link;
      }
    });
  } catch (err) {
    console.error('Push notification init failed:', err);
  }
}

export async function removePushToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = localStorage.getItem('fcmToken');
    if (token) {
      await api.delete('/notifications/device-token', { data: { token } });
      localStorage.removeItem('fcmToken');
    }
    await PushNotifications.removeAllListeners();
  } catch (err) {
    console.error('Failed to remove push token:', err);
  }
}
