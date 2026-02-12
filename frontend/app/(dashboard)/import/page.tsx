'use client';

import { useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, Zap, ArrowLeft } from 'lucide-react';
import CSVUpload from '@/components/import/CSVUpload';
import GoogleSheetsImport from '@/components/import/GoogleSheetsImport';
import api from '@/lib/api';

type ImportMethod = 'csv' | 'google-sheets' | null;

export default function ImportPage() {
  const [selectedMethod, setSelectedMethod] = useState<ImportMethod>(null);
  const [googleIntegration, setGoogleIntegration] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkGoogleIntegration();
  }, []);

  const checkGoogleIntegration = async () => {
    try {
      const response = await api.get('/integrations');
      const integrations = response.data.integrations || [];
      const google = integrations.find((i: any) =>
        i.type.toLowerCase() === 'google' && i.status === 'active'
      );

      setGoogleIntegration(google);
    } catch (err) {
      console.error('Failed to check Google integration:', err);
    } finally {
      setLoading(false);
    }
  };

  const importMethods = [
    {
      id: 'csv' as ImportMethod,
      name: 'CSV File',
      description: 'Upload a CSV file from your computer',
      icon: Upload,
      color: 'from-blue-500 to-indigo-600',
      available: true,
    },
    {
      id: 'google-sheets' as ImportMethod,
      name: 'Google Sheets',
      description: 'Import directly from Google Sheets',
      icon: FileSpreadsheet,
      color: 'from-green-500 to-emerald-600',
      available: !!googleIntegration,
      requiresIntegration: true,
    },
  ];

  const handleComplete = (result: any) => {
    console.log('Import complete:', result);
    // Could show a success notification or redirect
  };

  const handleBack = () => {
    setSelectedMethod(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {!selectedMethod ? (
        <>
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-purple-900 bg-clip-text text-transparent">
              Import Contacts
            </h1>
            <p className="mt-2 text-gray-600">
              Choose an import method to add contacts to your CRM
            </p>
          </div>

          {/* Import Methods */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {importMethods.map((method) => {
              const Icon = method.icon;

              return (
                <button
                  key={method.id}
                  onClick={() => {
                    if (!method.available && method.requiresIntegration) {
                      window.location.href = '/integrations';
                      return;
                    }
                    setSelectedMethod(method.id);
                  }}
                  disabled={!method.available && !method.requiresIntegration}
                  className="group relative overflow-hidden glass-effect rounded-2xl p-8 transition-all duration-300 hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {/* Gradient Background */}
                  <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${method.color} opacity-10 blur-2xl transition-all duration-500 group-hover:opacity-20 group-hover:scale-125`}></div>

                  <div className="relative">
                    {/* Icon */}
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${method.color} mb-4 shadow-lg`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>

                    {/* Content */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{method.name}</h3>
                    <p className="text-sm text-gray-600 mb-4">{method.description}</p>

                    {/* Status */}
                    {method.requiresIntegration && !method.available ? (
                      <div className="flex items-center gap-2 text-sm text-amber-600">
                        <Zap className="h-4 w-4" />
                        <span>Connect Google first</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span>Ready to use</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Help Section */}
          <div className="glass-effect rounded-2xl p-6 border border-indigo-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Need Help?</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p>• <strong>CSV Import:</strong> Upload contacts from Excel, CSV, or any spreadsheet</p>
              <p>• <strong>Google Sheets:</strong> Connect your Google account to import directly from Sheets</p>
              <p>• All imports support field mapping to match your data structure</p>
            </div>
          </div>
        </>
      ) : selectedMethod === 'csv' ? (
        <div>
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to import methods
          </button>
          <CSVUpload onComplete={handleComplete} onCancel={handleBack} />
        </div>
      ) : selectedMethod === 'google-sheets' && googleIntegration ? (
        <div>
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to import methods
          </button>
          <GoogleSheetsImport
            integrationId={googleIntegration.id}
            onComplete={handleComplete}
            onCancel={handleBack}
          />
        </div>
      ) : null}
    </div>
  );
}
