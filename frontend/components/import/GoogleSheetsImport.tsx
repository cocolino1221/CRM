'use client';

import { useState, useEffect } from 'react';
import { FileSpreadsheet, X, CheckCircle, AlertCircle, RefreshCw, Loader2, ArrowRight, Users } from 'lucide-react';
import api from '@/lib/api';
import DuplicateResolutionModal, { DuplicateContact, DuplicateAction } from './DuplicateResolutionModal';
import ImportProgress, { ImportResult } from './ImportProgress';

interface GoogleSheetsImportProps {
  integrationId: string;
  onComplete?: (result: ImportResult) => void;
  onCancel?: () => void;
}

interface Sheet {
  id: string;
  name: string;
  url: string;
}

interface FieldMapping {
  column: string;
  field: string;
}

type Step = 'select' | 'preview' | 'checking-duplicates' | 'resolve-duplicates' | 'importing' | 'complete';

export default function GoogleSheetsImport({ integrationId, onComplete, onCancel }: GoogleSheetsImportProps) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<Sheet | null>(null);
  const [sheetData, setSheetData] = useState<any>(null);
  const [step, setStep] = useState<Step>('select');
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Duplicate state
  const [duplicates, setDuplicates] = useState<DuplicateContact[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<{
    totalContacts: number;
    duplicateCount: number;
    newCount: number;
    contacts: DuplicateContact[];
  } | null>(null);

  // Job tracking state
  const [importJobId, setImportJobId] = useState<string>('');
  const [importTotalQueued, setImportTotalQueued] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const crmFields = [
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email (Required)' },
    { value: 'phone', label: 'Phone' },
    { value: 'company', label: 'Company' },
    { value: 'jobTitle', label: 'Job Title' },
    { value: 'website', label: 'Website' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'address', label: 'Address' },
    { value: 'city', label: 'City' },
    { value: 'country', label: 'Country' },
  ];

  useEffect(() => {
    loadSheets();
  }, []);

  const loadSheets = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get(`/integrations/${integrationId}/google/sheets`);
      setSheets(response.data.sheets || []);
    } catch (err: any) {
      console.error('Failed to load sheets:', err);
      setError(err.response?.data?.message || 'Failed to load Google Sheets');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSheet = async (sheet: Sheet) => {
    setSelectedSheet(sheet);
    setLoading(true);
    setError('');

    try {
      const response = await api.get(
        `/integrations/${integrationId}/google/sheets/${sheet.id}`
      );

      setSheetData(response.data);

      // Auto-map based on first row headers
      if (response.data.data?.values && response.data.data.values.length > 0) {
        const headers = response.data.data.values[0];
        const autoMappings = headers.map((header: string, index: number) => {
          const normalizedHeader = header.toLowerCase().trim();
          let field = '';

          if (normalizedHeader.includes('first') && normalizedHeader.includes('name')) {
            field = 'firstName';
          } else if (normalizedHeader.includes('last') && normalizedHeader.includes('name')) {
            field = 'lastName';
          } else if (normalizedHeader === 'email' || normalizedHeader === 'e-mail' || normalizedHeader === 'email address') {
            field = 'email';
          } else if (normalizedHeader === 'phone' || normalizedHeader === 'telephone' || normalizedHeader === 'mobile') {
            field = 'phone';
          } else if (normalizedHeader === 'company' || normalizedHeader === 'organization' || normalizedHeader === 'company name') {
            field = 'company';
          } else if (normalizedHeader.includes('job') || normalizedHeader === 'title' || normalizedHeader === 'position') {
            field = 'jobTitle';
          } else if (normalizedHeader === 'website' || normalizedHeader === 'url') {
            field = 'website';
          } else if (normalizedHeader === 'linkedin') {
            field = 'linkedin';
          }

          return {
            column: String.fromCharCode(65 + index),
            field,
          };
        });

        setMappings(autoMappings);
      }

      setStep('preview');
    } catch (err: any) {
      console.error('Failed to load sheet data:', err);
      setError(err.response?.data?.message || 'Failed to load sheet data');
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (column: string, field: string) => {
    setMappings(prev =>
      prev.map(m => (m.column === column ? { ...m, field } : m))
    );
  };

  const handleCheckDuplicates = async () => {
    if (!selectedSheet) return;

    const emailMapped = mappings.some(m => m.field === 'email');
    if (!emailMapped) {
      setError('Email field must be mapped before checking for duplicates');
      return;
    }

    setStep('checking-duplicates');
    setError('');

    try {
      const mapping: Record<string, string> = {};
      mappings.forEach(m => {
        if (m.field) mapping[m.column] = m.field;
      });

      const response = await api.post(
        `/integrations/${integrationId}/google/sheets/${selectedSheet.id}/check-duplicates`,
        { mapping, skipFirstRow }
      );

      const result = response.data;
      setDuplicateCheckResult(result);

      if (result.duplicateCount > 0) {
        const dupeContacts = result.contacts.filter((c: DuplicateContact) => c.isDuplicate);
        setDuplicates(dupeContacts);
        setShowDuplicateModal(true);
        setStep('resolve-duplicates');
      } else {
        // No duplicates - proceed directly to import
        await startImport(mapping, {});
      }
    } catch (err: any) {
      console.error('Duplicate check failed:', err);
      setError(err.response?.data?.message || 'Failed to check for duplicates');
      setStep('preview');
    }
  };

  const handleDuplicateResolution = async (actions: Record<string, DuplicateAction>) => {
    setShowDuplicateModal(false);

    const mapping: Record<string, string> = {};
    mappings.forEach(m => {
      if (m.field) mapping[m.column] = m.field;
    });

    await startImport(mapping, actions);
  };

  const startImport = async (
    mapping: Record<string, string>,
    duplicateActions: Record<string, DuplicateAction>
  ) => {
    if (!selectedSheet) return;

    setStep('importing');
    setError('');

    try {
      const response = await api.post(
        `/integrations/${integrationId}/google/sheets/${selectedSheet.id}/import`,
        {
          mapping,
          skipFirstRow,
          duplicateActions,
        }
      );

      const { jobId, totalQueued } = response.data;

      if (!jobId) {
        setImportResult({
          success: true,
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: [],
          totalErrors: 0,
        });
        setStep('complete');
        return;
      }

      setImportJobId(jobId);
      setImportTotalQueued(totalQueued);
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.response?.data?.message || 'Failed to start import');
      setStep('preview');
    }
  };

  const handleImportComplete = (result: ImportResult) => {
    setImportResult(result);
    setStep('complete');
    if (onComplete) {
      onComplete(result);
    }
  };

  const handleImportError = (errorMsg: string) => {
    setError(errorMsg);
    setStep('preview');
  };

  const handleReset = () => {
    setSelectedSheet(null);
    setSheetData(null);
    setMappings([]);
    setStep('select');
    setImportResult(null);
    setImportJobId('');
    setDuplicates([]);
    setDuplicateCheckResult(null);
    setError('');
  };

  const isAfterMappingStep = ['checking-duplicates', 'resolve-duplicates', 'importing', 'complete'].includes(step);
  const isAfterImportStep = ['importing', 'complete'].includes(step);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import from Google Sheets</h2>
          <p className="text-sm text-gray-600 mt-1">Select a spreadsheet and map columns to CRM fields</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-lg p-2 hover:bg-gray-100 transition-all"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-2 ${step === 'select' ? 'text-indigo-600' : 'text-green-600'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
            step !== 'select' ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'
          }`}>
            {step !== 'select' ? <CheckCircle className="h-4 w-4" /> : '1'}
          </div>
          <span className="text-sm font-semibold hidden sm:inline">Select Sheet</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200 mx-2" />
        <div className={`flex items-center gap-2 ${
          step === 'preview' || step === 'checking-duplicates' || step === 'resolve-duplicates' ? 'text-indigo-600' :
          isAfterImportStep ? 'text-green-600' : 'text-gray-400'
        }`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
            isAfterImportStep ? 'bg-green-600 text-white' :
            isAfterMappingStep || step === 'preview' || step === 'checking-duplicates' || step === 'resolve-duplicates' ? 'bg-indigo-600 text-white' :
            'bg-gray-200 text-gray-500'
          }`}>
            {isAfterImportStep ? <CheckCircle className="h-4 w-4" /> : '2'}
          </div>
          <span className="text-sm font-semibold hidden sm:inline">Map Fields</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200 mx-2" />
        <div className={`flex items-center gap-2 ${
          step === 'importing' || step === 'complete' ? 'text-indigo-600' : 'text-gray-400'
        }`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
            step === 'complete' ? 'bg-green-600 text-white' :
            step === 'importing' ? 'bg-indigo-600 text-white' :
            'bg-gray-200 text-gray-500'
          }`}>
            {step === 'complete' ? <CheckCircle className="h-4 w-4" /> : '3'}
          </div>
          <span className="text-sm font-semibold hidden sm:inline">Import</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900">Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Step 1: Select Sheet */}
      {step === 'select' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Your Google Sheets</h3>
            <button
              onClick={loadSheets}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
            </div>
          ) : sheets.length === 0 ? (
            <div className="text-center py-12 glass-effect rounded-xl border border-gray-200">
              <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No Google Sheets found</p>
              <p className="text-sm text-gray-500 mt-1">Make sure you have Google Sheets in your Drive</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sheets.map(sheet => (
                <button
                  key={sheet.id}
                  onClick={() => handleSelectSheet(sheet)}
                  className="glass-effect rounded-xl p-6 border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 group-hover:border-green-300 transition-all">
                      <FileSpreadsheet className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{sheet.name}</h4>
                      <p className="text-xs text-gray-500 mt-1 truncate">{sheet.url}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview & Mapping */}
      {(step === 'preview' || step === 'checking-duplicates') && sheetData && (
        <div className="space-y-4">
          <div className="glass-effect rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <FileSpreadsheet className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-semibold text-gray-900">{selectedSheet?.name}</p>
                <p className="text-sm text-gray-600">
                  {(sheetData.data?.values?.length || 0) - (skipFirstRow ? 1 : 0)} data rows detected
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <input
                type="checkbox"
                id="skipFirstRow"
                checked={skipFirstRow}
                onChange={(e) => setSkipFirstRow(e.target.checked)}
                className="h-4 w-4 text-indigo-600 rounded"
              />
              <label htmlFor="skipFirstRow" className="text-sm text-gray-700">
                First row contains headers (skip during import)
              </label>
            </div>

            {/* Preview Table */}
            <div className="mb-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 bg-gray-50">Column</th>
                    {sheetData.data?.values?.[0]?.map((header: string, idx: number) => (
                      <th key={idx} className="text-left py-2 px-3 font-semibold text-gray-700 bg-gray-50">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetData.data?.values?.slice(1, 4).map((row: any[], rowIdx: number) => (
                    <tr key={rowIdx} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-gray-500 font-mono text-xs">Row {rowIdx + 2}</td>
                      {row.map((cell: string, cellIdx: number) => (
                        <td key={cellIdx} className="py-2 px-3 text-gray-700 max-w-32 truncate">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Field Mapping */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Map Columns to CRM Fields</h3>
              {mappings.map((mapping, index) => {
                const header = sheetData.data?.values?.[0]?.[index];
                const sampleValue = sheetData.data?.values?.[1]?.[index];
                const isEmailField = mapping.field === 'email';

                return (
                  <div key={mapping.column} className="flex items-center gap-4">
                    <div className="w-40 flex-shrink-0">
                      <p className="text-sm font-medium text-gray-700 truncate">
                        <span className="font-mono text-indigo-600">{mapping.column}:</span>{' '}
                        {header}
                      </p>
                      {sampleValue && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          e.g. {sampleValue}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <select
                      value={mapping.field}
                      onChange={(e) => handleMappingChange(mapping.column, e.target.value)}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        isEmailField
                          ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                          : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm`}
                    >
                      <option value="">-- Skip this column --</option>
                      {crmFields.map(field => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={handleReset}
              className="px-6 py-3 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
            >
              Back
            </button>
            <button
              onClick={handleCheckDuplicates}
              disabled={!mappings.some(m => m.field === 'email') || step === 'checking-duplicates'}
              className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {step === 'checking-duplicates' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking for duplicates...
                </>
              ) : (
                <>
                  Next: Check Duplicates
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Duplicate check summary */}
      {step === 'resolve-duplicates' && !showDuplicateModal && duplicateCheckResult && (
        <div className="space-y-4">
          <div className="glass-effect rounded-xl p-6 border border-amber-200 bg-amber-50/30">
            <div className="flex items-center gap-3 mb-4">
              <Users className="h-5 w-5 text-amber-600" />
              <h3 className="font-semibold text-gray-900">Duplicate Contacts Detected</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{duplicateCheckResult.totalContacts}</p>
                <p className="text-sm text-gray-600">Total contacts</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{duplicateCheckResult.duplicateCount}</p>
                <p className="text-sm text-gray-600">Already in CRM</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{duplicateCheckResult.newCount}</p>
                <p className="text-sm text-gray-600">New leads</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowDuplicateModal(true)}
              className="px-6 py-3 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-300 rounded-xl hover:bg-amber-100 transition-all"
            >
              Review Duplicates
            </button>
            <button
              onClick={() => handleDuplicateResolution({})}
              className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all"
            >
              Skip All &amp; Import New Only
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing with progress tracking */}
      {step === 'importing' && importJobId && (
        <ImportProgress
          jobId={importJobId}
          totalQueued={importTotalQueued}
          onComplete={handleImportComplete}
          onError={handleImportError}
        />
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && importResult && (
        <div className="space-y-6">
          <div className="text-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h3>
            <p className="text-gray-600">Your contacts have been imported successfully</p>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="glass-effect rounded-xl p-5 border border-gray-200 bg-gray-50/50 text-center">
              <p className="text-sm text-gray-600 mb-1">Total</p>
              <p className="text-3xl font-bold text-gray-800">{importResult.total}</p>
            </div>
            <div className="glass-effect rounded-xl p-5 border border-green-200 bg-green-50/50 text-center">
              <p className="text-sm text-gray-600 mb-1">Created</p>
              <p className="text-3xl font-bold text-green-600">{importResult.created}</p>
            </div>
            <div className="glass-effect rounded-xl p-5 border border-blue-200 bg-blue-50/50 text-center">
              <p className="text-sm text-gray-600 mb-1">Updated</p>
              <p className="text-3xl font-bold text-blue-600">{importResult.updated}</p>
            </div>
            <div className="glass-effect rounded-xl p-5 border border-yellow-200 bg-yellow-50/50 text-center">
              <p className="text-sm text-gray-600 mb-1">Skipped</p>
              <p className="text-3xl font-bold text-yellow-600">{importResult.skipped}</p>
            </div>
          </div>

          {importResult.errors && importResult.errors.length > 0 && (
            <div className="glass-effect rounded-xl p-6 border border-red-200">
              <h4 className="font-semibold text-gray-900 mb-3">
                Import Errors ({importResult.totalErrors})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {importResult.errors.map((err, idx) => (
                  <div key={idx} className="text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <span className="font-medium">{err.email}:</span> {err.error}
                    </span>
                  </div>
                ))}
                {importResult.totalErrors > importResult.errors.length && (
                  <p className="text-sm text-red-500">
                    ...and {importResult.totalErrors - importResult.errors.length} more errors
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-6 py-3 text-sm font-semibold text-indigo-600 bg-white border border-indigo-300 rounded-xl hover:bg-indigo-50 transition-all"
            >
              Import Another Sheet
            </button>
          </div>
        </div>
      )}

      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && duplicates.length > 0 && (
        <DuplicateResolutionModal
          duplicates={duplicates}
          onConfirm={handleDuplicateResolution}
          onCancel={() => setShowDuplicateModal(false)}
        />
      )}
    </div>
  );
}
