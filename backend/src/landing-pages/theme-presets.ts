import { LandingPageTheme } from '../database/entities/landing-page.entity';

export interface ThemePreset {
  key: string;
  label: string;
  theme: LandingPageTheme;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'clean-light',
    label: 'Clean Light',
    theme: {
      accentColor: '#2563eb',
      backgroundColor: '#ffffff',
      cardColor: '#f8fafc',
      textColor: '#0f172a',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  {
    key: 'bold-dark',
    label: 'Bold Dark',
    theme: {
      accentColor: '#22d3ee',
      backgroundColor: '#0f172a',
      cardColor: '#1e293b',
      textColor: '#f1f5f9',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  {
    key: 'brand-accent',
    label: 'Brand Accent',
    theme: {
      accentColor: '#7c3aed',
      backgroundColor: '#faf5ff',
      cardColor: '#ffffff',
      textColor: '#1e1b4b',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
];

export function getThemePreset(key?: string): ThemePreset | undefined {
  if (!key) return undefined;
  return THEME_PRESETS.find((p) => p.key === key);
}
