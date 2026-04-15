export enum FormStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum FormFieldType {
  TEXT = 'text',
  EMAIL = 'email',
  PHONE = 'phone',
  NUMBER = 'number',
  TEXTAREA = 'textarea',
  SELECT = 'select',
  RADIO = 'radio',
  CHECKBOX = 'checkbox',
  DATE = 'date',
  FILE = 'file',
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  width?: 'full' | 'half';
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  defaultValue?: any;
  helpText?: string;
}

export interface FormStartScreenSettings {
  enabled?: boolean;
  title?: string;
  description?: string;
  buttonText?: string;
}

export interface FormThemeSettings {
  accentColor?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  fontFamily?: string;
}

export interface FormSettings {
  submitButtonText?: string;
  successMessage?: string;
  redirectUrl?: string;
  notifyOnSubmit?: boolean;
  notifyEmails?: string[];
  allowMultipleSubmissions?: boolean;
  requireAuthentication?: boolean;
  captchaEnabled?: boolean;
  layoutMode?: 'classic' | 'oneQuestion';
  showProgressBar?: boolean;
  showQuestionNumbers?: boolean;
  startScreen?: FormStartScreenSettings;
  theme?: FormThemeSettings;
}

export interface Form {
  id: string;
  name: string;
  description?: string;
  status: FormStatus;
  fields: FormField[];
  settings?: FormSettings;
  slug: string;
  submissionCount: number;
  viewCount: number;
  lastSubmittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  data: Record<string, any>;
  status: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  trackingData?: Record<string, any>;
  contactId?: string;
  createdAt: string;
}
