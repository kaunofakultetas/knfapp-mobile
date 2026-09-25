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
//  here with ?thread=<id>, the param is consumed once per
//  navigation and the stored transcript loads, then the
//  runtime remounts on it (?thread=new resets to a fresh
//  chat). Session changes rebuild the chat: the transport
//  reads the stored token per request, and a login/logout
//  flips the session key the chat is keyed on. Deleting the
//  conversation that is on screen (from the history) resets
//  the tab to a fresh chat, and once a conversation is on
//  screen the header offers a "new conversation" door beside
//  the history one — no detour through the list to start
//  over.
//
//  The error strip's sentence is chosen from the CURRENT
//  thread's failure (useAssistantFailure, read under the
//  provider) — never a code left over from an older turn.
//  The header is the settings tab's non-collapsible pattern
//  — Header owns the brand status band and the notch inset,
//  the Screen shell keeps edges [] so nothing double-pads.
//  Every string the thread shows arrives from assistant.*
//  in i18n (Lithuanian first, as everywhere); colours map
//  from useTheme() tokens one to one and the kit draws in the
//  app's Raleway families. Links open through the system only
//  for web, mail and phone destinations: tool and model
//  markdown is data, and any other scheme must not reach
//  openURL.
//
//  Split into (root component last):
//
//    HeaderIconButton   — a 44pt icon door in the header
//    createChatTransport — one mount's transport + lazy thread
//    AssistantSurface   — the kit's thread, labelled from the
//                         live failure (under the provider)
//    AssistantChat      — one runtime over one thread, keyed
//    AssistantScreen    — param/thread state (default export)
// -----------------------------------------------------------

// Screen chrome
// The shipping gate — features.json decides whether this
// module renders or shows the not-ready screen
import withFeature from '@/components/FeatureGate';

import { Header, LoadingSpinner, Screen } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

// Session state and the API origin — the engine wants the
// ORIGIN, its fixed paths already carry /api
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';
import { API_BASE_URL } from '@/services/api/client';
import { getStoredToken } from '@/services/session';

// The thread store client — lazy creation, transcript loads
// and the delete announcements
import { createThread, fetchThreadMessages, onThreadDeleted } from '@/services/assistantThreads';

// The engine's wire pair, the provider it feeds and the
// thread's typed failure
import {
  AssistantRuntimeProvider,
  createKnfAssistantTransport,
  useAssistantFailure,
  useKnfAssistantRuntime,
} from '@knf/assistantengine';

// The chat surface and its host-facing types
import {
  AssistantThread,
  type AssistantColors,
  type AssistantFonts,
  type AssistantLabels,
  type AssistantSuggestion,
} from '@knf/assistantuikit';

// The three humanized tool cards and the error sentence
import { assistantErrorBody } from '@/components/assistant/errorCopy';
import { createAssistantToolCards } from '@/components/assistant/toolCards';

// Copy, link and haptic side effects the kit hands back
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

// Navigation params, i18n and memoization
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { TAB_BAR_CLEARANCE } from '@/components/navigation/tabBarCollapse';
import useKeyboardVisible from '@/hooks/useKeyboardVisible';


// The origin the transport appends its fixed paths to —
// API_BASE_URL carries '/api', the engine's paths carry it too
const ASSISTANT_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

// The client header's version tag
const CLIENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';

// The app's Raleway families on the kit's weight slots — one
// module constant, so the kit's context never sees a fresh
// object; code keeps the platform monospace
const KIT_FONTS: AssistantFonts = {
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semiBold,
  bold: fonts.bold,
};

// The destinations an answer's link may open: web pages, and
// the mail and phone apps for the contacts the handbook quotes
// (both only prefill — the student still sends or dials).
// Model output is data: javascript:, file:, intent: or another
// app's deep link never reaches openURL
const OPENABLE_LINK_RE = /^(https?:\/\/|mailto:|tel:)/i;

// A thread param must look like the uuid the server minted —
// anything else in a deep link is ignored, never fetched
const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;







