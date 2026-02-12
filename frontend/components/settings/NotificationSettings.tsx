'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, MessageSquare, Calendar, DollarSign, Users, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface NotificationPreferences {
  email: {
    newLead: boolean;
    dealUpdate: boolean;
    taskAssigned: boolean;
    taskDue: boolean;
    meetingReminder: boolean;
    teamMention: boolean;
    weeklyReport: boolean;
  };
  push: {
    newLead: boolean;
    dealUpdate: boolean;
    taskAssigned: boolean;
    taskDue: boolean;
    meetingReminder: boolean;
    teamMention: boolean;
  };
  inApp: {
    newLead: boolean;
    dealUpdate: boolean;
    taskAssigned: boolean;
    taskDue: boolean;
    meetingReminder: boolean;
    teamMention: boolean;
    systemUpdate: boolean;
  };
}

const defaultPreferences: NotificationPreferences = {
  email: {
    newLead: true,
    dealUpdate: true,
    taskAssigned: true,
    taskDue: true,
    meetingReminder: true,
    teamMention: true,
    weeklyReport: true,
  },
  push: {
    newLead: true,
    dealUpdate: true,
    taskAssigned: true,
    taskDue: true,
    meetingReminder: true,
    teamMention: true,
  },
  inApp: {
    newLead: true,
    dealUpdate: true,
    taskAssigned: true,
    taskDue: true,
    meetingReminder: true,
    teamMention: true,
    systemUpdate: true,
  },
};

export default function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const response = await api.get('/auth/me');
      const userPreferences = response.data.preferences?.notifications;
      if (userPreferences) {
        setPreferences({ ...defaultPreferences, ...userPreferences });
      }
    } catch (error) {
      console.error('Failed to load notification preferences:', error);
    }
  };

  const handleToggle = (channel: keyof NotificationPreferences, setting: string) => {
    setPreferences(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [setting]: !prev[channel][setting as keyof typeof prev[typeof channel]],
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      await api.patch('/auth/me', {
        preferences: {
          notifications: preferences,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const notificationTypes = [
    {
      key: 'newLead',
      label: 'New Lead',
      description: 'Get notified when a new lead is created',
      icon: Users,
      color: 'text-blue-600',
    },
    {
      key: 'dealUpdate',
      label: 'Deal Updates',
      description: 'Notifications for deal stage changes and updates',
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      key: 'taskAssigned',
      label: 'Task Assigned',
      description: 'When a task is assigned to you',
      icon: Check,
      color: 'text-purple-600',
    },
    {
      key: 'taskDue',
      label: 'Task Due',
      description: 'Reminders for upcoming and overdue tasks',
      icon: Calendar,
      color: 'text-orange-600',
    },
    {
      key: 'meetingReminder',
      label: 'Meeting Reminders',
      description: 'Notifications before scheduled meetings',
      icon: Calendar,
      color: 'text-indigo-600',
    },
    {
      key: 'teamMention',
      label: 'Team Mentions',
      description: 'When someone mentions you in comments',
      icon: MessageSquare,
      color: 'text-pink-600',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Bell className="h-7 w-7 text-indigo-600" />
          Notification Preferences
        </h2>
        <p className="text-gray-600 mt-2">
          Manage how you receive notifications and updates across different channels
        </p>
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-800">Notification preferences saved successfully!</span>
        </div>
      )}

      {/* Notification Channels */}
      <div className="space-y-6">
        {/* Email Notifications */}
        <div className="glass-effect rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Email Notifications</h3>
              <p className="text-sm text-gray-600">Receive updates via email</p>
            </div>
          </div>

          <div className="space-y-4">
            {notificationTypes.map((type) => (
              <NotificationToggle
                key={`email-${type.key}`}
                label={type.label}
                description={type.description}
                icon={type.icon}
                iconColor={type.color}
                checked={preferences.email[type.key as keyof typeof preferences.email]}
                onChange={() => handleToggle('email', type.key)}
              />
            ))}

            {/* Email-specific: Weekly Report */}
            <NotificationToggle
              label="Weekly Report"
              description="Receive a summary of your week's activity"
              icon={Mail}
              iconColor="text-gray-600"
              checked={preferences.email.weeklyReport}
              onChange={() => handleToggle('email', 'weeklyReport')}
            />
          </div>
        </div>

        {/* Push Notifications */}
        <div className="glass-effect rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
              <Bell className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Push Notifications</h3>
              <p className="text-sm text-gray-600">Receive instant notifications on your device</p>
            </div>
          </div>

          <div className="space-y-4">
            {notificationTypes.map((type) => (
              <NotificationToggle
                key={`push-${type.key}`}
                label={type.label}
                description={type.description}
                icon={type.icon}
                iconColor={type.color}
                checked={preferences.push[type.key as keyof typeof preferences.push]}
                onChange={() => handleToggle('push', type.key)}
              />
            ))}
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="glass-effect rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100">
              <MessageSquare className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">In-App Notifications</h3>
              <p className="text-sm text-gray-600">See notifications within the application</p>
            </div>
          </div>

          <div className="space-y-4">
            {notificationTypes.map((type) => (
              <NotificationToggle
                key={`inApp-${type.key}`}
                label={type.label}
                description={type.description}
                icon={type.icon}
                iconColor={type.color}
                checked={preferences.inApp[type.key as keyof typeof preferences.inApp]}
                onChange={() => handleToggle('inApp', type.key)}
              />
            ))}

            {/* In-App specific: System Updates */}
            <NotificationToggle
              label="System Updates"
              description="Important system announcements and updates"
              icon={Bell}
              iconColor="text-gray-600"
              checked={preferences.inApp.systemUpdate}
              onChange={() => handleToggle('inApp', 'systemUpdate')}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              Save Preferences
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  icon: Icon,
  iconColor,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  icon: any;
  iconColor: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-3 flex-1">
        <Icon className={`h-5 w-5 ${iconColor} mt-0.5`} />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{label}</h4>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
      </label>
    </div>
  );
}
