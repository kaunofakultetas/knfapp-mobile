// -----------------------------------------------------------
//  [*] Tabs — AI assistant
//
//  The faculty chat surface: the kit's AssistantThread under
//  the burgundy header, running on the engine's LOCAL runtime
//  over services/assistantStub — the pre-container stand-in
//  that streams prepared faculty replies word by word. The
//  follow-up is known and single: once the AI container
//  exists, the stub adapter gives way to
//  createKnfAssistantTransport + useKnfAssistantRuntime and
//  everything below the provider stays as it is.
//
//  The header is the settings tab's non-collapsible pattern —
//  Header owns the brand status band and the notch inset, the
//  Screen shell keeps edges [] so nothing double-pads. The
//  thread is the whole body: its own keyboard column reads the
//  frame under the header, and the bar below is the regular
//  (non-floating) tab bar, so no extra bottom padding is owed.
//
//  Every string the thread shows arrives from assistant.* in
//  i18n (Lithuanian first, as everywhere); colours map from
//  useTheme() tokens one to one — the kit's palette keys are a
//  subset of ours. Links open through the system only for
//  http(s) destinations: the stub's markdown is data, and a
//  non-web scheme from a future model must not reach openURL.
//  No tools prop — the stub streams text alone, so the tool
//  cards would never render.
// -----------------------------------------------------------

// Screen chrome
import { Header, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// The stand-in model and the engine's local-runtime door
import { createAssistantStubAdapter } from '@/services/assistantStub';
import { AssistantRuntimeProvider, useLocalRuntime } from '@knf/assistantengine';

// The chat surface and its host-facing types
import {
  AssistantThread,
  type AssistantColors,
  type AssistantLabels,
  type AssistantSuggestion,
} from '@knf/assistantuikit';

// Copy and link side effects the kit hands back to the host
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

// i18n and memoization
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';




// -----------------------------------------------------------
// AssistantScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - expo-router — the assistant tab of (main)/tabs
// -----------------------------------------------------------

export default function AssistantScreen() {

  const { t, i18n } = useTranslation();
  const { colors } = useTheme();


  // One adapter for the screen's lifetime — the language is a
  // callback read on every run, so a mid-session language flip
  // answers in the new language without remounting the runtime
  const adapter = useMemo(
    () => createAssistantStubAdapter({ language: () => (i18n.language === 'en' ? 'en' : 'lt') }),
    [i18n],
  );
  const runtime = useLocalRuntime(adapter);


  // All twenty of the kit's labels — the type is exhaustive,
  // so a missing key is a compile error, not a blank button
  const labels: AssistantLabels = {
    placeholder: t('assistant.placeholder'),
    send: t('assistant.send'),
    cancel: t('assistant.cancel'),
    retry: t('assistant.retry'),
    copy: t('assistant.copy'),
    copied: t('assistant.copied'),
    regenerate: t('assistant.regenerate'),
    thinking: t('assistant.thinking'),
    emptyTitle: t('assistant.emptyTitle'),
    emptyBody: t('assistant.emptyBody'),
    errorTitle: t('assistant.errorTitle'),
    errorBody: t('assistant.errorBody'),
    toolRunning: t('assistant.toolRunning'),
    toolDone: t('assistant.toolDone'),
    toolFailed: t('assistant.toolFailed'),
    showDetails: t('assistant.showDetails'),
    hideDetails: t('assistant.hideDetails'),
    previousBranch: t('assistant.previousBranch'),
    nextBranch: t('assistant.nextBranch'),
    scrollToLatest: t('assistant.scrollToLatest'),
  };


  // The kit paints from tokens, not classNames — its palette
  // keys all exist verbatim in ours, so the map is one to one
  const kitColors: AssistantColors = {
    ink: colors.ink,
    inkSoft: colors.inkSoft,
    line: colors.line,
    brand: colors.brand,
    onBrand: colors.onBrand,
    surface: colors.surface,
    surfaceSoft: colors.surfaceSoft,
    danger: colors.danger,
  };


  // Three faculty starters for the empty state — each chip
  // sends its PROMPT, the title is only what the chip shows
  const suggestions: AssistantSuggestion[] = [
    { title: t('assistant.suggestionScheduleTitle'), prompt: t('assistant.suggestionSchedulePrompt') },
    { title: t('assistant.suggestionNewsTitle'), prompt: t('assistant.suggestionNewsPrompt') },
    { title: t('assistant.suggestionHandbookTitle'), prompt: t('assistant.suggestionHandbookPrompt') },
  ];


  // Markdown hrefs are model output — only web destinations may
  // leave the app; anything else is silently dropped
  const handlePressLink = (url: string) => {
    if (/^https?:\/\//i.test(url)) void Linking.openURL(url);
  };


  return (
    <Screen>
      <Header title={t('assistant.title')} />

      <AssistantRuntimeProvider runtime={runtime}>
        <AssistantThread
          labels={labels}
          colors={kitColors}
          suggestions={suggestions}
          copyToClipboard={async (text) => {
            await Clipboard.setStringAsync(text);
          }}
          onPressLink={handlePressLink}
        />
      </AssistantRuntimeProvider>
    </Screen>
  );
}
