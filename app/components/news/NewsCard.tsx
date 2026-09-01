// -----------------------------------------------------------
//  [*] News — NewsCard
//
//  One entry of the news feed, styled after the faculty site
//  (knf.vu.lt/naujienos): the card runs the FULL screen width —
//  cover edge to edge, no rounding — with the burgundy date
//  strip pinned under the image, then title, author row, a
//  ~150-character teaser and the like / comment / share action
//  row. The source badge sits on the cover's corner and moves
//  into the date strip when there is no image. Poll posts swap
//  the teaser for the live PollWidget.
//
//  The card itself opens the post; the author row and the
//  action strip are separate press targets that stop the
//  event so a tap on them never also opens the post (touches
//  bubble on react-native-web). The strip is the social kit's
//  ActionRow — it carries the stateful, pluralised spoken
//  names ("Patinka, 3 patiktukai" flips to "Nebepatinka, …")
//  from the kit's own LT/EN catalog, and its share target
//  mounts only when the card passes onShare through (the web
//  build without a share sheet does not). The author row is a
//  link only when the screen passes onOpenAuthor — scraped
//  knf.vu.lt / vu.lt articles have no profile behind the name.
//
//  No interaction state lives here: `liked`, `likeCount` and
//  `pendingLike` arrive as props from the screen's row wrapper
//  (the social engine's useLikeToggle layered over the feed
//  row), so this component stays a pure renderer —
//  memo()-wrapped so untouched feed rows skip re-rendering.
//
//  Split into (root component last):
//
//    makeSnippet     — teaser text cut to length
//    resolveCoverUri — cover image URL defence (exported)
//    AuthorRow       — avatar + author name, optionally pressable
//    NewsCard        — the card itself (default export)
// -----------------------------------------------------------

// Card surface and the author's fallback portrait
import { Avatar } from '@/components/ui';

// Sibling news pieces — origin chip + live poll
import PollWidget from '@/components/news/PollWidget';
import SourceBadge from './SourceBadge';

// The like / comments / share strip
import { ActionRow } from '@knf/socialuikit';

// Feed shape, upload resolution and date formatting
import { getUploadUrl, type SocialFeedPost } from '@/services/api';
import { stripScrapedPreamble } from '@/services/newsText';
import { formatDate } from '@/services/format';
import type { NewsPost } from '@/types';

// Rendering
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GestureResponderEvent, Platform, Pressable, Text, View } from 'react-native';


// Teaser cut length — matches the old feed's ~150 characters
const SNIPPET_LENGTH = 150;

interface NewsCardProps {
  post: SocialFeedPost;
  liked: boolean;
  likeCount: number;
  // A like still on the wire — the heart dims, stays tappable
  pendingLike?: boolean;
  showAvatar?: boolean;
  onPress: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  onShare: () => void;
  onOpenAuthor?: () => void;
}







// -----------------------------------------------------------
// makeSnippet
// -----------------------------------------------------------
//
// The card shows a teaser, not the article: SNIPPET_LENGTH
// characters with trailing whitespace trimmed and a one-char
// ellipsis. Returns null for blank content so the root can
// skip the text block entirely.
//
// Used by:
//   - NewsCard (below)
// -----------------------------------------------------------

function makeSnippet(text: string): string | null {

  const trimmed = text.trim();
  if (!trimmed) return null;


  if (trimmed.length <= SNIPPET_LENGTH) return trimmed;
  return trimmed.slice(0, SNIPPET_LENGTH).trimEnd() + '…';
}







// -----------------------------------------------------------
// resolveCoverUri
// -----------------------------------------------------------
//
// The client half of the upload-URL defence: a user post's
// cover may only live in our own /api/uploads store — an
// arbitrary absolute URL in imageUrl is a tracking beacon
// fired from every feed, not a cover. Scraped knf.vu.lt /
// vu.lt articles keep their faculty-hosted covers. Anything
// else (foreign hosts, odd schemes, malformed URLs) renders
// no image at all. Exported: the article screen shows the
// same cover full-width, so both go through this one defence.
//
// Used by:
//   - NewsCard (below)
//   - app/(main)/news-post/index.tsx — the article's hero cover
// -----------------------------------------------------------

