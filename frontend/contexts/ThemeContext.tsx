'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Theme, ThemeColors, PRESET_THEMES, defaultTheme, getThemeById, createCustomTheme } from '@/types/theme';
import api from '@/lib/api';

interface ThemeContextType {
  currentTheme: Theme;
  setTheme: (themeId: string) => void;
  setCustomTheme: (colors: Partial<ThemeColors>) => void;
  presetThemes: Theme[];
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(defaultTheme);
  const [isLoading, setIsLoading] = useState(true);

  // Load user's theme preference from backend
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Apply theme CSS variables
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const loadThemePreference = async () => {
    try {
      // Only fetch theme preferences if user is authenticated
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          // Not authenticated, use default theme
          setIsLoading(false);
          return;
        }
      }

      // Fetch user preferences from backend
      const response = await api.get('/auth/me');
      const preferences = response.data.preferences || {};

      if (preferences.themeId) {
        const theme = getThemeById(preferences.themeId);
        if (theme) {
          setCurrentTheme(theme);
        }
      } else if (preferences.customTheme) {
        const customTheme = createCustomTheme(preferences.customTheme);
        setCurrentTheme(customTheme);
      }
    } catch (error: any) {
      // Silently ignore 401 errors (invalid/expired token) - don't log to console
      if (error?.response?.status !== 401) {
        console.error('Failed to load theme preferences:', error);
      }
      // Use default theme on error
    } finally {
      setIsLoading(false);
    }
  };

  const setTheme = async (themeId: string) => {
    const theme = getThemeById(themeId);
    if (!theme) return;

    setCurrentTheme(theme);

    // Save to backend
    try {
      await api.patch('/auth/me', {
        preferences: {
          themeId: themeId,
          customTheme: null,
        },
      });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const setCustomTheme = async (colors: Partial<ThemeColors>) => {
    const customTheme = createCustomTheme(colors);
    setCurrentTheme(customTheme);

    // Save to backend
    try {
      await api.patch('/auth/me', {
        preferences: {
          themeId: 'custom',
          customTheme: colors,
        },
      });
    } catch (error) {
      console.error('Failed to save custom theme:', error);
    }
  };

  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const colors = theme.colors;

    // Apply CSS custom properties
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-light', colors.primaryLight);
    root.style.setProperty('--color-primary-dark', colors.primaryDark);

    root.style.setProperty('--color-secondary', colors.secondary);
    root.style.setProperty('--color-secondary-light', colors.secondaryLight);
    root.style.setProperty('--color-secondary-dark', colors.secondaryDark);

    root.style.setProperty('--color-accent', colors.accent);
    root.style.setProperty('--color-accent-light', colors.accentLight);
    root.style.setProperty('--color-accent-dark', colors.accentDark);

    root.style.setProperty('--color-background', colors.background);
    root.style.setProperty('--color-background-alt', colors.backgroundAlt);
    root.style.setProperty('--color-background-card', colors.backgroundCard);

    root.style.setProperty('--color-text-primary', colors.textPrimary);
    root.style.setProperty('--color-text-secondary', colors.textSecondary);
    root.style.setProperty('--color-text-muted', colors.textMuted);

    root.style.setProperty('--color-border', colors.border);
    root.style.setProperty('--color-border-light', colors.borderLight);

    root.style.setProperty('--color-success', colors.success);
    root.style.setProperty('--color-warning', colors.warning);
    root.style.setProperty('--color-error', colors.error);
    root.style.setProperty('--color-info', colors.info);

    root.style.setProperty('--color-sidebar-bg', colors.sidebarBg);
    root.style.setProperty('--color-sidebar-text', colors.sidebarText);
    root.style.setProperty('--color-sidebar-active', colors.sidebarActive);

    root.style.setProperty('--color-header-bg', colors.headerBg);
    root.style.setProperty('--color-header-text', colors.headerText);

    // Update background color
    document.body.style.backgroundColor = colors.background;
  };

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        setTheme,
        setCustomTheme,
        presetThemes: PRESET_THEMES,
        isLoading,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
