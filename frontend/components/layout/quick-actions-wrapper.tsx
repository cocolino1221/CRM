'use client';

import { useRouter } from 'next/navigation';
import QuickActions from '@/components/quick-actions';

export default function QuickActionsWrapper() {
  const router = useRouter();

  return (
    <QuickActions
      onAddLead={() => router.push('/leads?action=add')}
      onAddContact={() => router.push('/contacts?action=add')}
      onAddTask={() => router.push('/tasks?action=add')}
      onScheduleCall={() => router.push('/calendar?action=call')}
      onSendEmail={() => {
        // TODO: Open email composer
        console.log('Send email');
      }}
      onScheduleMeeting={() => router.push('/calendar?action=meeting')}
    />
  );
}
