'use client';

import { useRouter, usePathname } from 'next/navigation';
import QuickActions from '@/components/quick-actions';

export default function QuickActionsWrapper() {
  const router = useRouter();
  const pathname = usePathname();

  const handleAddLead = () => {
    if (pathname === '/leads') {
      // Trigger event for leads page
      window.dispatchEvent(new CustomEvent('openAddLeadModal'));
    } else {
      router.push('/leads');
    }
  };

  const handleAddContact = () => {
    if (pathname === '/contacts') {
      window.dispatchEvent(new CustomEvent('openAddContactModal'));
    } else {
      router.push('/contacts');
    }
  };

  const handleAddTask = () => {
    if (pathname === '/tasks') {
      window.dispatchEvent(new CustomEvent('openAddTaskModal'));
    } else {
      router.push('/tasks');
    }
  };

  const handleScheduleCall = () => {
    router.push('/calendar');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openScheduleCallModal'));
    }, 100);
  };

  const handleSendEmail = () => {
    // Open email composer modal
    window.dispatchEvent(new CustomEvent('openEmailComposerModal'));
  };

  const handleScheduleMeeting = () => {
    router.push('/calendar');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openScheduleMeetingModal'));
    }, 100);
  };

  return (
    <QuickActions
      onAddLead={handleAddLead}
      onAddContact={handleAddContact}
      onAddTask={handleAddTask}
      onScheduleCall={handleScheduleCall}
      onSendEmail={handleSendEmail}
      onScheduleMeeting={handleScheduleMeeting}
    />
  );
}
