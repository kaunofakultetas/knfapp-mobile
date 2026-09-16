// -----------------------------------------------------------
//  [*] Tabs — AI assistant
//
//  The faculty chat surface: the kit's AssistantThread under
//  the burgundy header, running on the WIRE — the engine's
//  transport into the assistant container
//  (/api/assistant/chat), with the three container-side
//  tools streaming their cards back. The stub adapter this
//  screen was born on is gone; everything below the
//  provider stayed as it was.
//
//  Conversations persist server-side. The transport's
//  threadId resolver is the lazy seam: the first send of a
//  fresh chat mints a thread through the threads service
//  (guests keep the uuid in the device registry) and every
//  later send reuses it via a ref — never state, so the
//  running stream is not remounted by its own first send.
//  The header's history button pushes
//  /(main)/assistant-threads; picking a row navigates back
//  here with ?thread=<id>, a param effect loads the stored
//  transcript and remounts the runtime on it (?thread=new
//  resets to a fresh chat). Session changes rebuild the
//  chat: the transport reads the stored token per request,
//  and a login/logout flips isAuthenticated, which the
//  resolver reads for registry bookkeeping.
//
//  The header is the settings tab's non-collapsible pattern
//  — Header owns the brand status band and the notch inset,
//  the Screen shell keeps edges [] so nothing double-pads.
//  Every string the thread shows arrives from assistant.*
//  in i18n (Lithuanian first, as everywhere); colours map
//  from useTheme() tokens one to one. Links open through
//  the system only for http(s) destinations: tool and model
//  markdown is data, and a non-web scheme must not reach
//  openURL.
//
//  Split into (root component last):
//
//    HistoryButton   — the header's door to the thread list
//    AssistantChat   — one runtime over one thread, keyed
//    AssistantScreen — param/thread state (default export)
// -----------------------------------------------------------

