import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text } from 'react-native';
import { MessageSquare, Users, Bell, Settings, LayoutDashboard, Briefcase } from 'lucide-react-native';
import { useNotificationsStore } from '../stores/notifications-store';
import DashboardScreen from '../screens/DashboardScreen';
import WhatsAppStack from './WhatsAppStack';
import LeadsStack from './LeadsStack';
import NotificationsScreen from '../screens/NotificationsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WorkspaceStack from './WorkspaceStack';

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
        name="Home"
        component={DashboardScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={WhatsAppStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <MessageSquare size={size} color={color} />
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
        name="Workspace"
        component={WorkspaceStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Briefcase size={size} color={color} />
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
