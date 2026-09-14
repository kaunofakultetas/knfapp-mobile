// -----------------------------------------------------------
//  [*] Features — the shipping flags
//
//  features.json at the app root decides which MODULES this
//  build ships: a module that is not polished enough stays off
//  until its flag flips, and a flag whose module is one day
//  deleted goes with it — these are shipping gates, never
//  remote configuration (deliberately no backend half: the
//  file is baked into the bundle, so a flip ships with a
//  build). Everything is derived from the one JSON: the tab
//  roster filters here, gated routes wrap themselves in
//  components/FeatureGate.tsx, and the notification router
//  refuses taps into modules that are off.
//
//  Flags are COARSE on purpose — one per module, none per
//  button: polish is a property of a module, and a per-widget
//  flag table would become its own bug surface.
//
//  Split into:
//
//    FeatureKey       — the flag names, one per module
//    FEATURES         — the parsed, typed flag table
//    TAB_FEATURES     — tab key → the flag that gates it
//    ENABLED_TABS     — the tab roster this build shows
//    ENABLED_TAB_KEYS — the same roster, set-shaped for the bar
//    isFeatureEnabled — the one question everything asks
//
//  Used by:
//    - app/(main)/tabs/_layout.tsx — registers only enabled tabs
//    - components/Sidebar.tsx — drawer rows follow the same list
//    - components/FeatureGate.tsx — the route-level gate
//    - services/notifyRouting.ts — drops taps into off modules
// -----------------------------------------------------------

import { TABS, type TabDef } from '@/constants/tabs';

import featuresJson from '../features.json';







// -----------------------------------------------------------
// FeatureKey
// -----------------------------------------------------------
//
// One flag per app module. `studentId` covers the ID tab,
// `chat` the whole messaging surface, `social` the friends/
// profiles/activity family (which also owns the news feed's
// UGC strip) — and `accounts` the whole sign-in family:
// login, registration and every sign-in prompt. Modules that
// presuppose an account (chat, social, studentId) may only
// ship alongside accounts — __tests__/features.test.ts fails
// any release config that breaks the rule. The planned v1
// preset: news + schedule true, everything else false.
//
// Used by:
//   - FEATURES / isFeatureEnabled / TAB_FEATURES (below)
//   - components/FeatureGate.tsx — withFeature's first arg
// -----------------------------------------------------------

export type FeatureKey =
  | 'accounts'
  | 'news'
  | 'chat'
  | 'social'
  | 'schedule'
  | 'assistant'
  | 'studentId'
  | 'map';







// -----------------------------------------------------------
// FEATURES
// -----------------------------------------------------------
//
// The JSON, typed: a key missing from the file or carrying a
// non-boolean fails the build here instead of gating nothing
// at runtime.
//
// Used by:
//   - isFeatureEnabled / ENABLED_TABS (below)
//   - __tests__/features.test.ts — the shape pin
// -----------------------------------------------------------

export const FEATURES: Record<FeatureKey, boolean> = featuresJson;







// -----------------------------------------------------------
// TAB_FEATURES
// -----------------------------------------------------------
//
// Which flag gates which tab — null means the tab always
// ships (settings must stay reachable in every build).
//
// Used by:
//   - ENABLED_TABS (below)
//   - __tests__/features.test.ts — pins every TABS key mapped
// -----------------------------------------------------------

export const TAB_FEATURES: Record<string, FeatureKey | null> = {
  news: 'news',
  messages: 'chat',
  schedule: 'schedule',
  assistant: 'assistant',
  id: 'studentId',
  map: 'map',
  settings: null,
};







// -----------------------------------------------------------
// ENABLED_TABS
// -----------------------------------------------------------
//
// The roster this build actually shows, in TABS order — the
// tabs layout registers exactly these screens, so a disabled
// tab is not merely hidden chrome: its route never exists.
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the Tabs.Screen list
//   - components/Sidebar.tsx — the drawer's section rows
// -----------------------------------------------------------

export const ENABLED_TABS: TabDef[] = TABS.filter((tab) => {
  const feature = TAB_FEATURES[tab.key];
  return feature === null || FEATURES[feature];
});

// The same roster as a set — the custom tab bar filters the
// navigation state's routes by name (expo-router registers a
// route for EVERY file in the tabs folder, declared or not,
// so the bar cannot trust the layout's screen list)
export const ENABLED_TAB_KEYS: ReadonlySet<string> = new Set(ENABLED_TABS.map((tab) => tab.key));







// -----------------------------------------------------------
// isFeatureEnabled
// -----------------------------------------------------------
//
//   isFeatureEnabled('chat')  — may this build show messaging?
//
// Used by:
//   - components/FeatureGate.tsx — the route gate
//   - components/Sidebar.tsx — the social drawer rows
//   - services/notifyRouting.ts — the tap gate
// -----------------------------------------------------------

export const isFeatureEnabled = (feature: FeatureKey): boolean => FEATURES[feature];
