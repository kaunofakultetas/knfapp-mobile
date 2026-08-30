// -----------------------------------------------------------
//  [*] chatuikit — provider
//
//  The single seam between the kit and its host: one context
//  carrying the theme, the labels, the locale, and the two
//  host functions the kit cannot supply itself — how a stored
//  image path becomes a loadable URL, and how an ISO stamp
//  becomes the short time under a bubble. Mount ChatUiKitProvider
//  above any kit component; with none mounted the hooks answer
//  the neutral defaults (defaultTheme, English labels, an
//  identity URL resolver, a plain HH:MM formatter), so tests
//  and demos need no ceremony.
//
//  Hosts may also swap whole pieces through `components` — a
//  custom time separator, typing bubble, intro card, system row,
//  unread line, unread pill, floating date or scroll-to-latest
//  button — the way Stream's
//  components context works, without a render-prop for every
//  detail. MessageList falls back to the kit's own where a slot
//  is empty.
//
//  Split into:
//
//    KitComponents   — the replaceable pieces
//    KitEnv          — what the context carries
//    ChatUiKitProvider — the host mounts it once
//    useKitTheme / useKitLabels / useKitEnv / useKitComponents
//                    — what components read
// -----------------------------------------------------------

import type { ComponentProps, ComponentType } from 'react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type ConversationIntro from '../list/ConversationIntro';
import type FloatingDay from '../list/FloatingDay';
import { defaultLabels, type KitLabels } from './labels';
import type ScrollToLatestButton from '../list/ScrollToLatestButton';
import type SystemMessage from '../message/SystemMessage';
import { defaultTheme, resolveTheme, type KitResolvedTheme, type KitTheme } from './theme';
import type TimeSeparator from '../list/TimeSeparator';
import type TypingBubble from '../list/TypingBubble';
import type UnreadPill from '../list/UnreadPill';
import type UnreadSeparator from '../list/UnreadSeparator';


export interface KitComponents {
  TimeSeparator: ComponentType<ComponentProps<typeof TimeSeparator>>;
  TypingBubble: ComponentType<ComponentProps<typeof TypingBubble>>;
  ConversationIntro: ComponentType<ComponentProps<typeof ConversationIntro>>;
  ScrollToLatestButton: ComponentType<ComponentProps<typeof ScrollToLatestButton>>;
  SystemMessage: ComponentType<ComponentProps<typeof SystemMessage>>;
  UnreadSeparator: ComponentType<ComponentProps<typeof UnreadSeparator>>;
  UnreadPill: ComponentType<ComponentProps<typeof UnreadPill>>;
  FloatingDay: ComponentType<ComponentProps<typeof FloatingDay>>;
}


export interface KitEnv {
  theme: KitResolvedTheme;
  // Host-swapped pieces; MessageList fills the gaps with its own
  components: Partial<KitComponents>;
  labels: KitLabels;
  // BCP-47 tag for the timeline's day/weekday labels
  locale: string;
  // Stored image reference (an upload path, a picker uri, an
  // absolute URL) → something expo-image can load, or null when
  // the reference is unusable
  resolveImageUrl: (path: string) => string | null;
  // ISO timestamp → the short time shown under a bubble
  formatTime: (iso: string) => string;
}


// The provider-less fallback
const fallbackFormatTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const defaultEnv: KitEnv = {
  theme: resolveTheme(defaultTheme),
  components: {},
  labels: defaultLabels.en,
  locale: 'en',
  resolveImageUrl: (path) => path || null,
  formatTime: fallbackFormatTime,
};

const KitContext = createContext<KitEnv>(defaultEnv);







// -----------------------------------------------------------
// ChatUiKitProvider
// -----------------------------------------------------------
//
// Every field is optional and falls back to the default env,
// so a host may start with just a theme. The value is memoised
// on its parts: the host should hand in stable objects (a
// memoised theme, labels built once per language) so a window
// of rows does not re-render on every host render.
//
// Used by:
//   - the host app, once, above its chat screens
// -----------------------------------------------------------

export function ChatUiKitProvider({
  theme,
  components,
  labels,
  locale,
  resolveImageUrl,
  formatTime,
  children,
}: Partial<Omit<KitEnv, 'theme'>> & { theme?: KitTheme; children: ReactNode }) {

  const resolvedTheme = useMemo(() => (theme ? resolveTheme(theme) : defaultEnv.theme), [theme]);

  const value = useMemo<KitEnv>(
    () => ({
      theme: resolvedTheme,
      components: components ?? defaultEnv.components,
      labels: labels ?? defaultEnv.labels,
      locale: locale ?? defaultEnv.locale,
      resolveImageUrl: resolveImageUrl ?? defaultEnv.resolveImageUrl,
      formatTime: formatTime ?? defaultEnv.formatTime,
    }),
    [resolvedTheme, components, labels, locale, resolveImageUrl, formatTime],
  );

  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}







// -----------------------------------------------------------
// useKitTheme / useKitLabels / useKitEnv
// -----------------------------------------------------------
//
// Used by:
//   - every kit component (theme), the kit roots (labels),
//     MessageBubble (env: image resolution, time formatting)
// -----------------------------------------------------------

export function useKitTheme(): KitResolvedTheme {
  return useContext(KitContext).theme;
}

export function useKitComponents(): Partial<KitComponents> {
  return useContext(KitContext).components;
}

export function useKitLabels(): KitLabels {
  return useContext(KitContext).labels;
}

export function useKitEnv(): KitEnv {
  return useContext(KitContext);
}
