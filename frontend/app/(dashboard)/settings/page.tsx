'use client';

import { useState, useEffect } from 'react';
import { User, Bell, Lock, Building2, Palette, Loader2, Check, AlertCircle, Copy, RefreshCw, Link } from 'lucide-react';
import api from '@/lib/api';
import ThemeSettings from '@/components/settings/ThemeSettings';
import NotificationSettings from '@/components/settings/NotificationSettings';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  workspaceId: string;
}

function WorkspaceTab({
  workspaceId, userRole, inviteCode, inviteCodeLoading, codeCopied, linkCopied,
  fetchInviteCode, regenerateInviteCode, copyInviteCode, copyInviteLink,
}: {
  workspaceId: string; userRole: string; inviteCode: string; inviteCodeLoading: boolean;
  codeCopied: boolean; linkCopied: boolean;
  fetchInviteCode: () => void; regenerateInviteCode: () => void;
  copyInviteCode: () => void; copyInviteLink: () => void;
}) {
  useEffect(() => { fetchInviteCode(); }, []);
  const isAdmin = userRole === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Workspace Settings</h2>
        <p className="text-sm text-gray-600 mb-6">
          Manage your workspace settings and preferences.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Workspace ID</label>
          <input
            type="text"
            value={workspaceId}
            disabled
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 cursor-not-allowed font-mono text-sm"
          />
        </div>
      </div>

      {/* Invite Code Section */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-md font-semibold text-gray-900 mb-2">Workspace Invite Code</h3>
        <p className="text-sm text-gray-600 mb-4">
          Share this code or link with team members so they can register and join your workspace instantly (no approval needed).
        </p>

        {inviteCodeLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : inviteCode ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-3 rounded-lg bg-indigo-50 border border-indigo-200 font-mono text-lg font-bold text-indigo-700 tracking-widest text-center">
                {inviteCode}
              </div>
              <button
                onClick={copyInviteCode}
                className="px-4 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
              >
                {codeCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {codeCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600 truncate">
                https://etcrm.primafisoft.com/register?code={inviteCode}
              </div>
              <button
                onClick={copyInviteLink}
                className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm"
              >
                {linkCopied ? <Check className="h-4 w-4 text-green-600" /> : <Link className="h-4 w-4" />}
                {linkCopied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            {isAdmin && (
              <button
                onClick={regenerateInviteCode}
                disabled={inviteCodeLoading}
                className="mt-2 flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate Code
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No invite code found for this workspace.</p>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<UserProfile>('/auth/me');
      setProfile(response.data);
      setFormData({
        firstName: response.data.firstName,
        lastName: response.data.lastName,
        email: response.data.email,
      });
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      await api.put('/auth/profile', formData);
      setSaveSuccess(true);
      fetchProfile();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchInviteCode = async () => {
    try {
      setInviteCodeLoading(true);
      const response = await api.get<{ inviteCode: string }>('/users/workspace/invite-code');
      setInviteCode(response.data.inviteCode || '');
    } catch (err) {
      console.error('Failed to fetch invite code:', err);
    } finally {
      setInviteCodeLoading(false);
    }
  };

  const regenerateInviteCode = async () => {
    if (!confirm('Are you sure? The old invite code will stop working.')) return;
    try {
      setInviteCodeLoading(true);
      const response = await api.post<{ inviteCode: string }>('/users/workspace/invite-code/regenerate');
      setInviteCode(response.data.inviteCode);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to regenerate invite code');
    } finally {
      setInviteCodeLoading(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const copyInviteLink = () => {
    const link = `https://etcrm.primafisoft.com/register?code=${inviteCode}`;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      await api.put('/auth/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setSaveSuccess(true);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'appearance', name: 'Appearance', icon: Palette },
    { id: 'security', name: 'Security', icon: Lock },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'workspace', name: 'Workspace', icon: Building2 },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200">
          <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-700">Changes saved successfully!</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
              <p className="text-sm text-gray-600 mb-6">
                Update your account's profile information and email address.
              </p>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role
                </label>
                <input
                  type="text"
                  value={profile?.role || ''}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 bg-gray-50 text-gray-500 cursor-not-allowed"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
              <p className="text-sm text-gray-600 mb-6">
                Ensure your account is using a long, random password to stay secure.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'appearance' && (
          <ThemeSettings />
        )}

        {activeTab === 'notifications' && (
          <NotificationSettings />
        )}

        {activeTab === 'workspace' && (
          <WorkspaceTab
            workspaceId={profile?.workspaceId || ''}
            userRole={profile?.role || ''}
            inviteCode={inviteCode}
            inviteCodeLoading={inviteCodeLoading}
            codeCopied={codeCopied}
            linkCopied={linkCopied}
            fetchInviteCode={fetchInviteCode}
            regenerateInviteCode={regenerateInviteCode}
            copyInviteCode={copyInviteCode}
            copyInviteLink={copyInviteLink}
          />
        )}
      </div>
    </div>
  );
}