// Screen chrome
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import { Header, LoadingSpinner, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Session state and the API origin — the engine wants the
// ORIGIN, its fixed paths already carry /api
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { API_BASE_URL } from '@/services/api/client';
import { getStoredToken } from '@/services/session';

// The thread store client — lazy creation + transcript loads
import { createThread, fetchThreadMessages } from '@/services/assistantThreads';

// The engine's wire pair and the provider it feeds
import {
  AssistantRuntimeProvider,
  createKnfAssistantTransport,
  useKnfAssistantRuntime,
} from '@knf/assistantengine';

// The chat surface and its host-facing types
import {
  AssistantThread,
  type AssistantColors,
  type AssistantLabels,
  type AssistantSuggestion,
} from '@knf/assistantuikit';

// The three humanized tool cards for the kit's registry
import { createAssistantToolCards } from '@/components/assistant/toolCards';

// Copy, link and haptic side effects the kit hands back
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

// Navigation params, i18n and memoization
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { TAB_BAR_CLEARANCE } from '@/components/navigation/tabBarCollapse';
import useKeyboardVisible from '@/hooks/useKeyboardVisible';


// The origin the transport appends its fixed paths to —
// API_BASE_URL carries '/api', the engine's paths carry it too
const ASSISTANT_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// The client header's version tag
const CLIENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';







// -----------------------------------------------------------
// HistoryButton
// -----------------------------------------------------------
//
// The Header's right-slot action: a 44pt door to the
// conversation list. Plain-object style on the Pressable,
// visuals on the inside — the css-interop Pressable rule.
//
// Used by:
//   - AssistantScreen (below) — Header right
// -----------------------------------------------------------

function HistoryButton({ onPress, label }: { onPress: () => void; label: string }) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="time-outline" size={24} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// AssistantChat
// -----------------------------------------------------------
//
// One runtime over one thread. The parent keys this
// component by thread id, so opening another conversation
// remounts the runtime cleanly; the threadId ref carries
// the lazily minted id WITHIN a mount without triggering
// one. The transport is created once per mount — its token,
// language and thread resolvers all read live refs or
// stores, so nothing about it goes stale.
//
// Used by:
//   - AssistantScreen (below)
// -----------------------------------------------------------

function AssistantChat({
  threadId,
  initialMessages,
  signedIn,
}: {
  // The stored thread this chat continues — null is a fresh
  // chat that mints its thread on the first send
  threadId: string | null;
  initialMessages?: unknown[];
  signedIn: boolean;
}) {

  const { t, i18n } = useTranslation();
  const { colors } = useTheme();


  // The lazily minted thread rides a REF: the first send's
  // creation must not remount the runtime mid-stream
  const threadRef = useRef<string | null>(threadId);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;


  // The last transport failure's code drives WHICH error body
  // the banner shows — a 429 must not read as a network problem
  const [failureCode, setFailureCode] = useState<string | null>(null);


  const transport = useMemo(
    () =>
      createKnfAssistantTransport({
        baseUrl: ASSISTANT_BASE_URL,
        getAuthToken: getStoredToken,
        language: () => (i18n.language === 'en' ? 'en' : 'lt'),
        clientVersion: CLIENT_VERSION,
        onFailure: (failure) => setFailureCode(failure.code),
        threadId: async () => {
          if (threadRef.current) return threadRef.current;
          const created = await createThread(i18n.language === 'en' ? 'en' : 'lt', {
            signedIn: signedInRef.current,
          });
          threadRef.current = created.id;
          return created.id;
        },
      }),
    [i18n],
  );
  const runtime = useKnfAssistantRuntime({ transport, initialMessages });


  // The two haptic seams — a selection tick as the send press
  // lands (iOS, like the tab bar) and a light impact when the
  // answer settles, so eyes-off waiting has an end signal
  const handleComposerSend = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
  }, []);
  const handleAnswerSettled = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);


  // All the kit's labels — the type is exhaustive, so a
  // missing key is a compile error, not a blank button
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
    errorBody: t(
      failureCode === 'auth' ? 'assistant.errorAuth'
      : failureCode === 'quota' ? 'assistant.errorQuota'
      : failureCode === 'unavailable' ? 'assistant.errorUnavailable'
      : 'assistant.errorBody',
    ),
    toolRunning: t('assistant.toolRunning'),
    toolDone: t('assistant.toolDone'),
    toolFailed: t('assistant.toolFailed'),
    showDetails: t('assistant.showDetails'),
    hideDetails: t('assistant.hideDetails'),
    previousBranch: t('assistant.previousBranch'),
    nextBranch: t('assistant.nextBranch'),
    scrollToLatest: t('assistant.scrollToLatest'),
    sourcesTitle: t('assistant.sourcesTitle'),
    feedbackUp: t('assistant.feedbackUp'),
    feedbackDown: t('assistant.feedbackDown'),
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


  // The kit's tool registry: localized, iconed cards instead
  // of raw tool names — rebuilt per render straight off i18n
  // and the theme, the kit memoizes on the object identity
  const toolCards = useMemo(
    () =>
      createAssistantToolCards(
        {
          scheduleRunning: t('assistant.toolScheduleRunning'),
          scheduleDone: t('assistant.toolScheduleDone'),
          newsRunning: t('assistant.toolNewsRunning'),
          newsDone: t('assistant.toolNewsDone'),
          handbookRunning: t('assistant.toolHandbookRunning'),
          handbookDone: t('assistant.toolHandbookDone'),
          failed: t('assistant.toolFailed'),
          week: t('assistant.toolWeek'),
          day: t('assistant.toolDay'),
        },
        kitColors,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kitColors is rebuilt per render by design; t and the palette values are the real inputs
    [t, colors],
  );



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
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantThread
        labels={labels}
        colors={kitColors}
        tools={toolCards}
        suggestions={suggestions}
        copyToClipboard={async (text) => {
          await Clipboard.setStringAsync(text);
        }}
        onPressLink={handlePressLink}
        onComposerSend={handleComposerSend}
        onAnswerSettled={handleAnswerSettled}
      />
    </AssistantRuntimeProvider>
  );
}







