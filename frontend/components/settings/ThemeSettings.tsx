'use client';

import { useState } from 'react';
import { Palette, Check, Sparkles, Edit2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { Theme, ThemeColors } from '@/types/theme';

export default function ThemeSettings() {
  const { currentTheme, setTheme, setCustomTheme, presetThemes } = useTheme();
  const [showCustomColors, setShowCustomColors] = useState(false);
  const [customColors, setCustomColors] = useState<Partial<ThemeColors>>(
    currentTheme.isCustom ? currentTheme.colors : {}
  );

  const handlePresetSelect = (themeId: string) => {
    setTheme(themeId);
    setShowCustomColors(false);
  };

  const handleCustomColorChange = (colorKey: keyof ThemeColors, value: string) => {
    setCustomColors(prev => ({
      ...prev,
      [colorKey]: value,
    }));
  };

  const handleApplyCustomTheme = () => {
    setCustomTheme(customColors);
  };

  const handleResetCustom = () => {
    setCustomColors({});
    setShowCustomColors(false);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Palette className="h-7 w-7 text-indigo-600" />
          Theme & Appearance
        </h2>
        <p className="text-gray-600 mt-2">
          Customize your dashboard colors and choose from preset themes
        </p>
      </div>

      {/* Preset Themes */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preset Themes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {presetThemes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handlePresetSelect(theme.id)}
              className={`relative p-6 rounded-2xl border-2 transition-all hover:scale-105 ${
                currentTheme.id === theme.id && !currentTheme.isCustom
                  ? 'border-indigo-600 bg-indigo-50 shadow-lg'
                  : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              {/* Selected Badge */}
              {currentTheme.id === theme.id && !currentTheme.isCustom && (
                <div className="absolute top-3 right-3 bg-indigo-600 text-white rounded-full p-1.5">
                  <Check className="h-4 w-4" />
                </div>
              )}

              {/* Theme Colors Preview */}
              <div className="flex gap-2 mb-4">
                <div
                  className="h-12 w-12 rounded-lg shadow-sm"
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex gap-2">
                    <div
                      className="h-4 flex-1 rounded"
                      style={{ backgroundColor: theme.colors.secondary }}
                    />
                    <div
                      className="h-4 flex-1 rounded"
                      style={{ backgroundColor: theme.colors.accent }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div
                      className="h-4 flex-1 rounded"
                      style={{ backgroundColor: theme.colors.success }}
                    />
                    <div
                      className="h-4 flex-1 rounded"
                      style={{ backgroundColor: theme.colors.warning }}
                    />
                  </div>
                </div>
              </div>

              {/* Theme Info */}
              <h4 className="font-semibold text-gray-900 mb-1">{theme.name}</h4>
              <p className="text-sm text-gray-600">{theme.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Theme */}
      <div className="border-t border-gray-200 pt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Custom Theme
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Create your own color scheme
            </p>
          </div>
          <button
            onClick={() => setShowCustomColors(!showCustomColors)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Edit2 className="h-4 w-4" />
            {showCustomColors ? 'Hide Editor' : 'Customize Colors'}
          </button>
        </div>

        {showCustomColors && (
          <div className="glass-effect rounded-2xl p-6 space-y-6">
            {/* Primary Colors */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Primary Colors</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorPicker
                  label="Primary"
                  value={customColors.primary || currentTheme.colors.primary}
                  onChange={(value) => handleCustomColorChange('primary', value)}
                />
                <ColorPicker
                  label="Primary Light"
                  value={customColors.primaryLight || currentTheme.colors.primaryLight}
                  onChange={(value) => handleCustomColorChange('primaryLight', value)}
                />
                <ColorPicker
                  label="Primary Dark"
                  value={customColors.primaryDark || currentTheme.colors.primaryDark}
                  onChange={(value) => handleCustomColorChange('primaryDark', value)}
                />
              </div>
            </div>

            {/* Secondary Colors */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Secondary Colors</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorPicker
                  label="Secondary"
                  value={customColors.secondary || currentTheme.colors.secondary}
                  onChange={(value) => handleCustomColorChange('secondary', value)}
                />
                <ColorPicker
                  label="Secondary Light"
                  value={customColors.secondaryLight || currentTheme.colors.secondaryLight}
                  onChange={(value) => handleCustomColorChange('secondaryLight', value)}
                />
                <ColorPicker
                  label="Secondary Dark"
                  value={customColors.secondaryDark || currentTheme.colors.secondaryDark}
                  onChange={(value) => handleCustomColorChange('secondaryDark', value)}
                />
              </div>
            </div>

            {/* Accent & Status Colors */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Accent & Status Colors</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <ColorPicker
                  label="Accent"
                  value={customColors.accent || currentTheme.colors.accent}
                  onChange={(value) => handleCustomColorChange('accent', value)}
                />
                <ColorPicker
                  label="Success"
                  value={customColors.success || currentTheme.colors.success}
                  onChange={(value) => handleCustomColorChange('success', value)}
                />
                <ColorPicker
                  label="Warning"
                  value={customColors.warning || currentTheme.colors.warning}
                  onChange={(value) => handleCustomColorChange('warning', value)}
                />
                <ColorPicker
                  label="Error"
                  value={customColors.error || currentTheme.colors.error}
                  onChange={(value) => handleCustomColorChange('error', value)}
                />
              </div>
            </div>

            {/* Background Colors */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Background Colors</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorPicker
                  label="Background"
                  value={customColors.background || currentTheme.colors.background}
                  onChange={(value) => handleCustomColorChange('background', value)}
                />
                <ColorPicker
                  label="Background Alt"
                  value={customColors.backgroundAlt || currentTheme.colors.backgroundAlt}
                  onChange={(value) => handleCustomColorChange('backgroundAlt', value)}
                />
                <ColorPicker
                  label="Card Background"
                  value={customColors.backgroundCard || currentTheme.colors.backgroundCard}
                  onChange={(value) => handleCustomColorChange('backgroundCard', value)}
                />
              </div>
            </div>

            {/* Sidebar Colors */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Sidebar Colors</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ColorPicker
                  label="Sidebar Background"
                  value={customColors.sidebarBg || currentTheme.colors.sidebarBg}
                  onChange={(value) => handleCustomColorChange('sidebarBg', value)}
                />
                <ColorPicker
                  label="Sidebar Text"
                  value={customColors.sidebarText || currentTheme.colors.sidebarText}
                  onChange={(value) => handleCustomColorChange('sidebarText', value)}
                />
                <ColorPicker
                  label="Sidebar Active"
                  value={customColors.sidebarActive || currentTheme.colors.sidebarActive}
                  onChange={(value) => handleCustomColorChange('sidebarActive', value)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={handleResetCustom}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Reset
              </button>
              <button
                onClick={handleApplyCustomTheme}
                className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:shadow-lg transition-all font-medium flex items-center gap-2"
              >
                <Check className="h-4 w-4" />
                Apply Custom Theme
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Current Theme Info */}
      {currentTheme.isCustom && (
        <div className="glass-effect rounded-xl p-4 border border-purple-200 bg-purple-50">
          <div className="flex items-center gap-2 text-purple-800">
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">You're using a custom theme!</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-16 rounded-lg border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm uppercase"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}
