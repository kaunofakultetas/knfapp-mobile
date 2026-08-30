// -----------------------------------------------------------
//  [*] News — PollWidget
//
//  The poll block embedded under a poll-type post: question,
//  votable options with result bars, and a status row. Renders
//  nothing while the poll is loading or when the post simply
//  has no poll (fetchPoll resolves null only for a 404); a real
//  load failure shows a compact retry row instead of silently
//  dropping the poll from the post.
//
//  Voting is optimistic: the tapped option is marked and the
//  tallies shift immediately, the server response then replaces
//  the guess — or the previous state is restored with an error
//  toast. Re-tapping the already-chosen option is a no-op;
//  tapping a different one changes the vote.
//
//  Results are visible to everyone — voters, logged-out
//  viewers (with a "log in to vote" hint) and closed polls
//  (endDate in the past locks voting). Only an authenticated
//  viewer of an open poll can tap.
//
//  The fetch effect is keyed on postId AND isAuthenticated, so
//  logging in while the widget is mounted refetches and picks
//  up the user's own vote; a cancelled flag drops out-of-order
//  answers when a recycled feed cell switches posts.
//
//  The parent owns horizontal padding — the widget only adds
//  its own top margin.
//
//  Split into (root component last):
//
//    applyVote     — optimistic local vote transition
//    PollLoadError — compact failure row with retry
//    PollHint      — small icon + text status row
//    PollOptionRow — one option with its result bar
//    PollWidget    — fetch + vote state (default export)
// -----------------------------------------------------------

// Auth gates voting and keys the refetch-on-login effect
import { useAuth } from '@/context/AuthContext';

// Poll endpoints and the app-wide error toast
import { fetchPoll, votePollApi, type PollResponse } from '@/services/api';
import { showToast } from '@/context/NetworkContext';

// Zoneless backend timestamps parsed as the UTC they are
import { parseIso } from '@/services/format';

// Icons and JS-side colors for the active scheme
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

// Widget state and primitives
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  GestureResponderEvent,
  Pressable,
  Text,
  View,
} from 'react-native';







// -----------------------------------------------------------
// applyVote
// -----------------------------------------------------------
//
// Pure optimistic transition: the tapped option gains a vote,
// a previously chosen option loses one, and the total only
// grows for a first-time voter — mirroring what the backend
// will answer so the later authoritative swap is invisible.
//
// Used by:
//   - PollWidget (below) — the optimistic half of handleVote
// -----------------------------------------------------------

function applyVote(poll: PollResponse, optionId: string): PollResponse {

  const previousVote = poll.userVote;


  return {
    ...poll,
    userVote: optionId,
    totalVotes: previousVote ? poll.totalVotes : poll.totalVotes + 1,
    options: poll.options.map((option) => {
      if (option.id === optionId) return { ...option, votes: option.votes + 1 };
      if (option.id === previousVote) return { ...option, votes: Math.max(0, option.votes - 1) };
      return option;
    }),
  };
}







// -----------------------------------------------------------
// PollLoadError
// -----------------------------------------------------------
//
// Shown when fetchPoll REJECTED (network/server error) — a 404
// means "no poll" and renders nothing instead. Compact on
// purpose: this sits inside a news card, not on a full screen.
//
// Used by:
//   - PollWidget (below)
// -----------------------------------------------------------

function PollLoadError({ onRetry }: { onRetry: () => void }) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      className="mt-sm min-h-12 flex-row items-center gap-sm rounded-md bg-danger-soft px-md py-sm"
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={t('common.tryAgain')}
    >
      <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
      <Text className="flex-1 font-raleway text-sm text-danger">{t('news.pollLoadError')}</Text>
      <Ionicons name="refresh" size={18} color={colors.danger} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// PollHint
// -----------------------------------------------------------
//
// One-line status under the options: the closed-poll lock or
// the log-in-to-vote invitation.
//
// Used by:
//   - PollWidget (below)
// -----------------------------------------------------------

