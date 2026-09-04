// -----------------------------------------------------------
//  [*] Ambient declarations — the Intl polyfill side-effects
//
//  The pluralization polyfills are side-effect imports whose
//  entry points expose no type declarations under the bundler
//  resolution the toolchain now enforces — the modules exist
//  and run; only the compiler needs telling.
//
//  Used by:
//    - i18n/index.ts — the four polyfill imports
// -----------------------------------------------------------

declare module '@formatjs/intl-getcanonicallocales/polyfill';
declare module '@formatjs/intl-pluralrules/polyfill';
declare module '@formatjs/intl-pluralrules/locale-data/lt';
declare module '@formatjs/intl-pluralrules/locale-data/en';
