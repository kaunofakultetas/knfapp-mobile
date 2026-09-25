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
//
//  The active language is also DECLARED to assistive tech on
//  the web build: <html lang> follows every language change
//  (app.json's web.lang is only the static shell's default
//  until the bundle runs), so a screen reader never reads the
//  Lithuanian UI with English rules (WCAG 3.1.1, KNF-129).
//  Native has no document — its screen-reader voice follows
//  the declared app localizations, plus accessibilityLanguage
//  on the elements that need it.
//
//  Split into:
//
//    deviceLanguage          — the first-launch language
//    declareDocumentLanguage — <html lang> on the web build
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







// -----------------------------------------------------------
// declareDocumentLanguage
// -----------------------------------------------------------
//
// Web only — a no-op wherever there is no document (native,
// tests): sets <html lang> to the app language, the one hint
// a browser screen reader takes its reading rules from. Runs
// once at start and on every languageChanged event below.
//
// Used by:
//   - the i18next languageChanged hook below
//   - __tests__/i18nDocumentLanguage.test.ts
// -----------------------------------------------------------

export function declareDocumentLanguage(language: string | undefined): void {
  if (!language || typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = language;
}


// i18next's own `use` method, not the package's named export —
// the lint rule cannot tell the two apart
// eslint-disable-next-line import/no-named-as-default-member
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

// The page's declared language follows the app's from the start
i18n.on('languageChanged', declareDocumentLanguage);
declareDocumentLanguage(i18n.language);

export default i18n;
