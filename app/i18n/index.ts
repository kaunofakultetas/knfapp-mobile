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
//  strings arrive as raw JSON — nothing is escaped on output
//  and the API client decodes nothing on the way in.
// -----------------------------------------------------------

// Intl.PluralRules polyfill — Hermes builds may ship without
// it, and i18next then collapses the Lithuanian _few forms to
// one/other. Both entries self-guard and no-op when native
// support exists. The explicit .js subpaths matter: the
// packages' exports maps list only the suffixed forms, which
// Metro forgives but jest's resolver enforces — a route that
// (transitively) imports this file must stay testable
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
import '@formatjs/intl-pluralrules/locale-data/lt.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';

// i18next core + React bindings
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Device locale for the first-launch language
import { getLocales } from 'expo-localization';

// Bundled catalogs — lt.json is authoritative, en mirrors it
import lt from './lt.json';
import en from './en.json';







// -----------------------------------------------------------
// deviceLanguage
// -----------------------------------------------------------
//
// Lithuanian devices start in Lithuanian, everyone else in
// English; the persisted setting overrides this after
// hydration. Exported so AppContext can seed a fresh install
// from the same detection instead of re-reading i18n.language.
//
// Used by:
//   - the init() call below — the starting lng
//   - context/AppContext.tsx — first-launch language seed
// -----------------------------------------------------------

export const deviceLanguage = getLocales()[0]?.languageCode === 'lt' ? 'lt' : 'en';

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
