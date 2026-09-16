import { afterEach, describe, expect, it } from 'vitest';

import { resolveAppLanguage, setAppLanguage, tr } from '../i18n';

describe('app language resolution', () => {
  afterEach(() => setAppLanguage('en', false));

  it('uses English for every browser locale', () => {
    expect(resolveAppLanguage('vi-VN')).toBe('en');
    expect(resolveAppLanguage('en-US')).toBe('en');
    expect(resolveAppLanguage('fr-FR')).toBe('en');
    expect(resolveAppLanguage('ja-JP')).toBe('en');
    expect(resolveAppLanguage('')).toBe('en');
  });

  it('normalizes any saved language choice to English', () => {
    expect(resolveAppLanguage('en-US', 'vi')).toBe('en');
    expect(resolveAppLanguage('vi-VN', 'en')).toBe('en');
  });

  it('keeps UI text English even when an old alternate-language preference is requested', () => {
    setAppLanguage('vi', false);
    expect(tr('Settings')).toBe('Settings');
    setAppLanguage('en', false);
    expect(tr('Settings')).toBe('Settings');
  });
});