// -----------------------------------------------------------
// HeaderIconButton
// -----------------------------------------------------------
//
// One of the Header's right-slot actions: a 44pt icon door —
// the conversation list, or a fresh conversation. Plain-object
// style on the Pressable, visuals on the inside — the
// css-interop Pressable rule.
//
// Used by:
//   - AssistantScreen (below) — Header right
// -----------------------------------------------------------

function HeaderIconButton({ icon, onPress, label }: {
  icon: 'time-outline' | 'create-outline';
  onPress: () => void;
  label: string;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={icon} size={24} color={colors.onBrand} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// createChatTransport
// -----------------------------------------------------------
//
//   createChatTransport({ threadId, signedIn, language,
//                         onThreadMinted }) → transport
//
// One chat mount's transport. The thread it persists into
// lives in this closure — the id it was opened on, or the
// one the FIRST send mints (guests land in the device
// registry through the service) and every later send reuses
// — so the lazy creation never touches React state (a state
// change would remount the stream it is serving) and nothing
// reads it during a render. The language is read per
// request, so a language switch reaches the next send.
//
// Used by:
//   - AssistantChat (below) — once per mount
// -----------------------------------------------------------

function createChatTransport({
  threadId,
  signedIn,
  language,
  onThreadMinted,
}: {
  threadId: string | null;
  signedIn: boolean;
  language: () => 'lt' | 'en';
  onThreadMinted: (threadId: string) => void;
}) {
  let current = threadId;
  return createKnfAssistantTransport({
    baseUrl: ASSISTANT_BASE_URL,
    getAuthToken: getStoredToken,
    language,
    clientVersion: CLIENT_VERSION,
    threadId: async () => {
      if (current) return current;
      const created = await createThread(language(), { signedIn });
      current = created.id;
      onThreadMinted(created.id);
      return created.id;
    },
  });
}







// -----------------------------------------------------------
// AssistantSurface
// -----------------------------------------------------------
//
// The kit's thread with everything the host decides: labels,
// palette, fonts, tool cards, starters and the side effects.
// It sits UNDER the runtime provider because the error
// sentence comes from useAssistantFailure — the failure of
// the run on screen right now, cleared by the upstream the
// moment a new run starts, so a 429 an hour ago can never
// caption a mid-stream fault now (KNF-087). Every object the
// kit receives is memoized on its real inputs (language,
// palette, failure): a fresh labels or colours object per
// render re-rendered every bubble on each keyboard toggle.
//
// Used by:
//   - AssistantChat (below) — inside AssistantRuntimeProvider
// -----------------------------------------------------------

function AssistantSurface() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const failure = useAssistantFailure();


  // All the kit's labels — the type is exhaustive, so a
  // missing key is a compile error, not a blank button
  const labels = useMemo<AssistantLabels>(
    () => ({
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
      errorBody: assistantErrorBody(failure, t),
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
    }),
    [t, failure],
  );


  // The kit paints from tokens, not classNames — its palette
  // keys all exist verbatim in ours, so the map is one to one
  // (brandText is the AA text hue of the brand, for links)
  const kitColors = useMemo<AssistantColors>(
    () => ({
      ink: colors.ink,
      inkSoft: colors.inkSoft,
      line: colors.line,
      brand: colors.brand,
      brandText: colors.brandText,
      onBrand: colors.onBrand,
      surface: colors.surface,
      surfaceSoft: colors.surfaceSoft,
      danger: colors.danger,
    }),
    [colors],
  );


  // The kit's tool registry: localized, iconed cards instead
  // of raw tool names, rebuilt only when the language or the
  // palette changes
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
    [t, kitColors],
  );


  // Three faculty starters for the empty state — each chip
  // sends its PROMPT, and shows it under the title too: a tap
  // that asks a whole question should say which one
  const suggestions = useMemo<AssistantSuggestion[]>(() => {
    const starter = (title: string, prompt: string) => ({ title, prompt, description: prompt });
    return [
      starter(t('assistant.suggestionScheduleTitle'), t('assistant.suggestionSchedulePrompt')),
      starter(t('assistant.suggestionNewsTitle'), t('assistant.suggestionNewsPrompt')),
      starter(t('assistant.suggestionHandbookTitle'), t('assistant.suggestionHandbookPrompt')),
    ];
  }, [t]);


  // The two haptic seams — a selection tick as the send press
  // lands (iOS, like the tab bar) and a light impact when the
  // answer settles, so eyes-off waiting has an end signal
  const handleComposerSend = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
  }, []);
  const handleAnswerSettled = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);


  // Markdown hrefs are model output — only web, mail and phone
  // destinations may leave the app; anything else is dropped
  const handlePressLink = useCallback((url: string) => {
    if (OPENABLE_LINK_RE.test(url.trim())) void Linking.openURL(url.trim());
  }, []);
  const copyToClipboard = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
  }, []);


  // NO onFeedback on purpose: Tomas dropped the thumbs row
  // from the app ("not needed", 2026-09) — the kit hides the
  // pair without a callback. Do not wire it back for the
  // admin's review list; that list reads ratings only if they
  // exist, and their absence is the decision
  return (
    <AssistantThread
      labels={labels}
      colors={kitColors}
      fonts={KIT_FONTS}
      tools={toolCards}
      suggestions={suggestions}
      copyToClipboard={copyToClipboard}
      onPressLink={handlePressLink}
      onComposerSend={handleComposerSend}
      onAnswerSettled={handleAnswerSettled}
    />
  );
}







