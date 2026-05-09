import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en.json';
import ru from './ru.json';
import uk from './uk.json';
import ar from './ar.json';

const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      uk: { translation: uk },
      ar: { translation: ar },
    },
    lng: tgLang || undefined,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'aurummine_lang',
    },
  });

// Set RTL direction for Arabic
const updateDir = (lang) => {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
};
updateDir(i18n.language);
i18n.on('languageChanged', updateDir);

export default i18n;
