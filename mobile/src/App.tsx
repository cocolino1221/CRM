import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationsStore } from '@/stores/notifications-store';
import TabBar from '@/components/TabBar';
import ToastContainer from '@/components/Toast';
import LoginPage from '@/pages/LoginPage';
import ConversationList from '@/pages/whatsapp/ConversationList';
import ChatView from '@/pages/whatsapp/ChatView';
import LeadsList from '@/pages/leads/LeadsList';
import LeadDetail from '@/pages/leads/LeadDetail';
import CalendarPage from '@/pages/calendar/CalendarPage';
import NotificationsList from '@/pages/notifications/NotificationsList';
import SettingsPage from '@/pages/settings/SettingsPage';
import DocumentsList from '@/pages/documents/DocumentsList';

function AuthenticatedApp() {
  const fetchUnreadCount = useNotificationsStore(s => s.fetchUnreadCount);

  useEffect(() => {
    fetchUnreadCount();
    const iv = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden pb-24">
        <Routes>
          <Route path="/whatsapp" element={<ConversationList />} />
          <Route path="/whatsapp/chat/:waId" element={<ChatView />} />
          <Route path="/documents" element={<DocumentsList />} />
          <Route path="/leads" element={<LeadsList />} />
          <Route path="/leads/:id" element={<LeadDetail />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/notifications" element={<NotificationsList />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/whatsapp" replace />} />
        </Routes>
      </div>
      <TabBar />
    </div>
  );
}

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => { checkAuth(); }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      {isAuthenticated ? (
        <AuthenticatedApp />
      ) : (
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
