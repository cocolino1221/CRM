'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Settings, Trash2 } from 'lucide-react';
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
] as const;

const optionFieldTypes = new Set<FormFieldType>([
  FormFieldType.SELECT,
  FormFieldType.RADIO,
  FormFieldType.CHECKBOX,
]);

const fieldTypeLabelMap: Record<FormFieldType, string> = {
  [FormFieldType.TEXT]: 'Short Text',
  [FormFieldType.EMAIL]: 'Email',
  [FormFieldType.PHONE]: 'Phone',
  [FormFieldType.NUMBER]: 'Number',
  [FormFieldType.TEXTAREA]: 'Long Text',
  [FormFieldType.SELECT]: 'Dropdown',
  [FormFieldType.RADIO]: 'Radio Buttons',
  [FormFieldType.CHECKBOX]: 'Checkboxes',
  [FormFieldType.DATE]: 'Date',
  [FormFieldType.FILE]: 'File',
};

const defaultSettings: FormSettings = {
  submitButtonText: 'Submit',
  successMessage: 'Thank you for your submission!',
  allowMultipleSubmissions: true,
  requireAuthentication: false,
  notifyOnSubmit: false,
  notifyEmails: [],
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

const makeFieldLabel = (type: FormFieldType) => {
  switch (type) {
    case FormFieldType.TEXT:
      return 'Question';
    case FormFieldType.EMAIL:
      return 'Email';
    case FormFieldType.PHONE:
      return 'Phone Number';
    case FormFieldType.NUMBER:
      return 'Number';
    case FormFieldType.TEXTAREA:
      return 'Long Answer';
    case FormFieldType.SELECT:
      return 'Choose an option';
    case FormFieldType.RADIO:
      return 'Pick one option';
    case FormFieldType.CHECKBOX:
      return 'Select one or more options';
    case FormFieldType.DATE:
      return 'Pick a date';
    default:
      return 'Field';
  }
};

export default function FormBuilder({ initialForm, onSave }: FormBuilderProps) {
  const [form, setForm] = useState<Partial<Form>>({
    name: initialForm?.name || '',
    description: initialForm?.description || '',
    fields: initialForm?.fields || [],
    settings: mergeSettings(initialForm?.settings),
  });

  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  const mergedSettings = useMemo(() => mergeSettings(form.settings), [form.settings]);

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: nanoid(),
      type,
      label: makeFieldLabel(type),
      placeholder: '',
      helpText: '',
      required: false,
      width: 'full',
      options: optionFieldTypes.has(type) ? ['Option 1'] : undefined,
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

  const updateFieldValidation = (
    id: string,
    key: 'min' | 'max' | 'pattern' | 'message',
    value: number | string | undefined,
  ) => {
    setForm((prev) => ({
      ...prev,
      fields: (prev.fields || []).map((field) => {
        if (field.id !== id) return field;

        const nextValidation = {
          ...(field.validation || {}),
        } as NonNullable<FormField['validation']>;

        if (value === undefined || value === '') {
          delete nextValidation[key];
        } else {
          (nextValidation as any)[key] = value;
        }

        return {
          ...field,
          validation: Object.keys(nextValidation).length > 0 ? nextValidation : undefined,
        };
      }),
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

  const duplicateField = (id: string) => {
    const fields = form.fields || [];
    const source = fields.find((field) => field.id === id);

    if (!source) return;

    const copy: FormField = {
      ...source,
      id: nanoid(),
      label: `${source.label} (copy)`,
      options: source.options ? [...source.options] : undefined,
      validation: source.validation ? { ...source.validation } : undefined,
    };

    const sourceIndex = fields.findIndex((field) => field.id === id);
    const next = [...fields];
    next.splice(sourceIndex + 1, 0, copy);

    setForm((prev) => ({
      ...prev,
      fields: next,
    }));
    setEditingField(copy.id);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const current = [...(form.fields || [])];
    const target = direction === 'up' ? index - 1 : index + 1;

    if (target < 0 || target >= current.length) return;

    [current[index], current[target]] = [current[target], current[index]];

    setForm((prev) => ({ ...prev, fields: current }));
  };

  const changeFieldType = (field: FormField, type: FormFieldType) => {
    const updates: Partial<FormField> = {
      type,
    };

    if (optionFieldTypes.has(type)) {
      updates.options = field.options && field.options.length > 0 ? field.options : ['Option 1'];
    } else {
      updates.options = undefined;
    }

    updateField(field.id, updates);
  };

  const updateSettings = (updates: Partial<FormSettings>) => {
    setForm((prev) => ({
      ...prev,
      settings: {
        ...mergeSettings(prev.settings),
        ...updates,
      },
    }));
  };

  const updateThemeSetting = (
    key: 'accentColor' | 'backgroundColor' | 'cardColor' | 'textColor' | 'fontFamily',
    value: string,
  ) => {
    const current = mergeSettings(form.settings);
    updateSettings({
      theme: {
        ...current.theme,
        [key]: value,
      },
    });
  };

  const updateStartScreen = (
    key: 'enabled' | 'title' | 'description' | 'buttonText',
    value: string | boolean,
  ) => {
    const current = mergeSettings(form.settings);
    updateSettings({
      startScreen: {
        ...current.startScreen,
        [key]: value,
      },
    });
  };

  const handleSave = () => {
    onSave({
      ...form,
      settings: mergeSettings(form.settings),
    });
  };

  const firstField = (form.fields || [])[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Form Details</h2>
            <button
              onClick={() => setShowPreview((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Eye className="h-4 w-4" />
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Form Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="Lead Qualification Form"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="Tell respondents what this form is about"
                rows={3}
              />
            </div>
          </div>
        </div>

        {showPreview && (
          <div
            className="rounded-xl border border-gray-200 p-6"
            style={{
              background: mergedSettings.theme?.backgroundColor,
              color: mergedSettings.theme?.textColor,
              fontFamily: mergedSettings.theme?.fontFamily,
            }}
          >
            <div
              className="rounded-xl border border-gray-200 p-5"
              style={{ background: mergedSettings.theme?.cardColor }}
            >
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">Live Preview</p>
              {mergedSettings.layoutMode === 'oneQuestion' && (
                <div className="mb-4">
                  <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, Math.max(5, (form.fields || []).length > 0 ? 100 / (form.fields || []).length : 5))}%`,
                        background: mergedSettings.theme?.accentColor,
                      }}
                    />
                  </div>
                </div>
              )}

              <h3 className="text-lg font-semibold mb-2">{form.name || 'Untitled form'}</h3>
              {form.description && <p className="text-sm text-gray-600 mb-4">{form.description}</p>}

              {firstField ? (
                <div>
                  <p className="text-sm font-medium mb-2">{firstField.label}</p>
                  {firstField.helpText && (
                    <p className="text-xs text-gray-500 mb-2">{firstField.helpText}</p>
                  )}
                  <input
                    disabled
                    placeholder={firstField.placeholder || 'Answer preview'}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50"
                  />
                  <button
                    disabled
                    className="mt-4 px-4 py-2 rounded-lg text-sm text-white"
                    style={{
                      background: mergedSettings.theme?.accentColor,
                    }}
                  >
                    {mergedSettings.layoutMode === 'oneQuestion' ? 'Next' : mergedSettings.submitButtonText}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Add fields to preview your form.</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Form Fields</h2>
            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <Settings className="h-4 w-4" />
              {showSettings ? 'Hide Settings' : 'Form Settings'}
            </button>
          </div>

          <div className="space-y-4">
            {(form.fields || []).map((field, index) => {
              const isEditing = editingField === field.id;

              return (
                <div
                  key={field.id}
                  className={`border rounded-lg p-4 ${
                    isEditing ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col gap-1 pt-1">
                      <button
                        onClick={() => moveField(index, 'up')}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => moveField(index, 'down')}
                        disabled={index === (form.fields || []).length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-3">
                      {isEditing ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Label</label>
                              <input
                                type="text"
                                value={field.label}
                                onChange={(e) => updateField(field.id, { label: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                              <select
                                value={field.type}
                                onChange={(e) => changeFieldType(field, e.target.value as FormFieldType)}
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

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Placeholder</label>
                              <input
                                type="text"
                                value={field.placeholder || ''}
                                onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Help Text</label>
                              <input
                                type="text"
                                value={field.helpText || ''}
                                onChange={(e) => updateField(field.id, { helpText: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Default Value</label>
                              <input
                                type="text"
                                value={field.defaultValue ?? ''}
                                onChange={(e) => updateField(field.id, { defaultValue: e.target.value })}
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Width</label>
                              <select
                                value={field.width || 'full'}
                                onChange={(e) => updateField(field.id, { width: e.target.value as 'full' | 'half' })}
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                              >
                                <option value="full">Full Width</option>
                                <option value="half">Half Width</option>
                              </select>
                            </div>
                          </div>

                          {optionFieldTypes.has(field.type) && (
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Options (one per line)</label>
                              <textarea
                                value={(field.options || []).join('\n')}
                                onChange={(e) =>
                                  updateField(field.id, {
                                    options: e.target.value
                                      .split('\n')
                                      .map((option) => option.trim())
                                      .filter(Boolean),
                                  })
                                }
                                className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                                rows={4}
                              />
                            </div>
                          )}

                          {(field.type === FormFieldType.TEXT ||
                            field.type === FormFieldType.TEXTAREA ||
                            field.type === FormFieldType.NUMBER) && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Min</label>
                                <input
                                  type="number"
                                  value={field.validation?.min ?? ''}
                                  onChange={(e) =>
                                    updateFieldValidation(
                                      field.id,
                                      'min',
                                      e.target.value === '' ? undefined : Number(e.target.value),
                                    )
                                  }
                                  className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Max</label>
                                <input
                                  type="number"
                                  value={field.validation?.max ?? ''}
                                  onChange={(e) =>
                                    updateFieldValidation(
                                      field.id,
                                      'max',
                                      e.target.value === '' ? undefined : Number(e.target.value),
                                    )
                                  }
                                  className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Pattern (regex)</label>
                                <input
                                  type="text"
                                  value={field.validation?.pattern || ''}
                                  onChange={(e) => updateFieldValidation(field.id, 'pattern', e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                                  placeholder="^[A-Za-z ]+$"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Validation Message</label>
                                <input
                                  type="text"
                                  value={field.validation?.message || ''}
                                  onChange={(e) => updateFieldValidation(field.id, 'message', e.target.value)}
                                  className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                                  placeholder="Please enter a valid answer"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateField(field.id, { required: e.target.checked })}
                              className="rounded border-gray-300"
                            />
                            <label className="text-sm text-gray-700">Required field</label>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingField(field.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-gray-900">{field.label}</span>
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                              {field.helpText && (
                                <p className="text-xs text-gray-500 mt-1">{field.helpText}</p>
                              )}
                            </div>
                            <span className="text-xs text-gray-500">
                              {fieldTypeLabelMap[field.type]}
                            </span>
                          </div>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => duplicateField(field.id)}
                        className="text-gray-500 hover:text-gray-700"
                        title="Duplicate"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteField(field.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {(form.fields || []).length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No fields added yet. Add fields from the right sidebar.
              </div>
            )}
          </div>
        </div>

        {showSettings && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Typeform-Style Settings</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
                  <select
                    value={mergedSettings.layoutMode || 'classic'}
                    onChange={(e) => updateSettings({ layoutMode: e.target.value as 'classic' | 'oneQuestion' })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300"
                  >
                    <option value="classic">Classic (all questions)</option>
                    <option value="oneQuestion">One Question at a Time</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Submit Button Text</label>
                  <input
                    type="text"
                    value={mergedSettings.submitButtonText || ''}
                    onChange={(e) => updateSettings({ submitButtonText: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Success Message</label>
                <textarea
                  value={mergedSettings.successMessage || ''}
                  onChange={(e) => updateSettings({ successMessage: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mergedSettings.showProgressBar || false}
                    onChange={(e) => updateSettings({ showProgressBar: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Show progress bar
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mergedSettings.showQuestionNumbers || false}
                    onChange={(e) => updateSettings({ showQuestionNumbers: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Show question counter
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mergedSettings.allowMultipleSubmissions || false}
                    onChange={(e) => updateSettings({ allowMultipleSubmissions: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Allow multiple submissions
                </label>

                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mergedSettings.notifyOnSubmit || false}
                    onChange={(e) => updateSettings({ notifyOnSubmit: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Send email notification on submit
                </label>
              </div>

              <div className="rounded-lg border border-gray-200 p-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={mergedSettings.startScreen?.enabled || false}
                    onChange={(e) => updateStartScreen('enabled', e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Show welcome/start screen
                </label>

                {mergedSettings.startScreen?.enabled && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Screen Title</label>
                      <input
                        type="text"
                        value={mergedSettings.startScreen?.title || ''}
                        onChange={(e) => updateStartScreen('title', e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Screen Description</label>
                      <textarea
                        value={mergedSettings.startScreen?.description || ''}
                        onChange={(e) => updateStartScreen('description', e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Start Button Label</label>
                      <input
                        type="text"
                        value={mergedSettings.startScreen?.buttonText || ''}
                        onChange={(e) => updateStartScreen('buttonText', e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded border border-gray-300"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <p className="text-sm font-medium text-gray-900 mb-3">Theme</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Accent Color</label>
                    <input
                      type="color"
                      value={mergedSettings.theme?.accentColor || '#2563eb'}
                      onChange={(e) => updateThemeSetting('accentColor', e.target.value)}
                      className="w-full h-10 rounded border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Background Color</label>
                    <input
                      type="color"
                      value={mergedSettings.theme?.backgroundColor || '#f3f4f6'}
                      onChange={(e) => updateThemeSetting('backgroundColor', e.target.value)}
                      className="w-full h-10 rounded border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Card Color</label>
                    <input
                      type="color"
                      value={mergedSettings.theme?.cardColor || '#ffffff'}
                      onChange={(e) => updateThemeSetting('cardColor', e.target.value)}
                      className="w-full h-10 rounded border border-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Text Color</label>
                    <input
                      type="color"
                      value={mergedSettings.theme?.textColor || '#111827'}
                      onChange={(e) => updateThemeSetting('textColor', e.target.value)}
                      className="w-full h-10 rounded border border-gray-300"
                    />
                  </div>
                </div>
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

      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4 sticky top-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Field</h3>
          <div className="space-y-2 mb-4">
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

          <div className="pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Form Mode</p>
            <p className="text-sm text-gray-600">
              {mergedSettings.layoutMode === 'oneQuestion'
                ? 'Typeform style enabled: one question at a time.'
                : 'Classic form mode: all fields shown at once.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
