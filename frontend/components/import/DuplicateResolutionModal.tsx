'use client';

import { useState } from 'react';
import { AlertTriangle, X, SkipForward, RefreshCw, Users, ChevronDown, ChevronUp } from 'lucide-react';

export type DuplicateAction = 'skip' | 'update' | 'create';

export interface DuplicateContact {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isDuplicate: boolean;
  existingContact?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    status: string;
    createdAt: Date;
  };
}

interface DuplicateResolutionModalProps {
  duplicates: DuplicateContact[];
  onConfirm: (actions: Record<string, DuplicateAction>) => void;
  onCancel: () => void;
}

export default function DuplicateResolutionModal({
  duplicates,
  onConfirm,
  onCancel,
}: DuplicateResolutionModalProps) {
  const [actions, setActions] = useState<Record<string, DuplicateAction>>(() => {
    const initial: Record<string, DuplicateAction> = {};
    duplicates.forEach(d => {
      initial[d.email.toLowerCase()] = 'skip';
    });
    return initial;
  });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<DuplicateAction | null>(null);

  const handleBulkAction = (action: DuplicateAction) => {
    setBulkAction(action);
    const updated: Record<string, DuplicateAction> = {};
    duplicates.forEach(d => {
      updated[d.email.toLowerCase()] = action;
    });
    setActions(updated);
  };

  const handleRowAction = (email: string, action: DuplicateAction) => {
    setBulkAction(null); // Clear bulk selection since individual override
    setActions(prev => ({ ...prev, [email.toLowerCase()]: action }));
  };

  const handleConfirm = () => {
    onConfirm(actions);
  };

  const skipCount = Object.values(actions).filter(a => a === 'skip').length;
  const updateCount = Object.values(actions).filter(a => a === 'update').length;

  const formatDate = (date: Date | string) => {
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Duplicate Contacts Found</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                {duplicates.length} contact{duplicates.length !== 1 ? 's' : ''} already exist in your CRM.
                Choose how to handle them.
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-2 hover:bg-gray-100 transition-all"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Bulk Actions */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700 mb-3">Apply to all duplicates:</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleBulkAction('skip')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                bulkAction === 'skip'
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <SkipForward className="h-4 w-4" />
              Skip All
            </button>
            <button
              onClick={() => handleBulkAction('update')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                bulkAction === 'update'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Update All
            </button>
          </div>
        </div>

        {/* Duplicate List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {duplicates.map((duplicate) => {
            const emailKey = duplicate.email.toLowerCase();
            const currentAction = actions[emailKey] || 'skip';
            const isExpanded = expandedRow === emailKey;

            return (
              <div
                key={emailKey}
                className={`rounded-xl border transition-all ${
                  currentAction === 'update'
                    ? 'border-blue-200 bg-blue-50/30'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Row Header */}
                <div className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 flex-shrink-0">
                    <Users className="h-5 w-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {duplicate.firstName || ''} {duplicate.lastName || ''}
                      {!duplicate.firstName && !duplicate.lastName && (
                        <span className="text-gray-500 italic">No name</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600 truncate">{duplicate.email}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRowAction(emailKey, 'skip')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        currentAction === 'skip'
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => handleRowAction(emailKey, 'update')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        currentAction === 'update'
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      Update
                    </button>
                    <button
                      onClick={() => setExpandedRow(isExpanded ? null : emailKey)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-all"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Detail Comparison */}
                {isExpanded && duplicate.existingContact && (
                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Sheet Data */}
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                        <p className="text-xs font-semibold text-green-700 mb-2">From Google Sheets</p>
                        <div className="space-y-1 text-xs">
                          <div>
                            <span className="text-gray-500">Name: </span>
                            <span className="text-gray-800">
                              {[duplicate.firstName, duplicate.lastName].filter(Boolean).join(' ') || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Email: </span>
                            <span className="text-gray-800">{duplicate.email}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Phone: </span>
                            <span className="text-gray-800">{duplicate.phone || '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Existing CRM Data */}
                      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-2">Existing in CRM</p>
                        <div className="space-y-1 text-xs">
                          <div>
                            <span className="text-gray-500">Name: </span>
                            <span className="text-gray-800">
                              {[duplicate.existingContact.firstName, duplicate.existingContact.lastName]
                                .filter(Boolean)
                                .join(' ') || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Status: </span>
                            <span className="text-gray-800 capitalize">{duplicate.existingContact.status}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Phone: </span>
                            <span className="text-gray-800">{duplicate.existingContact.phone || '—'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Created: </span>
                            <span className="text-gray-800">{formatDate(duplicate.existingContact.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {currentAction === 'update' && (
                      <p className="mt-2 text-xs text-blue-600">
                        Sheet data will be merged into the existing contact. Existing status and history preserved.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <div className="text-sm text-gray-600 space-x-4">
            <span>
              <span className="font-semibold text-gray-700">{skipCount}</span> to skip
            </span>
            <span>
              <span className="font-semibold text-blue-600">{updateCount}</span> to update
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Confirm &amp; Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