// -----------------------------------------------------------
// AssistantScreen (default export)
// -----------------------------------------------------------
//
// Owns WHICH conversation is mounted: the ?thread param
// (set by the history screen) is consumed by an effect —
// 'new' resets to a fresh chat, a uuid loads its stored
// transcript and remounts AssistantChat keyed on it. The
// param is processed once per change; the transcript load
// shows the spinner in place of the thread, and a load that
// fails falls back to a fresh chat rather than a dead tab.
//
// Used by:
//   - expo-router — the assistant tab of (main)/tabs
// -----------------------------------------------------------

function AssistantScreen() {

  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const { thread: threadParam, n: nonceParam } = useLocalSearchParams<{ thread?: string; n?: string }>();

  // One value naming the session — part of the chat's remount
  // key AND the reset trigger, so a login/logout never leaves
  // the previous identity's conversation mounted (or a stale
  // threadRef 404-ing every further send)
  const sessionKey = isAuthenticated ? (user?.id ?? 'user') : 'guest';


  // Whether the keyboard is up — the composer's chip clearance
  // applies only while it is down (see the render note)
  const keyboardUp = useKeyboardVisible();


  // The mounted conversation: a stored one carries its
  // transcript; null is a fresh chat. `epoch` keys fresh
  // chats apart so "new conversation" really resets one
  const [active, setActive] = useState<{ id: string; messages: unknown[] } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [loadingThread, setLoadingThread] = useState(false);


  // A session flip discards whatever conversation was mounted
  // — the previous identity's transcript must not stay on
  // screen, and its thread id must not poison further sends
  const sessionSeenRef = useRef(sessionKey);
  useEffect(() => {
    if (sessionSeenRef.current === sessionKey) return;
    sessionSeenRef.current = sessionKey;
    setActive(null);
    setEpoch((count) => count + 1);
  }, [sessionKey]);


  // Consume the ?thread param once per NAVIGATION — the nonce
  // makes every history-screen tap a distinct value, so
  // re-opening the same thread (or "new" twice) works, while
  // a mere re-focus of the tab replays nothing
  const consumedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const stamp = threadParam ? `${threadParam}:${nonceParam ?? ''}` : undefined;
    if (!threadParam || !stamp || consumedRef.current === stamp) return;
    consumedRef.current = stamp;

    if (threadParam === 'new') {
      setActive(null);
      setEpoch((count) => count + 1);
      return;
    }

    let cancelled = false;
    setLoadingThread(true);
    fetchThreadMessages(threadParam)
      .then((stored) => {
        if (cancelled) return;
        setActive({ id: threadParam, messages: stored.map((row) => row.content) });
      })
      .catch(() => {
        // The CURRENT conversation stays mounted — a transcript
        // that cannot load (offline, pruned, foreign) is a
        // toast, never a silent swap to an empty chat
        if (!cancelled) showToast('error', t('assistant.threadsError'));
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable enough for a toast; the params pair is the real trigger
  }, [threadParam, nonceParam]);


  return (
    <Screen>
      <Header
        title={t('assistant.title')}
        right={
          <HistoryButton
            label={t('assistant.threadsOpen')}
            onPress={() => router.push('/(main)/assistant-threads')}
          />
        }
      />

      {/* The chat stays mounted while a transcript loads — the
          spinner is an overlay, so a failed open never destroys
          the conversation that was on screen. The bottom pad
          lifts the composer above the floating tab chip — but
          only while the keyboard is down: an open keyboard
          covers the chip's zone itself, and the pad would sit
          as a dead band between composer and keys */}
      <View style={{ flex: 1, paddingBottom: keyboardUp ? 0 : TAB_BAR_CLEARANCE - 20 }}>
        <AssistantChat
          key={`${sessionKey}:${active ? active.id : `new-${epoch}`}`}
          threadId={active?.id ?? null}
          initialMessages={active?.messages}
          signedIn={isAuthenticated}
        />
        {loadingThread ? (
          <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                     alignItems: 'center', justifyContent: 'center' }}
            pointerEvents="auto"
          >
            <LoadingSpinner />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}


// The gate wraps the export, so a disabled module's tab
// screen never mounts even on a direct navigation
export default withFeature('assistant', AssistantScreen);
