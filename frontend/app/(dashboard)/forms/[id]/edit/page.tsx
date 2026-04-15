'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import FormBuilder from '@/components/forms/FormBuilder';
import api from '@/lib/api';
import { Form, FormStatus } from '@/types/form';

export default function EditFormPage() {
  const params = useParams();
  const router = useRouter();
  const formId = params.id as string;

  const [form, setForm] = useState<Form | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadForm = async () => {
      try {
        setIsLoading(true);
        setError('');
        const response = await api.get<Form>(`/forms/${formId}`);
        setForm(response.data);
      } catch (err: any) {
        console.error('Failed to load form:', err);
        setError(err.response?.data?.message || 'Failed to load form');
      } finally {
        setIsLoading(false);
      }
    };

    if (formId) {
      loadForm();
    }
  }, [formId]);

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

      await api.patch<Form>(`/forms/${formId}`, {
        ...formData,
        status: form?.status || FormStatus.DRAFT,
      });

      router.push('/forms');
    } catch (err: any) {
      console.error('Failed to save form:', err);
      setError(err.response?.data?.message || 'Failed to save form');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/forms')}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Forms
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">Form not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/forms')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Form</h1>
          <p className="mt-1 text-sm text-gray-500">Customize your form experience and fields</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isSaving ? (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Saving form...</p>
          </div>
        </div>
      ) : (
        <FormBuilder initialForm={form} onSave={handleSave} />
      )}
    </div>
  );
}
