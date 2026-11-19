import React from 'react';
import type { SystemSettings } from '../../../../types';
import { COLOR_PRESETS, getColorConfig } from './appearanceConstants';
import type { AppearanceOnChange, ColorSettingKey } from './appearanceTypes';
import type { StorageNotice } from './appearanceTypes';
import { isValidHex, normalizeHex, contrastRatio } from './themeUtils';

interface UseColorEditorArgs {
  settings: SystemSettings;
  onChange: AppearanceOnChange;
  setStorageNotice: React.Dispatch<React.SetStateAction<StorageNotice | null>>;
}

export interface ColorEditorApi {
  activeColorKey: ColorSettingKey | null;
  colorDialogRef: React.RefObject<HTMLDivElement>;
  draftColor: string;
  setDraftColor: React.Dispatch<React.SetStateAction<string>>;
  hexInput: string;
  setHexInput: React.Dispatch<React.SetStateAction<string>>;
  hexError: string;
  setHexError: React.Dispatch<React.SetStateAction<string>>;
  copyFeedback: string | null;
  openColorEditor: (key: ColorSettingKey) => void;
  closeColorEditor: () => void;
  applySelectedColor: () => void;
  restoreSelectedColor: () => void;
  handleDraftHexChange: (value: string) => void;
  copySelectedHex: () => void;
  selectedColorConfig: ReturnType<typeof getColorConfig> | null;
  selectedCurrentValue: string;
  selectedPalette: string[];
  draftTextColor: string;
}

export function useColorEditor({ settings, onChange, setStorageNotice }: UseColorEditorArgs): ColorEditorApi {
  const [activeColorKey, setActiveColorKey] = React.useState<ColorSettingKey | null>(null);
  const colorDialogRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [draftColor, setDraftColor] = React.useState('#34445a');
  const [hexInput, setHexInput] = React.useState('#34445a');
  const [hexError, setHexError] = React.useState('');
  const [copyFeedback, setCopyFeedback] = React.useState<string | null>(null);

  const openColorEditor = React.useCallback((key: ColorSettingKey) => {
    const config = getColorConfig(key);
    const nextValue = normalizeHex(String(settings[key] || config.fallback), config.fallback);
    setActiveColorKey(key);
    setDraftColor(nextValue);
    setHexInput(nextValue);
    setHexError('');
  }, [settings]);

  const closeColorEditor = React.useCallback(() => {
    setActiveColorKey(null);
    setDraftColor('#34445a');
    setHexInput('#34445a');
    setHexError('');
  }, []);

  const applySelectedColor = React.useCallback(() => {
    if (!activeColorKey) return;
    const config = getColorConfig(activeColorKey);
    const normalized = normalizeHex(draftColor, config.fallback);
    if (!isValidHex(normalized)) {
      setHexError('يرجى إدخال كود HEX صالح مثل #3B6EAE');
      return;
    }
    onChange(activeColorKey as keyof SystemSettings, normalized as SystemSettings[keyof SystemSettings]);
    closeColorEditor();
  }, [activeColorKey, closeColorEditor, draftColor, onChange]);

  const restoreSelectedColor = React.useCallback(() => {
    if (!activeColorKey) return;
    const config = getColorConfig(activeColorKey);
    const defaultValue = config.fallback;
    setDraftColor(defaultValue);
    setHexInput(defaultValue);
    setHexError('');
  }, [activeColorKey]);

  const handleDraftHexChange = React.useCallback((value: string) => {
    const trimmed = value.trim();
    setHexInput(trimmed);
    if (!trimmed) {
      setHexError('أدخل رمز HEX');
      return;
    }
    if (!isValidHex(trimmed)) {
      setHexError('رمز HEX غير صالح');
      return;
    }
    const normalized = normalizeHex(trimmed, draftColor);
    setDraftColor(normalized);
    setHexError('');
  }, [draftColor]);

  const selectedColorConfig = activeColorKey ? getColorConfig(activeColorKey) : null;
  const selectedCurrentValue = selectedColorConfig ? normalizeHex(String(settings[selectedColorConfig.key] || selectedColorConfig.fallback), selectedColorConfig.fallback) : '#34445a';
  const selectedPalette = activeColorKey ? COLOR_PRESETS[activeColorKey] ?? [] : [];

  React.useEffect(() => {
    if (activeColorKey) {
      const config = getColorConfig(activeColorKey);
      const nextValue = normalizeHex(String(settings[activeColorKey] || config.fallback), config.fallback);
      setDraftColor(nextValue);
      setHexInput(nextValue);
    }
  }, [activeColorKey, settings]);

  React.useEffect(() => {
    if (!activeColorKey) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => colorDialogRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeColorEditor();
        return;
      }
      if (event.key !== 'Tab' || !colorDialogRef.current) return;
      const focusable = Array.from(colorDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        colorDialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === colorDialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [activeColorKey, closeColorEditor]);

  const copySelectedHex = React.useCallback(async () => {
    const value = draftColor.toUpperCase();
    let copied = false;

    if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Fallback below for browsers or contexts that block clipboard access.
      }
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand('copy');
      } catch (error) {
        console.warn('Clipboard write failed:', error);
      } finally {
        document.body.removeChild(textarea);
      }
    }

    if (copied) {
      setCopyFeedback('تم نسخ HEX');
      setStorageNotice(null);
      window.setTimeout(() => setCopyFeedback(null), 1200);
      return;
    }

    setCopyFeedback(null);
    setStorageNotice({ type: 'error', text: `تعذر نسخ ${value} إلى الحافظة. يمكنك نسخه يدويًا.` });
  }, [draftColor, setStorageNotice]);

  const draftTextColor = contrastRatio('#FFFFFF', draftColor) >= contrastRatio('#000000', draftColor)
    ? '#FFFFFF'
    : '#000000';

  return {
    activeColorKey,
    colorDialogRef,
    draftColor,
    setDraftColor,
    hexInput,
    setHexInput,
    hexError,
    setHexError,
    copyFeedback,
    openColorEditor,
    closeColorEditor,
    applySelectedColor,
    restoreSelectedColor,
    handleDraftHexChange,
    copySelectedHex,
    selectedColorConfig,
    selectedCurrentValue,
    selectedPalette,
    draftTextColor,
  };
}