// -----------------------------------------------------------
// AssistantChat
// -----------------------------------------------------------
//
// One runtime over one thread. The parent keys this
// component by session and thread id, so opening another
// conversation (or a login/logout) remounts the runtime
// cleanly — which is also why `signedIn` is a constant for a
// mount. The transport is created once per mount
// (createChatTransport — the lazily minted id lives in its
// closure, reported up through onThreadMinted so a delete
// from the history can recognise the conversation on
// screen). Memoized: the screen re-renders on every keyboard
// toggle, and nothing about the chat changes with it.
//
// Used by:
//   - AssistantScreen (below)
// -----------------------------------------------------------

const AssistantChat = memo(function AssistantChat({
  threadId,
  initialMessages,
  signedIn,
  onThreadMinted,
}: {
  // The stored thread this chat continues — null is a fresh
  // chat that mints its thread on the first send
  threadId: string | null;
  initialMessages?: unknown[];
  signedIn: boolean;
  onThreadMinted: (threadId: string) => void;
}) {

  const { i18n } = useTranslation();


  const [transport] = useState(() =>
    createChatTransport({
      threadId,
      signedIn,
      language: () => (i18n.language === 'en' ? 'en' : 'lt'),
      onThreadMinted,
    }),
  );
  const runtime = useKnfAssistantRuntime({ transport, initialMessages });


  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantSurface />
    </AssistantRuntimeProvider>
  );
});







