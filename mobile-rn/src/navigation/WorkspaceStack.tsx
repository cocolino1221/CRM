import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import AvailabilityScreen from '../screens/AvailabilityScreen';
import AutomationsScreen from '../screens/AutomationsScreen';
import CalendarScreen from '../screens/CalendarScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import ReportsScreen from '../screens/ReportsScreen';
import WorkspaceHubScreen from '../screens/WorkspaceHubScreen';

export type WorkspaceStackParams = {
  WorkspaceHub: undefined;
  Analytics: undefined;
  Calendar: undefined;
  Documents: undefined;
  Payments: undefined;
  Automations: undefined;
  Availability: undefined;
  Reports: undefined;
};

const Stack = createNativeStackNavigator<WorkspaceStackParams>();

export default function WorkspaceStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkspaceHub" component={WorkspaceHubScreen} />
      <Stack.Screen name="Analytics" component={AnalyticsScreen} />
      <Stack.Screen name="Calendar" component={CalendarScreen} />
      <Stack.Screen name="Documents" component={DocumentsScreen} />
      <Stack.Screen name="Payments" component={PaymentsScreen} />
      <Stack.Screen name="Automations" component={AutomationsScreen} />
      <Stack.Screen name="Availability" component={AvailabilityScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
    </Stack.Navigator>
  );
}
