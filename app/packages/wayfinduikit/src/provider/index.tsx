// -----------------------------------------------------------
//  [*] wayfinduikit — provider
//
//  The single seam between the kit and its host: one context
//  carrying the theme, the labels and the two host functions
//  the kit cannot supply itself — how a stored image reference
//  (a plan raster, a panorama, a room photo) becomes a
//  loadable URL, and what time it is (injectable so anything
//  clock-bound is testable and freezable). Mount
//  WayfindUiKitProvider above any kit component; with none
//  mounted the hooks answer the neutral defaults (the light
//  burgundy theme, Lithuanian labels, an identity URL
//  resolver, the real clock), so tests and demos need no
//  ceremony.
//
//  Split into:
//
//    KitEnv               — the host functions + the locale
//    WayfindUiKitProvider — the host mounts it once
//    useKitTheme / useKitLabels / useKitEnv
//                         — what components read
// -----------------------------------------------------------

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import { defaultLabels, type KitLabels } from './labels';
import { darkTheme, defaultTheme, resolveTheme, type KitTheme, type KitThemeOverride } from './theme';


export interface KitEnv {
  // Stored image reference (an asset path, an absolute URL) →
  // something an image component can load; identity by default
  resolveImageUrl: (url: string) => string;
  // The locale the provider RESOLVED (its `locale` prop, 'lt'
  // by default) — components formatting real numbers or dates
  // read this instead of guessing from the catalog
  locale: 'lt' | 'en';
  // The clock behind anything time-bound (an ETA's "arrive
  // by", a stale-position check)
  now: () => Date;
}

// What a host hands the provider: the functions only — the
// locale is the provider's own prop, never overridden here
export interface KitEnvOverride {
  resolveImageUrl?: (url: string) => string;
  now?: () => Date;
}

interface KitContextValue {
  theme: KitTheme;
  labels: KitLabels;
  env: KitEnv;
}


// The provider-less fallback — Lithuanian first, like the
// provider's own locale default
const defaultEnv: KitEnv = {
  resolveImageUrl: (url) => url,
  locale: 'lt',
  now: () => new Date(),
};

const defaultValue: KitContextValue = {
  theme: defaultTheme,
  labels: defaultLabels.lt,
  env: defaultEnv,
};

const KitContext = createContext<KitContextValue>(defaultValue);







// -----------------------------------------------------------
// WayfindUiKitProvider
// -----------------------------------------------------------
//
// Every field is optional: `scheme` picks the base theme and
// `theme` deep-merges over it, `locale` (default 'lt') picks
// the base labels and `labels` merges over those, `env` fills
// only the functions the host supplies. The value is memoised
// on its parts — the host should hand in stable objects (a
// theme built once, labels built once per language) so a plan
// full of SVG does not re-render on every host render.
//
// Used by:
//   - the host app, once, above its wayfinding screens
// -----------------------------------------------------------

export function WayfindUiKitProvider({
  theme,
  scheme,
  locale,
  labels,
  env,
  children,
}: {
  theme?: KitThemeOverride;
  scheme?: 'light' | 'dark';
  locale?: 'lt' | 'en';
  labels?: Partial<KitLabels>;
  env?: KitEnvOverride;
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
      locale: locale === 'en' ? 'en' : 'lt',
      now: env?.now ?? defaultEnv.now,
    }),
    [env, locale],
  );

  const value = useMemo<KitContextValue>(
    () => ({ theme: resolvedTheme, labels: resolvedLabels, env: resolvedEnv }),
    [resolvedTheme, resolvedLabels, resolvedEnv],
  );


  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}







// -----------------------------------------------------------
// useKitTheme / useKitLabels / useKitEnv
// -----------------------------------------------------------
//
// Used by:
//   - every kit component — useKitTheme and useKitLabels
//   - pano/FlatPanorama.tsx, pano/PanoramaStage.tsx — useKitEnv,
//     for env.resolveImageUrl; the plan takes the host's ready
//     drawing and the preview card an image slot, so neither
//     reads env
//   - src/index.ts — the public surface; env.locale and
//     env.now have no reader inside the kit yet, a host reads
//     them through the exported hook
// -----------------------------------------------------------

export function useKitTheme(): KitTheme {
  return useContext(KitContext).theme;
}

export function useKitLabels(): KitLabels {
  return useContext(KitContext).labels;
}

export function useKitEnv(): KitEnv {
  return useContext(KitContext).env;
}
