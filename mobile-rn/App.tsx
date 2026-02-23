import './global.css';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from './src/stores/auth-store';
import { useNotificationsStore } from './src/stores/notifications-store';
import { useWhatsAppStore } from './src/stores/whatsapp-store';
import {
  clearDeviceNotifications,
  registerForPushNotifications,
  setupNotificationChannel,
} from './src/lib/push-notifications';
import TabNavigator from './src/navigation/TabNavigator';
import LoginScreen from './src/screens/LoginScreen';
import ToastContainer from './src/components/Toast';

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const navigationRef = useNavigationContainerRef();
  const fetchUnreadCount = useNotificationsStore(s => s.fetchUnreadCount);
  const fetchNotifications = useNotificationsStore(s => s.fetchNotifications);
  const markAllAsRead = useNotificationsStore(s => s.markAllAsRead);
  const openConversation = useWhatsAppStore(s => s.openConversation);
  const syncOutbox = useWhatsAppStore(s => s.syncOutbox);
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    checkAuth();
    setupNotificationChannel();
  }, []);

  // Register push + listen when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    // Register for push notifications
    registerForPushNotifications();
    clearDeviceNotifications();
    markAllAsRead();
    syncOutbox();

    // Poll unread count
    fetchUnreadCount();
    const iv = setInterval(fetchUnreadCount, 30000);
    const retryIv = setInterval(syncOutbox, 12000);

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      fetchUnreadCount();
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = (response.notification.request.content.data || {}) as Record<string, any>;
      const link = String(data.link || '').trim();
      const waId = String(data.waId || '').replace(/[^0-9]/g, '');
      const contactId = String(data.contactId || '').trim();
      fetchNotifications();
      fetchUnreadCount();
      clearDeviceNotifications();
      markAllAsRead();
      await syncOutbox();

      if (!navigationRef.isReady()) return;

      if (link.startsWith('/whatsapp')) {
        if (waId) {
          const phone = `+${waId}`;
          await openConversation({ waId, phone, contactName: phone });
          (navigationRef as any).navigate('WhatsApp', {
            screen: 'Chat',
            params: { waId, contactName: phone, phone },
          });
          return;
        }
        (navigationRef as any).navigate('WhatsApp');
        return;
      }

      if (link.startsWith('/contacts')) {
        if (contactId) {
          (navigationRef as any).navigate('Leads', {
            screen: 'LeadDetail',
            params: { contactId },
          });
          return;
        }
        (navigationRef as any).navigate('Leads');
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active') {
        clearDeviceNotifications();
        markAllAsRead();
        fetchUnreadCount();
        syncOutbox();
      }
    });

    return () => {
      clearInterval(iv);
      clearInterval(retryIv);
      appStateSubscription.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated, navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="light" />
          {isAuthenticated ? <TabNavigator /> : <LoginScreen />}
          <ToastContainer />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
