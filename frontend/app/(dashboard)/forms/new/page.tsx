'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import FormBuilder from '@/components/forms/FormBuilder';
import api from '@/lib/api';
import { Form, FormStatus } from '@/types/form';

export default function NewFormPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (formData: Partial<Form>) => {
    try {
      setIsSaving(true);
      setError('');

      if (!formData.name) {
        setError('Form name is required');
        return;
      }

      if (!formData.fields || formData.fields.length === 0) {
        setError('Please add at least one field to your form');
        return;
      }

      const response = await api.post<Form>('/forms', {
        ...formData,
        status: FormStatus.DRAFT,
      });

      router.push(`/forms/${response.data.id}/edit`);
    } catch (err: any) {
      console.error('Failed to create form:', err);
      setError(err.response?.data?.message || 'Failed to create form');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Form</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build a custom form for lead capture and data collection
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Form Builder */}
      {isSaving ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Saving form...</p>
          </div>
        </div>
      ) : (
        <FormBuilder onSave={handleSave} />
      )}
    </div>
  );
}
