'use client';

import { useState, useEffect } from 'react';
import { Users, Download, Loader2, Check, X, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface WhatsAppGroup {
  id: string;
  subject: string;
  participantCount?: number;
}

interface WhatsAppGroupImportProps {
  integrationId: string;
}

export default function WhatsAppGroupImport({ integrationId }: WhatsAppGroupImportProps) {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadGroups();
  }, [integrationId]);

  const loadGroups = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await api.get(`/integrations/${integrationId}/whatsapp/groups`);
      setGroups(response.data.groups || []);
    } catch (err: any) {
      console.error('Failed to load WhatsApp groups:', err);
      setError(err.response?.data?.message || 'Failed to load WhatsApp groups. This feature requires WhatsApp Business API with group management permissions.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSelectAll = () => {
    if (selectedGroups.length === groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groups.map(g => g.id));
    }
  };

  const handleImport = async () => {
    if (selectedGroups.length === 0) {
      setError('Please select at least one group to import');
      return;
    }

    setIsImporting(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.post(`/integrations/${integrationId}/whatsapp/import-groups`, {
        groupIds: selectedGroups,
      });

      const { totalImported, groups: importResults } = response.data;

      setSuccess(
        `Successfully imported ${totalImported} contact${totalImported !== 1 ? 's' : ''} from ${selectedGroups.length} group${selectedGroups.length !== 1 ? 's' : ''}!`
      );
      setSelectedGroups([]);

      // Show detailed results
      console.log('Import results:', importResults);
    } catch (err: any) {
      console.error('Failed to import contacts:', err);
      setError(err.response?.data?.message || 'Failed to import contacts from WhatsApp groups');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            Import Contacts from WhatsApp Groups
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Select WhatsApp groups to import contacts into your CRM
          </p>
        </div>
        <button
          onClick={loadGroups}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Refresh Groups
        </button>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-600 hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Check className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800">{success}</p>
          </div>
          <button
            onClick={() => setSuccess('')}
            className="text-green-600 hover:text-green-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Groups List */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No WhatsApp groups found</p>
            <p className="text-sm text-gray-500 mt-1">
              Make sure your WhatsApp Business account has group management permissions
            </p>
          </div>
        ) : (
          <>
            {/* Select All Header */}
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedGroups.length === groups.length && groups.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Select All ({groups.length} groups)
                </span>
              </label>
              <span className="text-sm text-gray-600">
                {selectedGroups.length} selected
              </span>
            </div>

            {/* Groups */}
            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {groups.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={() => handleSelectGroup(group.id)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {group.subject}
                    </p>
                    {group.participantCount && (
                      <p className="text-sm text-gray-500">
                        {group.participantCount} participants
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Import Button */}
      {groups.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          <p className="text-sm text-gray-600">
            {selectedGroups.length} group{selectedGroups.length !== 1 ? 's' : ''} selected
          </p>
          <button
            onClick={handleImport}
            disabled={isImporting || selectedGroups.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Import Contacts
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
