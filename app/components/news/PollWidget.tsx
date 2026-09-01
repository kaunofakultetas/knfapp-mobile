// -----------------------------------------------------------
//  [*] News — PollWidget
//
//  The poll block embedded under a poll-type post. A thin
//  seam now: @knf/socialengine's usePoll owns the fetch, the
//  pessimistic vote and the sign-in gate, @knf/socialuikit's
//  PollBlock owns the whole face (ballots, tallies, the guest
//  hint, the expander, the closed/countdown footer). This file
//  only maps the hook's states onto the block and keeps the
//  one thing the kit has no surface for — a compact retry row
//  for a failed load.
//
//  The KNF adapter addresses a poll BY ITS POST ID, so
//  usePoll(postId) is the call. `missing` (the post has no
//  poll) renders nothing, as does loading; a rejected load
//  shows the retry row wired to refresh().
//
//  Nothing here fetches, caches, keys on auth or toasts: the
//  engine notifies through SocialEngineHost, its provider
//  re-mounts on a viewer change so a fresh login sees its own
//  vote, and a vote only becomes visible once the server
//  answers (the hook's contract).
//
//  The parent owns horizontal padding — the widget only adds
//  its own top margin.
//
//  Split into (root component last):
//
//    PollLoadError — compact failure row with retry
//    PollWidget    — hook → block mapping (default export)
// -----------------------------------------------------------

// The guest flag for the block's sign-in hint
import { useAuth } from '@/context/AuthContext';

// The login round-trip lands back on this exact screen
import { useReturnHref } from '@/hooks/useReturnHref';
import { router } from 'expo-router';

// Icons and JS-side colors for the retry row
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

// Primitives
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';

// The poll's live state and its complete face
import { usePoll } from '@knf/socialengine';
import { PollBlock } from '@knf/socialuikit';







// -----------------------------------------------------------
// PollLoadError
// -----------------------------------------------------------
//
// Shown when the poll load REJECTED (network/server error) —
// a missing poll renders nothing instead. Compact on purpose:
// this sits inside a news card, not on a full screen.
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
// PollWidget (default export)
// -----------------------------------------------------------
//
// Used by:
//   - components/news/NewsCard.tsx — poll posts in the feed
//   - app/(main)/news-post/index.tsx — the post detail screen
// -----------------------------------------------------------

// A tap inside the block must not also open the post: native's
// responder system already keeps it on the deepest pressable,
// but on the web the click bubbles up to the card — stopped
// here at the block's edge (the kit's rows do not stop it)
const stopWebClick = Platform.OS === 'web'
  ? { onClick: (event: { stopPropagation: () => void }) => event.stopPropagation() }
  : {};


export default function PollWidget({ postId }: { postId: string }) {

  const { isAuthenticated } = useAuth();
  const returnTo = useReturnHref();
  const poll = usePoll(postId);


  if (poll.error && !poll.poll) {
    return <PollLoadError onRetry={poll.refresh} />;
  }


  // Loading, or the post simply has no poll
  if (!poll.poll) return null;


  return (
    <View className="mt-sm" {...stopWebClick}>
      <PollBlock
        poll={poll.poll}
        canVote={poll.canVote}
        submitting={poll.submitting}
        signedOut={!isAuthenticated}
        onVote={(optionIds) => {
          void poll.vote(optionIds);
        }}
        onPressSignIn={() => router.push({ pathname: '/login', params: { returnTo } })}
        onRefreshResults={poll.refresh}
      />
    </View>
  );
}
