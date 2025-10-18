'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, RefreshCw, Check, X, AlertTriangle, Activity, Calendar, TrendingUp, Settings as SettingsIcon, Loader2, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

export default function IntegrationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const integrationId = params.id as string;

  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const [settings, setSettings] = useState({
    autoSync: true,
    notifications: true,
    syncContacts: true,
    syncDeals: true,
  });

  // Mock data - replace with actual API call
  const integration = {
    id: integrationId,
    name: integrationId.charAt(0).toUpperCase() + integrationId.slice(1),
    icon: '🔮',
    color: 'from-purple-500 to-pink-500',
    status: 'active',
    connectedAt: '2025-01-15',
    lastSync: '2 hours ago',
    syncFrequency: 'Every 15 minutes',
    totalSyncs: 1247,
    successRate: 99.2,
    failedSyncs: 10,
    webhookUrl: 'https://api.slackcrm.com/webhooks/slack-123',
    stats: [
      { label: 'Contacts Synced', value: '1,247', change: '+12%', trend: 'up' },
      { label: 'Events Processed', value: '8,934', change: '+8%', trend: 'up' },
      { label: 'Last Sync', value: '2h ago', change: 'Active', trend: 'neutral' },
      { label: 'Success Rate', value: '99.2%', change: '+0.5%', trend: 'up' },
    ],
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setError('');

    try {
      await api.delete(`/integrations/${integrationId}`);
      router.push('/integrations');
    } catch (err: any) {
      console.error('Failed to disconnect integration:', err);
      setError(err.response?.data?.message || 'Failed to disconnect integration');
      setIsDisconnecting(false);
    }
  };

  const handleRefreshSync = async () => {
    setIsSyncing(true);
    setError('');
    setSuccess('');

    try {
      await api.post(`/integrations/${integrationId}/sync`);
      setSuccess('Sync started successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Failed to trigger sync:', err);
      setError(err.response?.data?.message || 'Failed to trigger sync');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.patch(`/integrations/${integrationId}`, { settings });
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      setError(err.response?.data?.message || 'Failed to save settings');
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(integration.webhookUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy webhook URL:', err);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600" />
          <span className="text-sm text-green-800">{success}</span>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => router.push('/integrations')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
        <span className="font-semibold">Back to Integrations</span>
      </button>

      {/* Header */}
      <div className="glass-effect rounded-2xl p-8 animate-slide-up">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            <div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${integration.color} text-4xl shadow-lg`}>
              {integration.icon}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{integration.name}</h1>
                <div className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <Check className="h-3 w-3" />
                  Connected
                </div>
              </div>
              <p className="text-gray-600">
                Connected on {new Date(integration.connectedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Last synced {integration.lastSync} • {integration.syncFrequency}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRefreshSync}
              disabled={isSyncing}
              className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={() => setShowDisconnectModal(true)}
              className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-all"
            >
              <Trash2 className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {integration.stats.map((stat, idx) => (
          <div
            key={stat.label}
            style={{ animationDelay: `${idx * 100}ms` }}
            className="group relative overflow-hidden rounded-2xl glass-effect p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl animate-scale-in"
          >
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 opacity-10 blur-2xl transition-all duration-500 group-hover:opacity-20 group-hover:scale-125"></div>
            <div className="relative">
              <p className="text-sm font-semibold text-gray-600 mb-2">{stat.label}</p>
              <div className="flex items-end justify-between">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                {stat.trend === 'up' && (
                  <div className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
                    <TrendingUp className="h-4 w-4" />
                    {stat.change}
                  </div>
                )}
                {stat.trend === 'neutral' && (
                  <div className="text-sm font-semibold text-gray-600">{stat.change}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settings */}
      <div className="glass-effect rounded-2xl p-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="h-6 w-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-gray-900">Integration Settings</h2>
        </div>

        <div className="space-y-6">
          {/* Auto Sync */}
          <div className="flex items-center justify-between py-4 border-b border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900">Automatic Sync</h3>
              <p className="text-sm text-gray-600">Automatically sync data every 15 minutes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoSync}
                onChange={(e) => setSettings({ ...settings, autoSync: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
            </label>
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between py-4 border-b border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900">Sync Notifications</h3>
              <p className="text-sm text-gray-600">Get notified when syncs complete or fail</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
            </label>
          </div>

          {/* Sync Contacts */}
          <div className="flex items-center justify-between py-4 border-b border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900">Sync Contacts</h3>
              <p className="text-sm text-gray-600">Automatically create and update contacts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.syncContacts}
                onChange={(e) => setSettings({ ...settings, syncContacts: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
            </label>
          </div>

          {/* Sync Deals */}
          <div className="flex items-center justify-between py-4 border-b border-gray-200">
            <div>
              <h3 className="font-semibold text-gray-900">Sync Deals</h3>
              <p className="text-sm text-gray-600">Automatically create and update deals</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.syncDeals}
                onChange={(e) => setSettings({ ...settings, syncDeals: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-600 peer-checked:to-indigo-600"></div>
            </label>
          </div>

          {/* Webhook URL */}
          <div className="py-4">
            <h3 className="font-semibold text-gray-900 mb-2">Webhook URL</h3>
            <p className="text-sm text-gray-600 mb-3">Use this URL to receive webhook events</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={integration.webhookUrl}
                className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 font-mono"
              />
              <button
                onClick={handleCopyWebhook}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
              >
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-effect rounded-2xl p-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="h-6 w-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-gray-900">Recent Activity</h2>
        </div>

        <div className="space-y-4">
          {[
            { type: 'success', message: 'Successfully synced 47 contacts', time: '2 hours ago' },
            { type: 'success', message: 'Created 3 new deals from form submissions', time: '5 hours ago' },
            { type: 'warning', message: 'Sync delayed due to rate limiting', time: '1 day ago' },
            { type: 'success', message: 'Updated 12 contact records', time: '1 day ago' },
            { type: 'error', message: 'Failed to sync 2 contacts (API timeout)', time: '2 days ago' },
          ].map((activity, idx) => (
            <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-white/50 hover:bg-white transition-all">
              {activity.type === 'success' && (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
              )}
              {activity.type === 'warning' && (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
              )}
              {activity.type === 'error' && (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <X className="h-5 w-5 text-red-600" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{activity.message}</p>
                <p className="text-sm text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md mx-4 glass-effect rounded-2xl p-8 shadow-2xl animate-scale-in">
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">
              Disconnect {integration.name}?
            </h2>
            <p className="text-gray-600 text-center mb-6">
              This will stop all data syncing and remove the integration. You can reconnect at any time.
            </p>

            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}