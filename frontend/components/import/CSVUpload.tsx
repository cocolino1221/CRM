'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileText, CheckCircle, AlertCircle, Download, ArrowRight, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import api from '@/lib/api';

interface CSVUploadProps {
  onComplete?: (result: { imported: number; skipped: number; errors: any[] }) => void;
  onCancel?: () => void;
}

interface FieldMapping {
  csvColumn: string;
  crmField: string;
}

export default function CSVUpload({ onComplete, onCancel }: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'complete'>('upload');
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [skipFirstRow, setSkipFirstRow] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const crmFields = [
    { value: 'firstName', label: 'First Name', required: false },
    { value: 'lastName', label: 'Last Name', required: false },
    { value: 'email', label: 'Email', required: true },
    { value: 'phone', label: 'Phone', required: false },
    { value: 'company', label: 'Company', required: false },
    { value: 'jobTitle', label: 'Job Title', required: false },
    { value: 'website', label: 'Website', required: false },
    { value: 'linkedin', label: 'LinkedIn', required: false },
    { value: 'address', label: 'Address', required: false },
    { value: 'city', label: 'City', required: false },
    { value: 'country', label: 'Country', required: false },
    { value: 'notes', label: 'Notes', required: false },
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setFile(selectedFile);
    setError('');

    // Parse CSV
    Papa.parse(selectedFile, {
      complete: (results) => {
        const data = results.data as any[];
        if (data.length === 0) {
          setError('CSV file is empty');
          return;
        }

        const csvHeaders = data[0];
        setHeaders(csvHeaders);
        setCsvData(data);

        // Auto-map fields based on header names
        const autoMappings = csvHeaders.map((header: string) => {
          const normalizedHeader = header.toLowerCase().trim();
          let crmField = '';

          // Auto-detect common field names
          if (normalizedHeader.includes('first') && normalizedHeader.includes('name')) {
            crmField = 'firstName';
          } else if (normalizedHeader.includes('last') && normalizedHeader.includes('name')) {
            crmField = 'lastName';
          } else if (normalizedHeader === 'email' || normalizedHeader === 'e-mail') {
            crmField = 'email';
          } else if (normalizedHeader === 'phone' || normalizedHeader === 'telephone') {
            crmField = 'phone';
          } else if (normalizedHeader === 'company' || normalizedHeader === 'organization') {
            crmField = 'company';
          } else if (normalizedHeader.includes('job') || normalizedHeader === 'title' || normalizedHeader === 'position') {
            crmField = 'jobTitle';
          } else if (normalizedHeader === 'website' || normalizedHeader === 'url') {
            crmField = 'website';
          } else if (normalizedHeader === 'linkedin') {
            crmField = 'linkedin';
          } else if (normalizedHeader === 'address') {
            crmField = 'address';
          } else if (normalizedHeader === 'city') {
            crmField = 'city';
          } else if (normalizedHeader === 'country') {
            crmField = 'country';
          }

          return { csvColumn: header, crmField };
        });

        setMappings(autoMappings);
        setStep('mapping');
      },
      error: (err) => {
        setError('Error parsing CSV: ' + err.message);
      },
    });
  };

  const handleMappingChange = (csvColumn: string, crmField: string) => {
    setMappings(prev =>
      prev.map(m => (m.csvColumn === csvColumn ? { ...m, crmField } : m))
    );
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');

    try {
      // Validate that email is mapped
      const emailMapped = mappings.some(m => m.crmField === 'email' && m.csvColumn);
      if (!emailMapped) {
        setError('Email field must be mapped');
        setImporting(false);
        return;
      }

      // Transform CSV data to contacts array
      const startIndex = skipFirstRow ? 1 : 0;
      const contacts = [];

      for (let i = startIndex; i < csvData.length; i++) {
        const row = csvData[i];
        const contact: any = {
          source: 'csv_import',
          status: 'lead',
        };

        mappings.forEach(mapping => {
          if (mapping.crmField && mapping.csvColumn) {
            const columnIndex = headers.indexOf(mapping.csvColumn);
            if (columnIndex !== -1 && row[columnIndex]) {
              contact[mapping.crmField] = row[columnIndex];
            }
          }
        });

        // Only add if has email
        if (contact.email) {
          contacts.push(contact);
        }
      }

      setStep('importing');

      // Import contacts
      const response = await api.post('/contacts/bulk/import', { contacts });

      setResult(response.data);
      setStep('complete');

      if (onComplete) {
        onComplete(response.data);
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.response?.data?.message || 'Failed to import contacts');
      setStep('mapping');
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setCsvData([]);
    setHeaders([]);
    setMappings([]);
    setStep('upload');
    setResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadSampleCSV = () => {
    const sampleData = [
      ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Job Title'],
      ['John', 'Doe', 'john@example.com', '+1234567890', 'Acme Corp', 'CEO'],
      ['Jane', 'Smith', 'jane@example.com', '+0987654321', 'Tech Inc', 'CTO'],
    ];

    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Contacts from CSV</h2>
          <p className="text-sm text-gray-600 mt-1">Upload a CSV file and map columns to CRM fields</p>
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
      <div className="flex items-center gap-4">
        <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-indigo-600' : 'text-gray-400'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
            1
          </div>
          <span className="text-sm font-semibold">Upload</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200"></div>
        <div className={`flex items-center gap-2 ${step === 'mapping' ? 'text-indigo-600' : 'text-gray-400'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step === 'mapping' || step === 'importing' || step === 'complete' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
            2
          </div>
          <span className="text-sm font-semibold">Map Fields</span>
        </div>
        <div className="flex-1 h-0.5 bg-gray-200"></div>
        <div className={`flex items-center gap-2 ${step === 'importing' || step === 'complete' ? 'text-indigo-600' : 'text-gray-400'}`}>
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${step === 'complete' ? 'bg-green-600 text-white' : step === 'importing' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>
            {step === 'complete' ? <CheckCircle className="h-5 w-5" /> : '3'}
          </div>
          <span className="text-sm font-semibold">Import</span>
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

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer"
          >
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-semibold text-gray-900 mb-2">Click to upload CSV file</p>
            <p className="text-sm text-gray-600">or drag and drop your CSV file here</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={downloadSampleCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            >
              <Download className="h-4 w-4" />
              Download Sample CSV
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Field Mapping */}
      {step === 'mapping' && (
        <div className="space-y-4">
          <div className="glass-effect rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="h-5 w-5 text-indigo-600" />
              <div>
                <p className="font-semibold text-gray-900">{file?.name}</p>
                <p className="text-sm text-gray-600">{csvData.length - 1} rows detected</p>
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

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Map CSV Columns to CRM Fields</h3>
              {headers.map((header, index) => {
                const mapping = mappings.find(m => m.csvColumn === header);
                const isRequired = mapping?.crmField === 'email';

                return (
                  <div key={index} className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700">{header}</p>
                      {csvData[1] && (
                        <p className="text-xs text-gray-500 mt-1">
                          Example: {csvData[1][index]}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <select
                      value={mapping?.crmField || ''}
                      onChange={(e) => handleMappingChange(header, e.target.value)}
                      className={`flex-1 px-3 py-2 rounded-lg border ${
                        isRequired
                          ? 'border-indigo-300 bg-indigo-50'
                          : 'border-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm`}
                    >
                      <option value="">-- Skip this column --</option>
                      {crmFields.map(field => (
                        <option key={field.value} value={field.value}>
                          {field.label} {field.required && '(Required)'}
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
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!mappings.some(m => m.crmField === 'email')}
              className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Import Contacts
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-16 w-16 text-indigo-600 animate-spin mb-4" />
          <p className="text-lg font-semibold text-gray-900">Importing contacts...</p>
          <p className="text-sm text-gray-600 mt-2">Please wait while we process your file</p>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && result && (
        <div className="space-y-6">
          <div className="text-center py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h3>
            <p className="text-gray-600">Your contacts have been imported successfully</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="glass-effect rounded-xl p-6 border border-green-200 bg-green-50/50">
              <p className="text-sm text-gray-600 mb-1">Imported</p>
              <p className="text-3xl font-bold text-green-600">{result.imported || result.totalImported || 0}</p>
            </div>
            <div className="glass-effect rounded-xl p-6 border border-yellow-200 bg-yellow-50/50">
              <p className="text-sm text-gray-600 mb-1">Skipped</p>
              <p className="text-3xl font-bold text-yellow-600">{result.skipped || result.totalSkipped || 0}</p>
            </div>
            <div className="glass-effect rounded-xl p-6 border border-red-200 bg-red-50/50">
              <p className="text-sm text-gray-600 mb-1">Errors</p>
              <p className="text-3xl font-bold text-red-600">{result.errors?.length || 0}</p>
            </div>
          </div>

          {result.errors && result.errors.length > 0 && (
            <div className="glass-effect rounded-xl p-6 border border-red-200">
              <h4 className="font-semibold text-gray-900 mb-3">Import Errors</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {result.errors.map((err: any, idx: number) => (
                  <div key={idx} className="text-sm text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Row {err.row}: {err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-6 py-3 text-sm font-semibold text-indigo-600 bg-white border border-indigo-300 rounded-xl hover:bg-indigo-50 transition-all"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
