// -----------------------------------------------------------
//  [*] News — NewsCard
//
//  One entry of the news feed: cover image with the source
//  badge in its corner (the badge moves inline onto the date
//  line when there is no image), date, title, author row, a
//  ~150-character teaser and the like / comment / share
//  action row. Poll posts swap the teaser for the live
//  PollWidget.
//
//  The card itself opens the post; the author row and the
//  three actions are separate press targets that stop the
//  event so a tap on them never also opens the post (touches
//  bubble on react-native-web). The author row is a link only
//  when the screen passes onOpenAuthor — scraped knf.vu.lt /
//  vu.lt articles have no profile behind the name.
//
//  All state lives in the screen: `liked` and `likeCount`
//  arrive as props so optimistic like toggles patch the feed
//  item in place and this component stays a pure renderer.
//
//  Split into (root component last):
//
//    makeSnippet  — teaser text cut to length
//    ActionButton — one icon + count press target
//    AuthorRow    — avatar + author name, optionally pressable
//    NewsCard     — the card itself (default export)
// -----------------------------------------------------------

// Card surface and the author's fallback portrait
import { Avatar, Card } from '@/components/ui';

// Sibling news pieces — origin chip + live poll
import PollWidget from '@/components/news/PollWidget';
import SourceBadge from './SourceBadge';

// Feed shape, upload resolution and date formatting
import { getUploadUrl, type SocialFeedPost } from '@/services/api';
import { stripScrapedPreamble } from '@/services/newsText';
import { formatDate } from '@/services/format';

// JS-side icon colors
import { useTheme } from '@/hooks/useTheme';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { GestureResponderEvent, Pressable, Text, View } from 'react-native';


// Teaser cut length — matches the old feed's ~150 characters
const SNIPPET_LENGTH = 150;

interface NewsCardProps {
  post: SocialFeedPost;
  liked: boolean;
  likeCount: number;
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
// ActionButton
// -----------------------------------------------------------
//
// One icon-plus-count press target of the card footer. The
// visual footprint is small, so hitSlop restores the 44pt
// target; the tap stops propagating so it never also fires
// the card's own onPress.
//
// Used by:
//   - NewsCard (below) — like / comments / share
// -----------------------------------------------------------

function ActionButton({ icon, count, label, active = false, onPress }: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      className="flex-row items-center gap-sm px-sm py-xs"
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <Ionicons name={icon} size={20} color={active ? colors.accent : colors.inkSoft} />
      <Text
        className={
          active
            ? 'font-raleway-medium text-sm text-accent'
            : 'font-raleway-medium text-sm text-ink-soft'
        }
      >
        {count}
      </Text>
    </Pressable>
  );
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
// Used by:
//   - app/(main)/tabs/news.tsx — every entry of both feeds
// -----------------------------------------------------------

export default function NewsCard({
  post,
  liked,
  likeCount,
  showAvatar = false,
  onPress,
  onToggleLike,
  onOpenComments,
  onShare,
  onOpenAuthor,
}: NewsCardProps) {

  const { t } = useTranslation();


  // Poll posts show the live widget instead of a text teaser
  const snippet = post.postType === 'poll' ? null : makeSnippet(stripScrapedPreamble(post.summary || post.content, post));


  return (
    <Card padding="none" className="mx-md my-sm overflow-hidden" onPress={onPress}>

      {/* Cover image with the source badge pinned to its corner */}
      {post.imageUrl ? (
        <View>
          <Image
            source={{ uri: getUploadUrl(post.imageUrl) }}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            contentFit="cover"
            recyclingKey={post.imageUrl}
            transition={150}
          />
          <SourceBadge source={post.source} overlay />
        </View>
      ) : null}

      {/* Date line — the badge moves here when there is no image */}
      <View className="flex-row items-center justify-between px-lg pt-3.5">
        <Text className="font-raleway-semibold text-xs tracking-wide text-brand">
          {formatDate(post.date)}
        </Text>
        {!post.imageUrl ? <SourceBadge source={post.source} /> : null}
      </View>

      <Text className="px-lg pt-2 font-raleway-bold text-lg leading-6 text-ink" numberOfLines={3}>
        {post.title}
      </Text>

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

      {post.postType === 'poll' ? <PollWidget postId={post.id} /> : null}

      {/* Like / comments / share — each stops the card press */}
      <View className="mt-2 flex-row items-center justify-between border-t border-line px-md py-2">
        <ActionButton
          icon={liked ? 'heart' : 'heart-outline'}
          count={likeCount}
          active={liked}
          label={t(liked ? 'news.a11yUnlike' : 'news.a11yLike')}
          onPress={onToggleLike}
        />
        <ActionButton
          icon="chatbubble-outline"
          count={post.comments}
          label={t('news.a11yComments')}
          onPress={onOpenComments}
        />
        <ActionButton
          icon="share-outline"
          count={post.shares}
          label={t('news.a11yShare')}
          onPress={onShare}
        />
      </View>

    </Card>
  );
}
