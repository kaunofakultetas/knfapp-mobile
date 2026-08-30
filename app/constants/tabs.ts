// -----------------------------------------------------------
//  [*] Tabs — the single tab roster
//
//  The one table every part of the navigation shell derives
//  the six app surfaces from: the drawer's section rows, the
//  bottom bar's glyphs and the tabs layout's screen list all
//  read TABS, and the hard-pinned rule reads HARD_PINNED_TABS
//  — so adding, removing or hard-pinning a surface is one
//  edit here, never three files drifting apart.
//
//  Keys double as the route names under (main)/tabs, the
//  pinnedTabs entries and the tabs.* i18n lookup.
//
//  Split into:
//
//    TabDef           — one surface's shape
//    TABS             — the roster, in tab-bar order
//    HARD_PINNED_TABS — the keys that can never be unpinned
// -----------------------------------------------------------

// Glyph names and route typing — types only, nothing runs
import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';


type IoniconName = keyof typeof Ionicons.glyphMap;




// -----------------------------------------------------------
// TabDef
// -----------------------------------------------------------
//
// Used by:
//   - TABS (below)
//   - components/Sidebar.tsx — SectionRow's item prop
// -----------------------------------------------------------

export interface TabDef {
  key: string;
  icon: IoniconName;        // outline glyph — drawer rows, resting tabs
  iconFilled: IoniconName;  // filled glyph — the focused tab
  route: Href;
  hardPinned: boolean;      // news and messages can never be unpinned
}




// -----------------------------------------------------------
// TABS
// -----------------------------------------------------------
//
// Used by:
//   - components/Sidebar.tsx — the drawer's section rows
//   - components/navigation/TabBar.tsx — glyph pairs per route
//   - app/(main)/tabs/_layout.tsx — the Tabs.Screen list
// -----------------------------------------------------------

export const TABS: TabDef[] = [
  { key: 'news', icon: 'newspaper-outline', iconFilled: 'newspaper', route: '/(main)/tabs/news', hardPinned: true },
  { key: 'messages', icon: 'chatbubbles-outline', iconFilled: 'chatbubbles', route: '/(main)/tabs/messages', hardPinned: true },
  { key: 'schedule', icon: 'calendar-outline', iconFilled: 'calendar', route: '/(main)/tabs/schedule', hardPinned: false },
  { key: 'id', icon: 'id-card-outline', iconFilled: 'id-card', route: '/(main)/tabs/id', hardPinned: false },
  { key: 'map', icon: 'map-outline', iconFilled: 'map', route: '/(main)/tabs/map', hardPinned: false },
  { key: 'settings', icon: 'settings-outline', iconFilled: 'settings', route: '/(main)/tabs/settings', hardPinned: false },
];




// -----------------------------------------------------------
// HARD_PINNED_TABS
// -----------------------------------------------------------
//
// Derived, never listed twice — the enforcement lives in
// AppContext's ensureHardPinned, the drawer only renders the
// muted "always pinned" mark for these.
//
// Used by:
//   - context/AppContext.tsx — ensureHardPinned
// -----------------------------------------------------------

export const HARD_PINNED_TABS: string[] = TABS.filter((tab) => tab.hardPinned).map(
  (tab) => tab.key,
);