// A scraped article's absolute cover URL may point anywhere
// under the university domain — vu.lt itself or any subdomain
// (www.knf.vu.lt for KNF articles, newshub.vu.lt for VU ones).
// A suffix check, not a host list: VU moves its media hosts.
function isUniversityHost(hostname: string): boolean {
  return hostname === 'vu.lt' || hostname.endsWith('.vu.lt');
}

export function resolveCoverUri(post: NewsPost): string | null {

  const raw = post.imageUrl;
  if (!raw) return null;


  // Our own upload store — relative paths resolved at render
  // time against the API origin
  if (raw.startsWith('/api/uploads/') || raw.startsWith('uploads/')) {
    return getUploadUrl(raw) ?? null;
  }


  // Absolute URLs pass only for scraped faculty articles that
  // still point at the faculty sites
  if (/^https?:\/\//i.test(raw) && (post.source === 'knf.vu.lt' || post.source === 'vu.lt')) {
    try {
      if (isUniversityHost(new URL(raw).hostname.toLowerCase())) return raw;
    } catch {
      // Malformed URL — fall through to no image
    }
  }


  return null;
}







// -----------------------------------------------------------
// AuthorRow
// -----------------------------------------------------------
//
// The author line under the title — with the avatar for user
// posts in community mode. Pressable (brand-tinted) only when
// onOpenAuthor is passed; self-start keeps the press target on
// the name itself, not the whole card width.
//
// Used by:
//   - NewsCard (below)
// -----------------------------------------------------------

function AuthorRow({ author, avatarUrl, withAvatar, onOpenAuthor }: {
  author: string;
  avatarUrl?: string;
  withAvatar: boolean;
  onOpenAuthor?: () => void;
}) {

  const { t } = useTranslation();


  const content = (
    <>
      {withAvatar ? <Avatar uri={avatarUrl} name={author} size={24} /> : null}
      <Text
        className={
          onOpenAuthor
            ? 'font-raleway-medium text-sm text-brand'
            : 'font-raleway text-sm text-ink-soft'
        }
      >
        {author}
      </Text>
    </>
  );


  if (!onOpenAuthor) {
    return <View className="flex-row items-center gap-sm px-lg pt-1.5">{content}</View>;
  }


  return (
    <Pressable
      className="flex-row items-center gap-sm self-start px-lg pt-1.5"
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onOpenAuthor();
      }}
      hitSlop={{ top: 10, bottom: 10, left: 4, right: 12 }}
      accessibilityRole="button"
      accessibilityLabel={t('news.a11yOpenAuthor')}
    >
      {content}
    </Pressable>
  );
}







// -----------------------------------------------------------
// NewsCard (default export)
// -----------------------------------------------------------
//
// The Card is accessible={false} so screen readers reach the
// inner targets one by one: the image/date/title block is the
// dedicated open-post button, the author row, snippet, poll
// rows and the strip's actions stay reachable siblings.
//
// Used by:
//   - app/(main)/tabs/news.tsx — every entry of both feeds
// -----------------------------------------------------------

