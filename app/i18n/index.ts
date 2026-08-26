// -----------------------------------------------------------
//  [*] i18n — Lithuanian-first localization bootstrap
//
//  Initializes i18next synchronously with both bundled
//  catalogs. The starting language comes from the device
//  locale — Lithuanian devices get lt, everything else en —
//  and AppContext hydration then applies the user's persisted
//  choice on top. Lithuanian is the fallback for any key
//  missing in English, and supportedLngs guards against a
//  corrupt persisted language value ever activating.
//
//  escapeValue is off: React escapes on its own, and backend
//  strings arrive already entity-decoded by the API client's
//  response interceptor.
// -----------------------------------------------------------

// i18next core + React bindings
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Device locale for the first-launch language
import { getLocales } from 'expo-localization';

// Bundled catalogs — lt.json is authoritative, en mirrors it
import lt from './lt.json';
import en from './en.json';


// Lithuanian devices start in Lithuanian, everyone else in
// English; the persisted setting overrides this after hydration
const deviceLanguage = getLocales()[0]?.languageCode === 'lt' ? 'lt' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    lt: { translation: lt },
    en: { translation: en },
  },
  lng: deviceLanguage,
  fallbackLng: 'lt',
  supportedLngs: ['lt', 'en'],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
