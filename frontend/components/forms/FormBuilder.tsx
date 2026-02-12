'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical, Settings, Eye } from 'lucide-react';
import { Form, FormField, FormFieldType, FormSettings } from '@/types/form';
import { nanoid } from 'nanoid';

interface FormBuilderProps {
  initialForm?: Partial<Form>;
  onSave: (form: Partial<Form>) => void;
}

const fieldTypes = [
  { value: FormFieldType.TEXT, label: 'Short Text' },
  { value: FormFieldType.EMAIL, label: 'Email' },
  { value: FormFieldType.PHONE, label: 'Phone' },
  { value: FormFieldType.NUMBER, label: 'Number' },
  { value: FormFieldType.TEXTAREA, label: 'Long Text' },
  { value: FormFieldType.SELECT, label: 'Dropdown' },
  { value: FormFieldType.RADIO, label: 'Radio Buttons' },
  { value: FormFieldType.CHECKBOX, label: 'Checkboxes' },
  { value: FormFieldType.DATE, label: 'Date' },
];

export default function FormBuilder({ initialForm, onSave }: FormBuilderProps) {
  const [form, setForm] = useState<Partial<Form>>({
    name: initialForm?.name || '',
    description: initialForm?.description || '',
    fields: initialForm?.fields || [],
    settings: initialForm?.settings || {
      submitButtonText: 'Submit',
      successMessage: 'Thank you for your submission!',
      allowMultipleSubmissions: true,
      requireAuthentication: false,
      notifyOnSubmit: false,
      notifyEmails: [],
    },
  });

  const [showSettings, setShowSettings] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: nanoid(),
      type,
      label: `New ${type} field`,
      placeholder: '',
      required: false,
      options: type === FormFieldType.SELECT || type === FormFieldType.RADIO || type === FormFieldType.CHECKBOX ? ['Option 1'] : undefined,
    };

    setForm((prev) => ({
      ...prev,
      fields: [...(prev.fields || []), newField],
    }));
    setEditingField(newField.id);
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setForm((prev) => ({
      ...prev,
      fields: (prev.fields || []).map((field) =>
        field.id === id ? { ...field, ...updates } : field
      ),
    }));
  };

  const deleteField = (id: string) => {
    setForm((prev) => ({
      ...prev,
      fields: (prev.fields || []).filter((field) => field.id !== id),
    }));
    if (editingField === id) {
      setEditingField(null);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...(form.fields || [])];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newFields.length) return;

    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];

    setForm((prev) => ({ ...prev, fields: newFields }));
  };

  const handleSave = () => {
    onSave(form);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form Builder */}
      <div className="lg:col-span-2 space-y-6">
        {/* Form Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Form Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Form Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="Contact Form"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="Brief description of your form"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Form Fields</h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>

          <div className="space-y-4">
            {(form.fields || []).map((field, index) => (
              <div
                key={field.id}
                className={`border rounded-lg p-4 ${
                  editingField === field.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-2">
                    <button
                      onClick={() => moveField(index, 'up')}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-3">
                    {editingField === field.id ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Label
                            </label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateField(field.id, { label: e.target.value })}
                              className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Type
                            </label>
                            <select
                              value={field.type}
                              onChange={(e) =>
                                updateField(field.id, { type: e.target.value as FormFieldType })
                              }
                              className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                            >
                              {fieldTypes.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Placeholder
                          </label>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) =>
                              updateField(field.id, { placeholder: e.target.value })
                            }
                            className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                          />
                        </div>

                        {(field.type === FormFieldType.SELECT ||
                          field.type === FormFieldType.RADIO ||
                          field.type === FormFieldType.CHECKBOX) && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Options (one per line)
                            </label>
                            <textarea
                              value={(field.options || []).join('\n')}
                              onChange={(e) =>
                                updateField(field.id, {
                                  options: e.target.value.split('\n').filter((o) => o.trim()),
                                })
                              }
                              className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              rows={3}
                            />
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) =>
                              updateField(field.id, { required: e.target.checked })
                            }
                            className="rounded border-gray-300"
                          />
                          <label className="text-sm text-gray-700">Required field</label>
                        </div>
                      </>
                    ) : (
                      <div
                        onClick={() => setEditingField(field.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">{field.label}</span>
                            {field.required && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {fieldTypes.find((t) => t.value === field.type)?.label}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => deleteField(field.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {(form.fields || []).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No fields added yet. Add fields from the right sidebar.
              </div>
            )}
          </div>
        </div>

        {/* Form Settings */}
        {showSettings && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Form Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Submit Button Text
                </label>
                <input
                  type="text"
                  value={form.settings?.submitButtonText || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, submitButtonText: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Success Message
                </label>
                <textarea
                  value={form.settings?.successMessage || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, successMessage: e.target.value },
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300"
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.settings?.allowMultipleSubmissions || false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: {
                        ...form.settings,
                        allowMultipleSubmissions: e.target.checked,
                      },
                    })
                  }
                  className="rounded border-gray-300"
                />
                <label className="text-sm text-gray-700">
                  Allow multiple submissions from same user
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.settings?.notifyOnSubmit || false}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      settings: { ...form.settings, notifyOnSubmit: e.target.checked },
                    })
                  }
                  className="rounded border-gray-300"
                />
                <label className="text-sm text-gray-700">
                  Send email notification on submission
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Form
          </button>
        </div>
      </div>

      {/* Field Types Sidebar */}
      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Field</h3>
          <div className="space-y-2">
            {fieldTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => addField(type.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-blue-300 transition-colors"
              >
                <Plus className="h-4 w-4 text-gray-400" />
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
