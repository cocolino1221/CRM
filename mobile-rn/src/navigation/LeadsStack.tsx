import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LeadsListScreen from '../screens/LeadsListScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import LeadFormScreen from '../screens/LeadFormScreen';
import type { Contact } from '../types';

export type LeadsStackParams = {
  LeadsList: undefined;
  LeadDetail: { contactId: string; contact?: Contact; contactIds?: string[] };
  LeadForm: { contact?: Contact | null };
};

const Stack = createNativeStackNavigator<LeadsStackParams>();

export default function LeadsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LeadsList" component={LeadsListScreen} />
      <Stack.Screen name="LeadDetail" component={LeadDetailScreen} />
      <Stack.Screen
        name="LeadForm"
        component={LeadFormScreen}
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