function NewsCard({
  post,
  liked,
  likeCount,
  pendingLike = false,
  showAvatar = false,
  onPress,
  onToggleLike,
  onOpenComments,
  onShare,
  onOpenAuthor,
}: NewsCardProps) {

  const { t, i18n } = useTranslation();


  // Poll posts show the live widget instead of a text teaser;
  // memoized so like toggles on other rows don't recompute it
  const snippet = useMemo(
    () =>
      post.postType === 'poll'
        ? null
        : makeSnippet(stripScrapedPreamble(post.summary || post.content, post)),
    [post],
  );

  const coverUri = useMemo(() => resolveCoverUri(post), [post]);

  // A cover that cannot load collapses the card to its no-image
  // layout (the badge moves inline onto the date line) — never a
  // blank 16:9 hole; a new uri gets a fresh try
  const [coverFailed, setCoverFailed] = useState(false);
  useEffect(() => setCoverFailed(false), [coverUri]);

  // The language is a dependency — formatDate follows it
  // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n.language drives formatDate's locale implicitly; the recompute is the point
  const dateText = useMemo(() => formatDate(post.date), [post.date, i18n.language]);


  // The web build has nothing behind the share action without
  // the Web Share API — hide it rather than fail silently
  const canShare =
    Platform.OS !== 'web' || (typeof navigator !== 'undefined' && !!navigator.share);


  return (
    <Pressable
      // Faculty style (knf.vu.lt): the card runs the full screen
      // width — cover edge to edge, no rounding, cards separated
      // by a sliver of canvas — so the feed reads like the
      // faculty news page, not a stack of floating tiles
      className="mb-2 bg-surface"
      style={({ pressed }) => (pressed ? { opacity: 0.92 } : null)}
      onPress={onPress}
      accessible={false}
    >

      {/* The open-post target for assistive tech — image, date
          and title as one button; a tap anywhere else on the
          card still opens the post through the Card press. The
          stop keeps the tap from also firing the Card press
          (touches bubble on react-native-web) */}
      <Pressable
        onPress={(event: GestureResponderEvent) => {
          event.stopPropagation();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${post.title}. ${t('news.a11yOpenPost')}`}
      >

        {/* Cover image with the source badge pinned to its corner */}
        {coverUri && !coverFailed ? (
          <View>
            <Image
              source={{ uri: coverUri }}
              style={{ width: '100%', aspectRatio: 16 / 9 }}
              contentFit="cover"
              recyclingKey={coverUri}
              transition={150}
              onError={() => setCoverFailed(true)}
            />
            <SourceBadge source={post.source} overlay />
          </View>
        ) : null}

        {/* The faculty date strip — a burgundy band pinned under
            the cover (or standing in as the card's top band when
            there is no image, where it also hosts the badge) */}
        <View className="flex-row items-center justify-between bg-brand-header px-lg py-2">
          <Text className="font-raleway-medium text-xs tracking-wide text-on-brand">
            {dateText}
          </Text>
          {!coverUri || coverFailed ? <SourceBadge source={post.source} /> : null}
        </View>

        <Text className="px-lg pt-3 font-raleway-bold text-lg leading-6 text-ink" numberOfLines={3}>
          {post.title}
        </Text>

      </Pressable>

      {post.author ? (
        <AuthorRow
          author={post.author}
          avatarUrl={post.authorAvatar}
          withAvatar={showAvatar && post.source === 'user'}
          onOpenAuthor={onOpenAuthor}
        />
      ) : null}

      {snippet ? (
        <Text
          className="px-lg pb-1 pt-2.5 font-raleway text-sm leading-5 text-ink-soft"
          numberOfLines={3}
        >
          {snippet}
        </Text>
      ) : null}

      {/* The widget carries no horizontal padding of its own
          (the article screen pads it too) — without this wrap
          the option bars run to the screen edge on the now
          full-bleed card */}
      {post.postType === 'poll' ? (
        <View className="px-lg pb-1">
          <PollWidget postId={post.id} />
        </View>
      ) : null}

      {/* Like / comments / share — the kit's strip; every target
          stops the event itself, so none of them also fires the
          card press above. The share target is omitted (not
          hidden) where no sheet exists. The share tally the old
          strip showed has no slot in the kit's row */}
      <View className="mt-2 border-t border-line px-md py-2">
        <ActionRow
          likeCount={likeCount}
          commentCount={post.comments}
          likedByMe={liked}
          pendingLike={pendingLike}
          onPressLike={onToggleLike}
          onPressComment={onOpenComments}
          onPressShare={canShare ? onShare : undefined}
          shareCount={post.shares}
        />
      </View>

    </Pressable>
  );
}

// memo: the feed re-renders on every like toggle — rows whose
// props didn't change skip their subtree entirely
export default memo(NewsCard);
