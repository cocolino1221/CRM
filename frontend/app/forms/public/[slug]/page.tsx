'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Form, FormField, FormFieldType, FormSettings } from '@/types/form';

const defaultSettings: FormSettings = {
  submitButtonText: 'Submit',
  successMessage: 'Thank you for your submission!',
  layoutMode: 'oneQuestion',
  showProgressBar: true,
  showQuestionNumbers: true,
  startScreen: {
    enabled: true,
    title: 'Welcome',
    description: 'Please answer a few quick questions.',
    buttonText: 'Start',
  },
  theme: {
    accentColor: '#2563eb',
    backgroundColor: '#f3f4f6',
    cardColor: '#ffffff',
    textColor: '#111827',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};

const mergeSettings = (settings?: FormSettings): FormSettings => ({
  ...defaultSettings,
  ...settings,
  startScreen: {
    ...defaultSettings.startScreen,
    ...(settings?.startScreen || {}),
  },
  theme: {
    ...defaultSettings.theme,
    ...(settings?.theme || {}),
  },
});

const isEmptyValue = (value: unknown) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

const getInitialAnswers = (fields: FormField[]) => {
  return fields.reduce<Record<string, any>>((acc, field) => {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      acc[field.id] = field.defaultValue;
      return acc;
    }

    if (field.type === FormFieldType.CHECKBOX) {
      acc[field.id] = [];
      return acc;
    }

    acc[field.id] = '';
    return acc;
  }, {});
};

