'use client';

import { Plus, Phone, Mail, Calendar, Users, FileText, MessageSquare } from 'lucide-react';
import { useState } from 'react';

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color: string;
}

interface QuickActionsProps {
  onAddLead?: () => void;
  onAddContact?: () => void;
  onAddTask?: () => void;
  onScheduleCall?: () => void;
  onSendEmail?: () => void;
  onScheduleMeeting?: () => void;
}

export default function QuickActions({
  onAddLead,
  onAddContact,
  onAddTask,
  onScheduleCall,
  onSendEmail,
  onScheduleMeeting,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      id: 'add-lead',
      label: 'Add Lead',
      icon: <Plus className="h-4 w-4" />,
      onClick: onAddLead || (() => {}),
      color: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700',
    },
    {
      id: 'add-contact',
      label: 'Add Contact',
      icon: <Users className="h-4 w-4" />,
      onClick: onAddContact || (() => {}),
      color: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700',
    },
    {
      id: 'schedule-call',
      label: 'Schedule Call',
      icon: <Phone className="h-4 w-4" />,
      onClick: onScheduleCall || (() => {}),
      color: 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700',
    },
    {
      id: 'send-email',
      label: 'Send Email',
      icon: <Mail className="h-4 w-4" />,
      onClick: onSendEmail || (() => {}),
      color: 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700',
    },
    {
      id: 'add-task',
      label: 'Add Task',
      icon: <FileText className="h-4 w-4" />,
      onClick: onAddTask || (() => {}),
      color: 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700',
    },
    {
      id: 'schedule-meeting',
      label: 'Schedule Meeting',
      icon: <Calendar className="h-4 w-4" />,
      onClick: onScheduleMeeting || (() => {}),
      color: 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700',
    },
  ];

  return (
    <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
          <span className="text-sm font-semibold text-gray-700 mr-2 flex-shrink-0">
            Quick Actions:
          </span>
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={action.onClick}
              className={`${action.color} text-white px-4 py-2 rounded-lg text-sm font-medium shadow-md transition-all duration-200 flex items-center gap-2 whitespace-nowrap hover:shadow-lg hover:scale-105`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
