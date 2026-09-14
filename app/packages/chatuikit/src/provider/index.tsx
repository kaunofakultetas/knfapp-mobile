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
//  button — a components context, without a render-prop for every
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

import type { KitMessage } from '../core/types';

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







// -----------------------------------------------------------
// KitComponents
// -----------------------------------------------------------
//
// The replaceable pieces: MessageList falls back to the kit's
// own component wherever a slot is empty, so a host overrides
// one detail without forking the list.
//
// Used by:
//   - KitEnv (below) — the `components` field
//   - list/MessageList.tsx / message/MessageBubble.tsx — read
//     the slots through useKitComponents
// -----------------------------------------------------------

export interface KitComponents {
  // The list with nothing in it (default: a centred labels.emptyChat)
  EmptyState: ComponentType<{ label: string }>;
  // The body of a `kind: 'custom'` message — a poll, a map, a
  // card…; without it such a message renders the unsupported
  // placeholder. Receives the message and the bubble's ink
  MessageBody: ComponentType<{ message: KitMessage; own: boolean; color: string }>;
  TimeSeparator: ComponentType<ComponentProps<typeof TimeSeparator>>;
  TypingBubble: ComponentType<ComponentProps<typeof TypingBubble>>;
  ConversationIntro: ComponentType<ComponentProps<typeof ConversationIntro>>;
  ScrollToLatestButton: ComponentType<ComponentProps<typeof ScrollToLatestButton>>;
  SystemMessage: ComponentType<ComponentProps<typeof SystemMessage>>;
  UnreadSeparator: ComponentType<ComponentProps<typeof UnreadSeparator>>;
  UnreadPill: ComponentType<ComponentProps<typeof UnreadPill>>;
  FloatingDay: ComponentType<ComponentProps<typeof FloatingDay>>;
}







// -----------------------------------------------------------
// KitEnv
// -----------------------------------------------------------
//
// What the context carries: the resolved theme, the labels,
// the locale, the host's component overrides and the two host
// functions the kit cannot supply itself.
//
// Used by:
//   - ChatUiKitProvider (below) — builds it
//   - useKitEnv (below) — hands it to MessageBubble
// -----------------------------------------------------------

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







// What the hooks answer with no provider mounted — neutral
// theme, English labels, identity URL resolver, plain HH:MM —
// so tests and demos need no ceremony
const defaultEnv: KitEnv = {
  theme: resolveTheme(defaultTheme),
  components: {},
  labels: defaultLabels.en,
  locale: 'en',
  resolveImageUrl: (path) => path || null,
  formatTime: fallbackFormatTime,
};

// The one context the whole kit reads — private so hosts go
// through ChatUiKitProvider and the hooks, never the raw object
const KitContext = createContext<KitEnv>(defaultEnv);







// -----------------------------------------------------------
// fallbackFormatTime
// -----------------------------------------------------------
//
// The provider-less fallback — a plain HH:MM in the device
// zone, the unparseable stamp echoed back untouched. A hoisted
// `function` declaration on purpose: defaultEnv (above) reads
// it at module init, and the data consts sit at the top per
// const-order.
//
// Used by:
//   - defaultEnv (above)
// -----------------------------------------------------------

function fallbackFormatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}







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
}: Partial<Omit<KitEnv, 'theme' | 'labels'>> & { theme?: KitTheme; labels?: Partial<KitLabels>; children: ReactNode }) {

  const resolvedTheme = useMemo(() => (theme ? resolveTheme(theme) : defaultEnv.theme), [theme]);

  // A partial labels object is merged over the kit's own set for
  // the locale — a host overrides three strings, not fifty
  const resolvedLabels = useMemo<KitLabels>(() => {
    const base = (locale ?? defaultEnv.locale).toLowerCase().startsWith('lt') ? defaultLabels.lt : defaultLabels.en;
    return labels ? { ...base, ...labels } : base;
  }, [labels, locale]);

  const value = useMemo<KitEnv>(
    () => ({
      theme: resolvedTheme,
      components: components ?? defaultEnv.components,
      labels: resolvedLabels,
      locale: locale ?? defaultEnv.locale,
      resolveImageUrl: resolveImageUrl ?? defaultEnv.resolveImageUrl,
      formatTime: formatTime ?? defaultEnv.formatTime,
    }),
    [resolvedTheme, components, resolvedLabels, locale, resolveImageUrl, formatTime],
  );

  return <KitContext.Provider value={value}>{children}</KitContext.Provider>;
}







// -----------------------------------------------------------
// useKitTheme
// -----------------------------------------------------------
//
// The resolved theme — palette, fonts and text styles ready
// to spread into styles; with no provider mounted it answers
// resolveTheme(defaultTheme).
//
// Used by:
//   - every kit component — the resolved theme
// -----------------------------------------------------------

export function useKitTheme(): KitResolvedTheme {
  return useContext(KitContext).theme;
}







// -----------------------------------------------------------
// useKitComponents
// -----------------------------------------------------------
//
// The host's slot overrides, deliberately Partial — readers
// fill each empty slot with the kit's own piece; with no
// provider mounted every slot is empty.
//
// Used by:
//   - MessageList / MessageBubble — the host's override slots
// -----------------------------------------------------------

export function useKitComponents(): Partial<KitComponents> {
  return useContext(KitContext).components;
}







// -----------------------------------------------------------
// useKitLabels
// -----------------------------------------------------------
//
// The full label set, already merged for the provider's
// locale — no per-string fallbacks needed downstream; with
// no provider mounted, the English defaults.
//
// Used by:
//   - the kit roots — the merged label set for the locale
// -----------------------------------------------------------

export function useKitLabels(): KitLabels {
  return useContext(KitContext).labels;
}







// -----------------------------------------------------------
// useKitEnv
// -----------------------------------------------------------
//
// The whole env in one read — for pieces that need the host
// functions (resolveImageUrl, formatTime) beside the theme;
// with no provider mounted it answers defaultEnv: identity
// URL resolver, plain HH:MM times, English labels.
//
// Used by:
//   - MessageBubble — image resolution and time formatting,
//     the whole env in one read
// -----------------------------------------------------------

export function useKitEnv(): KitEnv {
  return useContext(KitContext);
}