// -----------------------------------------------------------
// AssistantScreen (default export)
// -----------------------------------------------------------
//
// Owns WHICH conversation is mounted. A session flip and a
// ?thread navigation are both read DURING render against the
// last value seen (React's "adjust state when a prop
// changes" pattern — no effect, no extra committed frame):
// the flip discards the mounted chat, 'new' resets to a
// fresh one, a uuid becomes the pending load. The load itself
// runs in an effect and writes state only when it answers;
// the chat stays mounted under the spinner overlay, and a
// load that fails is a toast over the conversation that was
// on screen. The nonce makes every history tap a distinct
// navigation, so re-opening the same thread works, while a
// mere re-focus of the tab replays nothing.
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
  // chats apart so "new conversation" really resets one.
  // `pending` is the transcript a navigation asked for, while
  // it loads
  const [active, setActive] = useState<{ id: string; messages: unknown[] } | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [pending, setPending] = useState<{ id: string; stamp: string } | null>(null);


  // The server thread the mounted chat writes into — the
  // loaded one, or the one its first send minted. Written
  // only from callbacks; the delete listener reads it
  const mountedThreadRef = useRef<string | null>(null);


  // Whether a fresh chat has sent anything yet — the header's
  // "new conversation" door shows only when there is one to
  // leave (a loaded thread always is)
  const [freshChatStarted, setFreshChatStarted] = useState(false);


  // Back to a fresh chat — the same reset "new" from the
  // history screen performs
  const startNewChat = useCallback(() => {
    setActive(null);
    setPending(null);
    setFreshChatStarted(false);
    setEpoch((count) => count + 1);
  }, []);


  // A session flip discards whatever conversation was mounted
  const [seenSession, setSeenSession] = useState(sessionKey);
  if (seenSession !== sessionKey) {
    setSeenSession(sessionKey);
    setActive(null);
    setPending(null);
    setFreshChatStarted(false);
    setEpoch((count) => count + 1);
  }


  // The ?thread param, consumed once per NAVIGATION stamp
  const stamp = threadParam ? `${threadParam}:${nonceParam ?? ''}` : undefined;
  const [seenStamp, setSeenStamp] = useState<string | undefined>(undefined);
  if (stamp !== undefined && stamp !== seenStamp) {
    setSeenStamp(stamp);
    if (threadParam === 'new') {
      setActive(null);
      setPending(null);
      setFreshChatStarted(false);
      setEpoch((count) => count + 1);
    } else if (threadParam && THREAD_ID_RE.test(threadParam)) {
      setPending({ id: threadParam, stamp });
    }
  }


  // The transcript load for the pending navigation. The
  // CURRENT conversation stays mounted meanwhile — a
  // transcript that cannot load (offline, pruned, foreign) is
  // a toast, never a silent swap to an empty chat
  useEffect(() => {
    if (!pending) return undefined;
    let cancelled = false;
    fetchThreadMessages(pending.id)
      .then((stored) => {
        if (!cancelled) setActive({ id: pending.id, messages: stored.map((row) => row.content) });
      })
      .catch(() => {
        if (!cancelled) showToast('error', t('assistant.threadsError'));
      })
      .finally(() => {
        if (!cancelled) setPending((was) => (was === pending ? null : was));
      });
    return () => {
      cancelled = true;
    };
  }, [pending, t]);


  // A fresh chat's first send minted its thread — remember it
  // for the delete listener below, and offer "new" from now on
  // (the chat is memoized on props this does not touch, so the
  // stream it is serving never remounts)
  const handleThreadMinted = useCallback((threadId: string) => {
    mountedThreadRef.current = threadId;
    setFreshChatStarted(true);
  }, []);


  // The conversation on screen was deleted from the history —
  // it leaves the tab (its thread id would 404 every send)
  useEffect(
    () =>
      onThreadDeleted((threadId) => {
        if (threadId !== mountedThreadRef.current) return;
        mountedThreadRef.current = null;
        setActive(null);
        setFreshChatStarted(false);
        setEpoch((count) => count + 1);
      }),
    [],
  );


  // A remount starts a fresh chat or a loaded one — the ref
  // follows it, so an old thread's delete cannot reset a new
  // conversation
  const chatKey = `${sessionKey}:${active ? active.id : `new-${epoch}`}`;
  useEffect(() => {
    mountedThreadRef.current = active?.id ?? null;
  }, [chatKey, active]);


  return (
    <Screen>
      <Header
        title={t('assistant.title')}
        right={
          <View style={{ flexDirection: 'row' }}>
            {active || freshChatStarted ? (
              <HeaderIconButton icon="create-outline" label={t('assistant.threadsNew')} onPress={startNewChat} />
            ) : null}
            <HeaderIconButton
              icon="time-outline"
              label={t('assistant.threadsOpen')}
              onPress={() => router.push('/(main)/assistant-threads')}
            />
          </View>
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
          key={chatKey}
          threadId={active?.id ?? null}
          initialMessages={active?.messages}
          signedIn={isAuthenticated}
          onThreadMinted={handleThreadMinted}
        />
        {pending ? (
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
