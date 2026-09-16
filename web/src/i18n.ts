import { useSyncExternalStore } from 'react';

export type AppLanguage = 'en' | 'vi';
export type TranslateParams = Record<string, string | number>;

const PREFERENCES_KEY = 'chatcmd.preferences';
const listeners = new Set<() => void>();

function interpolate(value: string, params?: TranslateParams) {
  if (!params) return value;
  return value.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => params[key] === undefined ? match : String(params[key]));
}

export function resolveAppLanguage(_browserLanguage?: string, _stored?: unknown): AppLanguage {
  return 'en';
}

function storedLanguage(): AppLanguage | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as { language?: unknown };
    return preferences.language === 'en' || preferences.language === 'vi' ? 'en' : undefined;
  } catch {
    return undefined;
  }
}

let language: AppLanguage = 'en';

export function getAppLanguage() { return language; }
export function appLocale() { return 'en-US'; }
export function hasStoredLanguagePreference() { return storedLanguage() !== undefined; }

export function tr(source: string, params?: TranslateParams) {
  return interpolate(source, params);
}

export function formatAppNumber(value: number) { return new Intl.NumberFormat(appLocale()).format(value); }

export function setAppLanguage(_next: AppLanguage, persist = true) {
  const changed = language !== 'en';
  language = 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = 'en';
  if (persist && typeof localStorage !== 'undefined') {
    try {
      const preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...preferences, language: 'en' }));
    } catch {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ language: 'en' }));
    }
  }
  if (changed) listeners.forEach((listener) => listener());
}

export function useAppLanguage() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => language,
    () => 'en' as AppLanguage,
  );
}

export function translatedStatus(status: string) { return tr(status.toLowerCase()); }

if (typeof document !== 'undefined') document.documentElement.lang = 'en';
