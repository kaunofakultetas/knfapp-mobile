import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import lt from './lt.json';
import en from './en.json';

const resources = {
  lt: {
    translation: lt,
  },
  en: {
    translation: en,
  },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'lt',
    fallbackLng: 'lt',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;