function PollHint({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {

  const { colors } = useTheme();


  return (
    <View className="mb-xs flex-row items-center gap-xs">
      {/* Decorative icon — hidden from assistive tech */}
      <Ionicons
        name={icon}
        size={14}
        color={colors.inkSoft}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text className="font-raleway text-xs text-ink-soft">{text}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// PollOptionRow
// -----------------------------------------------------------
//
// One option: a surface-soft pill with an absolute result bar
// behind the label (brand-soft when it is the viewer's choice,
// line otherwise). While this row's vote is in flight the
// percentage slot shows a spinner; `busy` keeps a second tap
// on ANY row from starting a parallel vote.
//
// Used by:
//   - PollWidget (below)
// -----------------------------------------------------------

interface PollOptionRowProps {
  text: string;
  pct: number;
  selected: boolean;
  showResults: boolean;
  canVote: boolean;
  inFlight: boolean;
  busy: boolean;
  onPress: () => void;
}

function PollOptionRow({
  text,
  pct,
  selected,
  showResults,
  canVote,
  inFlight,
  busy,
  onPress,
}: PollOptionRowProps) {

  const { colors } = useTheme();


  return (
    <Pressable
      className={`relative mb-sm min-h-12 overflow-hidden rounded-md border bg-surface-soft ${
        selected ? 'border-brand' : 'border-line'
      }`}
      onPress={(event: GestureResponderEvent) => {
        // A vote inside a feed card must not also open the post
        // (touches bubble on react-native-web)
        event.stopPropagation();
        onPress();
      }}
      disabled={!canVote || busy}
      accessibilityRole="radio"
      accessibilityLabel={showResults ? `${text}, ${pct}%` : text}
      accessibilityState={{ checked: selected, disabled: !canVote || busy }}
    >

      {/* Result bar — behind the label, width is the vote share;
          the brand / line-strong end cap keeps the bar's extent
          readable at 3:1 where the soft wash alone is not */}
      {showResults && pct > 0 && (
        <View
          className={`absolute bottom-0 left-0 top-0 border-r-2 ${
            selected ? 'border-brand bg-brand-soft' : 'border-line-strong bg-line'
          }`}
          style={{ width: `${pct}%` }}
        />
      )}

      <View className="min-h-12 flex-row items-center justify-between gap-sm px-md py-sm">

        <Text
          className={`flex-1 text-sm ${
            selected ? 'font-raleway-bold text-brand-text' : 'font-raleway-medium text-ink'
          }`}
        >
          {text}
        </Text>

        {inFlight ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : showResults ? (
          <View className="flex-row items-center gap-xs">
            {selected && <Ionicons name="checkmark-circle" size={16} color={colors.brand} />}
            <Text
              className={`text-sm ${
                selected ? 'font-raleway-bold text-brand-text' : 'font-raleway text-ink-soft'
              }`}
            >
              {pct}%
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// PollWidget (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/news/NewsCard.tsx — poll posts in the feed
//   - app/(main)/news-post/index.tsx — the post detail screen
// -----------------------------------------------------------

export default function PollWidget({ postId }: { postId: string }) {

  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();


  const [poll, setPoll] = useState<PollResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);


  // Which option's vote is on the wire — drives that row's
  // spinner and blocks parallel votes
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);


  // The ref is the real double-vote guard — two taps can land
  // before the state above re-renders, the ref flips
  // synchronously
  const votingRef = useRef(false);


  // Keyed on isAuthenticated too: logging in while mounted
  // refetches so the user's own vote appears. The cancelled
  // flag drops out-of-order answers from recycled feed cells.
  useEffect(() => {
    let cancelled = false;

    setFailed(false);
    // A recycled cell must not show the previous post's poll
    // while the new one loads; a same-post refetch keeps it
    setPoll((current) => (current && current.postId === postId ? current : null));

    fetchPoll(postId)
      .then((result) => {
        if (!cancelled) setPoll(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [postId, isAuthenticated, reloadKey]);


  // Optimistic vote with exact revert; every write is guarded
  // against the cell having switched posts mid-flight
  const handleVote = async (optionId: string) => {
    if (votingRef.current) return;
    if (!poll || votingOptionId) return;
    if (poll.userVote === optionId) return;

    const previous = poll;
    votingRef.current = true;
    setVotingOptionId(optionId);
    setPoll((current) =>
      current && current.postId === postId ? applyVote(current, optionId) : current,
    );

    try {
      const confirmed = await votePollApi(previous.postId, optionId);
      setPoll((current) =>
        current && current.postId === confirmed.postId ? confirmed : current,
      );
    } catch {
      setPoll((current) =>
        current && current.postId === previous.postId ? previous : current,
      );
      showToast('error', t('news.pollVoteError'));
    } finally {
      votingRef.current = false;
      setVotingOptionId(null);
    }
  };


  if (failed && !poll) {
    return <PollLoadError onRetry={() => setReloadKey((key) => key + 1)} />;
  }


  // Loading, or the post has no poll (fetchPoll's 404 → null)
  if (!poll) return null;


  // Backend endDate is naive UTC — parseIso marks it UTC before
  // parsing, so a poll doesn't lock a UTC-offset early
  const end = poll.endDate ? parseIso(poll.endDate) : null;
  const closed = !!end && end.getTime() <= Date.now();
  const canVote = isAuthenticated && !closed;
  // Results are public — only fresh voters-to-be see bare options
  const showResults = !!poll.userVote || !canVote;
  const total = poll.totalVotes;


  return (
    <View className="mt-sm">

      <Text className="mb-sm font-raleway-bold text-base text-ink">{poll.title}</Text>

      {/* The options are one radio group — each row is a radio */}
      <View accessibilityRole="radiogroup">
        {poll.options.map((option) => (
          <PollOptionRow
            key={option.id}
            text={option.text}
            pct={total > 0 ? Math.round((option.votes / total) * 100) : 0}
            selected={poll.userVote === option.id}
            showResults={showResults}
            canVote={canVote}
            inFlight={votingOptionId === option.id}
            busy={votingOptionId !== null}
            onPress={() => handleVote(option.id)}
          />
        ))}
      </View>

      {/* Status row — a closed poll outranks the login hint */}
      {closed ? (
        <PollHint icon="lock-closed-outline" text={t('news.pollClosed')} />
      ) : !isAuthenticated ? (
        <PollHint icon="log-in-outline" text={t('news.pollLoginToVote')} />
      ) : null}

      {/* Polite live region — the total updating after a vote is
          announced without stealing focus */}
      <Text className="font-raleway text-xs text-ink-faint" accessibilityLiveRegion="polite">
        {t('news.pollVotes', { count: total })}
      </Text>
    </View>
  );
}
