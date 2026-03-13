import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { MessageCircle, Users, Calendar, Bell, Settings, FileText } from 'lucide-react-native';
import { useNotificationsStore } from '../stores/notifications-store';
import WhatsAppStack from './WhatsAppStack';
import LeadsStack from './LeadsStack';
import CalendarScreen from '../screens/CalendarScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import DocumentsScreen from '../screens/DocumentsScreen';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const unreadCount = useNotificationsStore(s => s.unreadCount);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          borderTopWidth: 0.5,
          borderTopColor: '#e2e8f0',
          paddingTop: 6,
          height: 88,
        },
        tabBarActiveTintColor: '#0c4a6e',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="WhatsApp"
        component={WhatsAppStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <FileText size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Leads"
        component={LeadsStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Calendar size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View>
              <Bell size={size} color={color} />
              {unreadCount > 0 && (
                <View className="absolute -top-1 -right-2 bg-rose-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
                  <Text className="text-white text-[9px] font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
