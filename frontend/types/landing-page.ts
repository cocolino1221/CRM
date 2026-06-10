export enum LandingPageStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum LandingPageCaptureType {
  NATIVE = 'native',
  TYPEFORM = 'typeform',
}

export interface LandingPageHero {
  logo?: string;
  title?: string;
  subtitle?: string;
  image?: string;
  video?: string;
  accentColor?: string;
}

export interface LandingPageTheme {
  accentColor?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  fontFamily?: string;
}

export interface LandingPageContent {
  hero?: LandingPageHero;
  benefits?: string[];
  theme?: LandingPageTheme;
  themePreset?: string;
  submitButtonText?: string;
}

export interface LandingPageTypeformConfig {
  formId?: string;
  embedType?: 'inline';
}

export interface LandingPagePostSubmit {
  successMessage?: string;
  redirectUrl?: string;
  whatsapp?: {
    enabled?: boolean;
    message?: string;
  };
}

export interface LandingPageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
}

export interface LandingPage {
  id: string;
  name: string;
  slug: string;
  status: LandingPageStatus;
  content?: LandingPageContent;
  captureType: LandingPageCaptureType;
  formId?: string;
  typeformConfig?: LandingPageTypeformConfig;
  postSubmit?: LandingPagePostSubmit;
  viewCount: number;
  uniqueViewCount: number;
  submissionCount: number;
  lastSubmittedAt?: string;
  publishedAt?: string;
  seo?: LandingPageSeo;
  experimentId?: string;
  variantGroup?: string;
  conversionRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThemePreset {
  key: string;
  label: string;
  theme: LandingPageTheme;
}
