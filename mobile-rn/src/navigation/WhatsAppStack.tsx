import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MessagesHubScreen from '../screens/MessagesHubScreen';
import SocialChatScreen from '../screens/SocialChatScreen';
import SocialInboxScreen from '../screens/SocialInboxScreen';
import WhatsAppInboxScreen from '../screens/WhatsAppInboxScreen';
import ChatScreen from '../screens/ChatScreen';
import type { MetaConversation, MetaInboxFilter } from '../types';

export type WhatsAppStackParams = {
  Hub: undefined;
  WhatsAppInbox: undefined;
  Chat: { waId: string; contactName: string; phone: string };
  SocialInbox: { initialChannel?: MetaInboxFilter } | undefined;
  SocialChat: { conversation: MetaConversation };
};

const Stack = createNativeStackNavigator<WhatsAppStackParams>();

export default function WhatsAppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Hub" component={MessagesHubScreen} />
      <Stack.Screen name="WhatsAppInbox" component={WhatsAppInboxScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="SocialInbox" component={SocialInboxScreen} />
      <Stack.Screen name="SocialChat" component={SocialChatScreen} />
    </Stack.Navigator>
  );
}
