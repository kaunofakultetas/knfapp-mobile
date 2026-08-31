// -----------------------------------------------------------
//  [*] socialuikit — provider
//
//  The single seam between the kit and its host: one context
//  carrying the theme, the labels, the replaceable pieces and
//  the three host functions the kit cannot supply itself — how
//  a stored image path becomes a loadable URL, what tapping a
//  link should do, and what time it is (injectable so relative
//  stamps are testable and freezable). Mount SocialUiKitProvider
//  above any kit component; with none mounted the hooks answer
//  the neutral defaults (the light burgundy theme, Lithuanian
//  labels, an identity URL resolver, a no-op link opener, the
//  real clock), so tests and demos need no ceremony.
//
//  Split into:
//
//    KitComponents       — the replaceable pieces
//    KitEnv              — the host functions
//    SocialUiKitProvider — the host mounts it once
//    useKitTheme / useKitLabels / useKitComponents / useKitEnv
//                        — what components read
// -----------------------------------------------------------

import type { ComponentType, ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import type { KitPost, KitUser } from '../core/types';
import { defaultLabels, type KitLabels } from './labels';
import { darkTheme, defaultTheme, resolveTheme, type KitTheme, type KitThemeOverride } from './theme';


export interface KitComponents {
  // The portrait everywhere one is drawn (default: an initials
  // disc); size is the diameter in dp
  Avatar?: ComponentType<{ user: KitUser; size: number }>;
  // The poll body inside a PostCard (default: PollBlock fed
  // from the host's data); the poll itself rides in post.custom,
  // typed only by the host — which is why the slot exists
  PostPoll?: ComponentType<{ post: KitPost }>;
  // A list with nothing to show (default: a centred label)
  EmptyState?: ComponentType<{ label: string }>;
}


export interface KitEnv {
  // Stored image reference (an upload path, an absolute URL) →
  // something expo-image can load; identity by default
  resolveImageUrl: (url: string) => string;
  // What tapping a link card, a mention or 'open link' does;
  // a silent no-op by default so the kit never imports a linking
  // module itself
  openHref: (href: string) => void;
  // The locale the provider RESOLVED (its `locale` prop, 'lt'
  // by default) — components formatting real dates read this
  // instead of guessing from the catalog
  locale: 'lt' | 'en';
  // The clock behind relative timestamps and poll countdowns
  now: () => Date;
}

interface KitContextValue {
  theme: KitTheme;
  labels: KitLabels;
  components: KitComponents;
  env: KitEnv;
}


// The provider-less fallback — Lithuanian first, like the
// provider's own locale default
const defaultEnv: KitEnv = {
  resolveImageUrl: (url) => url,
  openHref: () => {},
  locale: 'lt',
  now: () => new Date(),
};

const defaultValue: KitContextValue = {
  theme: defaultTheme,
  labels: defaultLabels.lt,
  components: {},
  env: defaultEnv,
};

const KitContext = createContext<KitContextValue>(defaultValue);







// -----------------------------------------------------------
// SocialUiKitProvider
// -----------------------------------------------------------
//
// Every field is optional: `scheme` picks the base theme and
// `theme` deep-merges over it, `locale` (default 'lt') picks
// the base labels and `labels` merges over those, `env` fills
// only the functions the host supplies. The value is memoised
// on its parts — the host should hand in stable objects (a
// theme built once, labels built once per language) so a feed
// of cards does not re-render on every host render.
//
// Used by:
//   - the host app, once, above its feed screens
// -----------------------------------------------------------

export function SocialUiKitProvider({
  theme,
  scheme,
  locale,
  labels,
  components,
  env,
  children,
}: {
  theme?: KitThemeOverride;
  scheme?: 'light' | 'dark';
  locale?: 'lt' | 'en';
  labels?: Partial<KitLabels>;
  components?: KitComponents;
  env?: Partial<KitEnv>;
  children: ReactNode;
}) {

  const resolvedTheme = useMemo(
    () => resolveTheme(scheme === 'dark' ? darkTheme : defaultTheme, theme),
    [scheme, theme],
  );

  // Entries carrying an explicit undefined are dropped before
  // the spread — the same guard the env merge gets field by
  // field, or a host building its bundle from optional config
  // would silently erase defaults
  const resolvedLabels = useMemo<KitLabels>(() => {
    const base = locale === 'en' ? defaultLabels.en : defaultLabels.lt;
    if (!labels) return base;
    const defined = Object.fromEntries(Object.entries(labels).filter(([, value]) => value !== undefined));
    return { ...base, ...defined };
  }, [labels, locale]);

  // Field-by-field so a host object carrying an explicit
  // undefined never shadows a default
  const resolvedEnv = useMemo<KitEnv>(
    () => ({
      resolveImageUrl: env?.resolveImageUrl ?? defaultEnv.resolveImageUrl,
      openHref: env?.openHref ?? defaultEnv.openHref,
      locale: locale === 'en' ? 'en' : 'lt',
      now: env?.now ?? defaultEnv.now,
    }),
    [env, locale],
  );

  const value = useMemo<KitContextValue>(
    () => ({
      theme: resolvedTheme,
      labels: resolvedLabels,
      components: components ?? defaultValue.components,
      env: resolvedEnv,
    }),
    [resolvedTheme, resolvedLabels, components, resolvedEnv],
  );


  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}







// -----------------------------------------------------------
// useKitTheme / useKitLabels / useKitComponents / useKitEnv
// -----------------------------------------------------------
//
// Used by:
//   - every kit component (theme, labels), PostCard and the
//     lists (components), media and link parts and RelativeTime
//     (env)
// -----------------------------------------------------------

export function useKitTheme(): KitTheme {
  return useContext(KitContext).theme;
}

export function useKitLabels(): KitLabels {
  return useContext(KitContext).labels;
}

export function useKitComponents(): KitComponents {
  return useContext(KitContext).components;
}

export function useKitEnv(): KitEnv {
  return useContext(KitContext).env;
}
