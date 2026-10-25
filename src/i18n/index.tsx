import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { en, type StringTable } from './en';
import { ta } from './ta';

export type Language = 'en' | 'ta';

const TABLES: Record<Language, StringTable> = { en, ta };
const STORAGE_KEY = 'fzeelogbook-language';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** English source table for the active language (falls back to en keys). */
  t: StringTable;
  /** True when the active table is the AI-translated Tamil scaffold. */
  isAiTranslated: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => undefined,
  t: en,
  isAiTranslated: false,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Language) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      t: TABLES[language],
      isAiTranslated: language === 'ta',
    }),
    [language, setLanguage]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Compact language switcher for headers/toolbars. */
export const LanguageSwitch: React.FC = () => {
  const { language, setLanguage } = useI18n();
  return (
    <select
      aria-label="Language"
      className="border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white"
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
    >
      <option value="en">English</option>
      <option value="ta">தமிழ் (AI-translated)</option>
    </select>
  );
};