const getSubmissionTrackingData = () => {
  if (typeof window === 'undefined') return undefined;

  const searchParams = new URLSearchParams(window.location.search);
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  const utm = utmKeys.reduce<Record<string, string>>((acc, key) => {
    const value = searchParams.get(key);
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  return {
    pageUrl: window.location.href,
    referrer: document.referrer || undefined,
    ...utm,
  };
};

export default function PublicFormPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [form, setForm] = useState<Form | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showStartScreen, setShowStartScreen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadForm = async () => {
      try {
        setIsLoading(true);
        setError('');

        const response = await api.get<Form>(`/forms/public/${slug}`);
        const loadedForm: Form = {
          ...response.data,
          settings: mergeSettings(response.data.settings),
        };

        setForm(loadedForm);
        setAnswers(getInitialAnswers(loadedForm.fields || []));

        const oneQuestionMode = loadedForm.settings?.layoutMode === 'oneQuestion';
        const hasStartScreen = loadedForm.settings?.startScreen?.enabled;
        setShowStartScreen(Boolean(oneQuestionMode && hasStartScreen));
      } catch (err: any) {
        console.error('Failed to load public form:', err);
        setError(err.response?.data?.message || 'Form not found or unavailable');
      } finally {
        setIsLoading(false);
      }
    };

    if (slug) {
      loadForm();
    }
  }, [slug]);

  const settings = useMemo(() => mergeSettings(form?.settings), [form?.settings]);
  const fields = form?.fields || [];
  const oneQuestionMode = settings.layoutMode === 'oneQuestion';
  const currentField = fields[currentIndex];
  const progress = fields.length > 0 ? ((currentIndex + 1) / fields.length) * 100 : 0;

  const setAnswer = (fieldId: string, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  const validateField = (field: FormField): string | null => {
    const value = answers[field.id];

    if (field.required && isEmptyValue(value)) {
      return `${field.label} is required.`;
    }

    if (isEmptyValue(value)) {
      return null;
    }

    if (field.type === FormFieldType.EMAIL) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value))) {
        return `Please enter a valid email for ${field.label}.`;
      }
    }

    if (field.type === FormFieldType.PHONE) {
      const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
      if (!phoneRegex.test(String(value))) {
        return `Please enter a valid phone number for ${field.label}.`;
      }
    }

    if (field.type === FormFieldType.NUMBER) {
      const num = Number(value);
      if (Number.isNaN(num)) {
        return `${field.label} must be a number.`;
      }
      if (typeof field.validation?.min === 'number' && num < field.validation.min) {
        return `${field.label} must be at least ${field.validation.min}.`;
      }
      if (typeof field.validation?.max === 'number' && num > field.validation.max) {
        return `${field.label} must be at most ${field.validation.max}.`;
      }
    }

    if (field.validation?.pattern) {
      try {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(String(value))) {
          return field.validation.message || `${field.label} has an invalid format.`;
        }
      } catch {
        return null;
      }
    }

    return null;
  };

  const validateAll = (): string | null => {
    for (const field of fields) {
      const message = validateField(field);
      if (message) return message;
    }
    return null;
  };

  const submitForm = async () => {
    if (!form) return;

    const validationMessage = validateAll();
    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      await api.post(`/forms/public/${slug}/submit`, {
        data: answers,
        trackingData: getSubmissionTrackingData(),
      });

      setIsSubmitted(true);

      if (settings.redirectUrl) {
        setTimeout(() => {
          window.location.href = settings.redirectUrl as string;
        }, 1200);
      }
    } catch (err: any) {
      console.error('Failed to submit form:', err);
      setError(err.response?.data?.message || 'Failed to submit form. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = async () => {
    if (!currentField) return;

    const message = validateField(currentField);
    if (message) {
      setError(message);
      return;
    }

    setError('');

    if (currentIndex >= fields.length - 1) {
      await submitForm();
      return;
    }

    setCurrentIndex((prev) => prev + 1);
  };

  const handleClassicSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await submitForm();
  };

  const renderField = (field: FormField) => {
    const value = answers[field.id];

    const inputBaseClass =
      'w-full px-4 py-3 rounded-xl border border-gray-300 bg-white/90 focus:outline-none focus:ring-2';

    const commonStyle = {
      borderColor: '#d1d5db',
      color: settings.theme?.textColor,
      ['--tw-ring-color' as any]: settings.theme?.accentColor,
    };

    switch (field.type) {
      case FormFieldType.TEXT:
      case FormFieldType.EMAIL:
      case FormFieldType.PHONE:
      case FormFieldType.NUMBER:
      case FormFieldType.DATE: {
        const htmlInputType =
          field.type === FormFieldType.PHONE ? 'tel' : field.type;
        return (
          <input
            type={htmlInputType}
            value={value || ''}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            className={inputBaseClass}
            style={commonStyle}
          />
        );
      }

      case FormFieldType.TEXTAREA:
        return (
          <textarea
            value={value || ''}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            placeholder={field.placeholder || ''}
            rows={4}
            className={inputBaseClass}
            style={commonStyle}
          />
        );

      case FormFieldType.SELECT:
        return (
          <select
            value={value || ''}
            onChange={(e) => setAnswer(field.id, e.target.value)}
            className={inputBaseClass}
            style={commonStyle}
          >
            <option value="">Select an option</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case FormFieldType.RADIO:
        return (
          <div className="space-y-2">
            {(field.options || []).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={field.id}
                  checked={value === option}
                  onChange={() => setAnswer(field.id, option)}
                />
                {option}
              </label>
            ))}
          </div>
        );

      case FormFieldType.CHECKBOX:
        return (
          <div className="space-y-2">
            {(field.options || []).map((option) => {
              const selected = Array.isArray(value) ? value : [];
              const checked = selected.includes(option);

              return (
                <label key={option} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAnswer(field.id, [...selected, option]);
                      } else {
                        setAnswer(
                          field.id,
                          selected.filter((item: string) => item !== option),
                        );
                      }
                    }}
                  />
                  {option}
                </label>
              );
            })}
          </div>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-red-200 p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Form unavailable</h1>
          <p className="text-sm text-red-700">{error || 'This form is not available.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{
        background: settings.theme?.backgroundColor,
        color: settings.theme?.textColor,
        fontFamily: settings.theme?.fontFamily,
      }}
    >
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8"
          style={{ background: settings.theme?.cardColor }}
        >
          {isSubmitted ? (
            <div className="text-center py-10">
              <CheckCircle2 className="h-14 w-14 mx-auto text-green-600 mb-4" />
              <h2 className="text-2xl font-semibold mb-2">Done</h2>
              <p className="text-sm text-gray-600">{settings.successMessage}</p>
            </div>
          ) : showStartScreen ? (
            <div className="text-center py-10 space-y-4">
              <h1 className="text-3xl font-semibold">{settings.startScreen?.title || form.name}</h1>
              <p className="text-sm text-gray-600 max-w-lg mx-auto">
                {settings.startScreen?.description || form.description}
              </p>
              <button
                onClick={() => setShowStartScreen(false)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white"
                style={{ background: settings.theme?.accentColor }}
              >
                {settings.startScreen?.buttonText || 'Start'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h1 className="text-2xl md:text-3xl font-semibold mb-2">{form.name}</h1>
                {form.description && <p className="text-sm text-gray-600">{form.description}</p>}
              </div>

              {oneQuestionMode && fields.length > 0 && settings.showProgressBar && (
                <div className="mb-6">
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                        background: settings.theme?.accentColor,
                      }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {oneQuestionMode ? (
                currentField ? (
                  <div className="space-y-6">
                    <div>
                      {settings.showQuestionNumbers && (
                        <p className="text-xs text-gray-500 mb-2">
                          Question {currentIndex + 1} of {fields.length}
                        </p>
                      )}
                      <h2 className="text-xl font-semibold mb-2">{currentField.label}</h2>
                      {currentField.helpText && (
                        <p className="text-sm text-gray-500 mb-4">{currentField.helpText}</p>
                      )}
                      {renderField(currentField)}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
                        disabled={currentIndex === 0 || isSubmitting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 disabled:opacity-40"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </button>

                      <button
                        onClick={handleNext}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white disabled:opacity-60"
                        style={{ background: settings.theme?.accentColor }}
                      >
                        {isSubmitting
                          ? 'Submitting...'
                          : currentIndex === fields.length - 1
                          ? settings.submitButtonText || 'Submit'
                          : 'Next'}
                        {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                ) : null
              ) : (
                <form onSubmit={handleClassicSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map((field) => (
                      <div
                        key={field.id}
                        className={field.width === 'half' ? 'md:col-span-1' : 'md:col-span-2'}
                      >
                        <label className="block text-sm font-medium mb-2">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        {field.helpText && (
                          <p className="text-xs text-gray-500 mb-2">{field.helpText}</p>
                        )}
                        {renderField(field)}
                      </div>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full md:w-auto px-6 py-3 rounded-xl text-white disabled:opacity-60"
                    style={{ background: settings.theme?.accentColor }}
                  >
                    {isSubmitting ? 'Submitting...' : settings.submitButtonText || 'Submit'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
