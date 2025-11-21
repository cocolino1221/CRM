export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryLight: string;
  primaryDark: string;

  // Secondary colors
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;

  // Accent colors
  accent: string;
  accentLight: string;
  accentDark: string;

  // Background colors
  background: string;
  backgroundAlt: string;
  backgroundCard: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Border colors
  border: string;
  borderLight: string;

  // Status colors
  success: string;
  warning: string;
  error: string;
  info: string;

  // Sidebar colors
  sidebarBg: string;
  sidebarText: string;
  sidebarActive: string;

  // Header colors
  headerBg: string;
  headerText: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  isCustom?: boolean;
}

export interface UserThemePreferences {
  activeThemeId: string;
  customTheme?: ThemeColors;
}

// Pre-made themes
export const defaultTheme: Theme = {
  id: 'default',
  name: 'Ocean Blue',
  description: 'Professional blue theme with clean aesthetics',
  colors: {
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',

    secondary: '#8B5CF6',
    secondaryLight: '#A78BFA',
    secondaryDark: '#7C3AED',

    accent: '#06B6D4',
    accentLight: '#22D3EE',
    accentDark: '#0891B2',

    background: '#F9FAFB',
    backgroundAlt: '#FFFFFF',
    backgroundCard: '#FFFFFF',

    textPrimary: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',

    border: '#E5E7EB',
    borderLight: '#F3F4F6',

    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',

    sidebarBg: '#1F2937',
    sidebarText: '#D1D5DB',
    sidebarActive: '#3B82F6',

    headerBg: '#FFFFFF',
    headerText: '#111827',
  },
};

export const purpleTheme: Theme = {
  id: 'purple',
  name: 'Purple Dream',
  description: 'Modern purple theme with vibrant gradients',
  colors: {
    primary: '#8B5CF6',
    primaryLight: '#A78BFA',
    primaryDark: '#7C3AED',

    secondary: '#EC4899',
    secondaryLight: '#F472B6',
    secondaryDark: '#DB2777',

    accent: '#F59E0B',
    accentLight: '#FBBF24',
    accentDark: '#D97706',

    background: '#FAF5FF',
    backgroundAlt: '#FFFFFF',
    backgroundCard: '#FFFFFF',

    textPrimary: '#1F2937',
    textSecondary: '#4B5563',
    textMuted: '#9CA3AF',

    border: '#E9D5FF',
    borderLight: '#F3E8FF',

    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#8B5CF6',

    sidebarBg: '#581C87',
    sidebarText: '#E9D5FF',
    sidebarActive: '#EC4899',

    headerBg: '#FFFFFF',
    headerText: '#1F2937',
  },
};

export const darkTheme: Theme = {
  id: 'dark',
  name: 'Midnight Dark',
  description: 'Sleek dark theme for reduced eye strain',
  colors: {
    primary: '#60A5FA',
    primaryLight: '#93C5FD',
    primaryDark: '#3B82F6',

    secondary: '#A78BFA',
    secondaryLight: '#C4B5FD',
    secondaryDark: '#8B5CF6',

    accent: '#34D399',
    accentLight: '#6EE7B7',
    accentDark: '#10B981',

    background: '#0F172A',
    backgroundAlt: '#1E293B',
    backgroundCard: '#1E293B',

    textPrimary: '#F1F5F9',
    textSecondary: '#CBD5E1',
    textMuted: '#64748B',

    border: '#334155',
    borderLight: '#475569',

    success: '#34D399',
    warning: '#FBBF24',
    error: '#F87171',
    info: '#60A5FA',

    sidebarBg: '#020617',
    sidebarText: '#94A3B8',
    sidebarActive: '#60A5FA',

    headerBg: '#1E293B',
    headerText: '#F1F5F9',
  },
};

export const greenTheme: Theme = {
  id: 'green',
  name: 'Nature Green',
  description: 'Fresh green theme inspired by nature',
  colors: {
    primary: '#10B981',
    primaryLight: '#34D399',
    primaryDark: '#059669',

    secondary: '#14B8A6',
    secondaryLight: '#2DD4BF',
    secondaryDark: '#0D9488',

    accent: '#F59E0B',
    accentLight: '#FBBF24',
    accentDark: '#D97706',

    background: '#F0FDF4',
    backgroundAlt: '#FFFFFF',
    backgroundCard: '#FFFFFF',

    textPrimary: '#064E3B',
    textSecondary: '#065F46',
    textMuted: '#6B7280',

    border: '#D1FAE5',
    borderLight: '#ECFDF5',

    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#14B8A6',

    sidebarBg: '#064E3B',
    sidebarText: '#D1FAE5',
    sidebarActive: '#10B981',

    headerBg: '#FFFFFF',
    headerText: '#064E3B',
  },
};

export const PRESET_THEMES: Theme[] = [
  defaultTheme,
  purpleTheme,
  darkTheme,
  greenTheme,
];

export function getThemeById(id: string): Theme | undefined {
  return PRESET_THEMES.find(theme => theme.id === id);
}

export function createCustomTheme(colors: Partial<ThemeColors>): Theme {
  return {
    id: 'custom',
    name: 'Custom Theme',
    description: 'Your personalized color scheme',
    colors: {
      ...defaultTheme.colors,
      ...colors,
    },
    isCustom: true,
  };
}
