// -----------------------------------------------------------
//  [*] socialuikit — PostCard
//
//  One post as a card: the author row (portrait, name, the
//  self-updating stamp with an 'edited' mark, the source chip),
//  the body — folded at snippetLength with a read-more hint
//  only when the fold actually cut something — then at most ONE
//  attachment block (media beats link: a shared article with
//  photos reads as an album, never both), the poll slot, and
//  the action strip last. A deleted post collapses to the
//  labels.deletedPost placeholder under the same testID, with
//  nothing left to press.
//
//  Press-target discipline (mirrors the app card this one
//  generalises): the card body opens the post through onPress,
//  while the author row and every action stop the event so a
//  tap on them never ALSO opens the post (touches bubble on
//  react-native-web). The card is display truth only — counts,
//  likedByMe and the poll all arrive from the host, so an
//  optimistic toggle patches the feed item in place and this
//  stays a pure renderer, memo()-wrapped so untouched feed
//  rows skip re-rendering.
//
//  Polls: the kit never fetches one. The host hands finished
//  poll UI through pollSlot; with the slot absent,
//  components.PostPoll (when mounted) is the fallback factory
//  receiving { post } — the poll payload rides in post.custom,
//  typed only by the host, which is why a slot exists at all.
//
//  Split into (root component last):
//
//    CardAvatar — host override, else photo, else initial disc
//    PostCard   — the card (default export, memo-wrapped)
// -----------------------------------------------------------

// Theme, labels, slot overrides and the URL resolver
import { useKitComponents, useKitEnv, useKitLabels, useKitTheme } from '../provider';

// The card's own pieces
import { clampSnippet } from '../core/format';
import LinkCard from '../media/LinkCard';
import MediaGallery from '../media/MediaGallery';
import RelativeTime from '../time/RelativeTime';
import ActionRow from './ActionRow';

// The payload shapes
import type { KitPost, KitUser } from '../core/types';

// Rendering
import { Image as ExpoImage } from 'expo-image';
import { memo, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';


// One diameter for the byline portrait
const AVATAR_SIZE = 40;

interface PostCardProps {
  post: KitPost;
  // A tap on the card body (open the post's detail screen)
  onPress?: () => void;
  // A tap on the author row; without it the row is plain décor
  onPressAuthor?: (user: KitUser) => void;
  onPressLike: () => void;
  onPressComment: () => void;
  // Omitted on hosts with no share sheet — the target hides
  onPressShare?: () => void;
  // A tap on the link card; absent, LinkCard uses env.openHref
  onPressLink?: () => void;
  // A tap on gallery tile `index`; absent, the tiles are inert
  onPressMedia?: (index: number) => void;
  // Finished poll UI, rendered verbatim under the attachments
  pollSlot?: ReactNode;
  // Fold the body at this many characters; absent shows it all
  snippetLength?: number;
  showSource?: boolean;
}







// -----------------------------------------------------------
// CardAvatar
// -----------------------------------------------------------
//
// The byline portrait: the host's components.Avatar when one
// is mounted, else the photo through env.resolveImageUrl (a
// dead URL falls back too), else the name's first glyph on a
// brand-wash disc.
//
// Used by:
//   - PostCard (below)
// -----------------------------------------------------------

function CardAvatar({ user, size }: { user: KitUser; size: number }) {

  const { colors, fonts } = useKitTheme();
  const { Avatar } = useKitComponents();
  const { resolveImageUrl } = useKitEnv();


  // A new URL gets a fresh chance after an earlier one failed
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatarUrl]);


  if (Avatar) return <Avatar user={user} size={size} />;


  if (user.avatarUrl && !failed) {
    return (
      <ExpoImage
        testID="socialuikit-post-avatar"
        source={{ uri: resolveImageUrl(user.avatarUrl) }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />
    );
  }


  // Spread iterates code points, not UTF-16 units — an emoji-
  // or non-BMP-leading name keeps its whole first glyph
  const initial = [...user.displayName.trim()][0]?.toUpperCase() ?? '?';


  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.brandSoft,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.42, color: colors.brand }}>{initial}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// PostCard (default export, memo-wrapped)
// -----------------------------------------------------------
//
// The root Pressable is accessible={false} so assistive tech
// reaches the inner targets one by one — the author row, the
// gallery tiles, the link card and the three actions all stay
// separate stops instead of merging into one card-sized blob.
//
// Used by:
//   - src/index.ts — the public surface; hosts render one per
//     feed row (through feed/FeedList.tsx's renderItem) and on
//     the post detail screen
// -----------------------------------------------------------

function PostCard({
  post,
  onPress,
  onPressAuthor,
  onPressLike,
  onPressComment,
  onPressShare,
  onPressLink,
  onPressMedia,
  pollSlot,
  snippetLength,
  showSource = true,
}: PostCardProps) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  const { PostPoll } = useKitComponents();


  // The deleted face keeps the card's slot in the feed but
  // carries nothing pressable — there is no post left to open
  if (post.deleted) {
    return (
      <View
        testID="socialuikit-post-card"
        style={{ borderRadius: radii.card, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 16 }}
      >
        <Text style={{ fontFamily: fonts.regular, fontSize: 14, fontStyle: 'italic', color: colors.inkFaint }}>
          {labels.deletedPost}
        </Text>
      </View>
    );
  }


  const body = snippetLength != null ? clampSnippet(post.text, snippetLength) : post.text;
  // The hint earns its line only when the fold cut something
  const folded = body !== post.text;

  // pollSlot renders verbatim; a mounted PostPoll fills only an
  // ABSENT slot (an explicit null from the host stays empty)
  const poll = pollSlot !== undefined ? pollSlot : PostPoll ? <PostPoll post={post} /> : null;


  return (
    <Pressable
      testID="socialuikit-post-card"
      onPress={onPress}
      disabled={!onPress}
      accessible={false}
      style={({ pressed }) => ({
        borderRadius: radii.card,
        backgroundColor: colors.surface,
        overflow: 'hidden',
        opacity: pressed && onPress ? 0.92 : 1,
      })}
    >

      {/* Author row — its own press target (the profile), so the
          tap stops before the card's open-post press sees it */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12 }}>
        <Pressable
          testID="socialuikit-post-author"
          onPress={
            onPressAuthor
              ? (event: GestureResponderEvent) => {
                  event.stopPropagation();
                  onPressAuthor(post.author);
                }
              : undefined
          }
          disabled={!onPressAuthor}
          accessible={!!onPressAuthor}
          accessibilityRole={onPressAuthor ? 'button' : undefined}
          accessibilityLabel={onPressAuthor ? labels.avatarA11y(post.author.displayName) : undefined}
          hitSlop={4}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
        >
          <CardAvatar user={post.author} size={AVATAR_SIZE} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.ink }}>
              {post.author.displayName.trim() || labels.unknownUser}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 1 }}>
              <RelativeTime iso={post.createdAt} style={{ fontSize: 12 }} />
              {post.editedAt ? (
                <Text style={{ marginLeft: 6, fontFamily: fonts.regular, fontSize: 12, color: colors.inkFaint }}>
                  {`· ${labels.edited}`}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        {post.source && showSource ? (
          <View
            testID="socialuikit-post-source"
            accessibilityLabel={labels.sourceA11y(post.source.label)}
            style={{
              marginLeft: 8,
              borderRadius: radii.chip,
              backgroundColor: colors.chip,
              paddingHorizontal: 8,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.chipInk }}>{post.source.label}</Text>
          </View>
        ) : null}
      </View>

      {post.text.trim() ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.ink }}>{body}</Text>
          {folded ? (
            <Text style={{ marginTop: 4, fontFamily: fonts.medium, fontSize: 13, color: colors.brand }}>
              {labels.readMore}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* At most one attachment block: media beats link, so the
          shared article rides inside its own album post */}
      {post.media && post.media.length > 0 ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <MediaGallery items={post.media} onPressItem={onPressMedia} />
        </View>
      ) : post.link ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
          <LinkCard link={post.link} onPress={onPressLink} />
        </View>
      ) : null}

      {poll != null ? <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>{poll}</View> : null}

      <View
        style={{
          marginTop: 8,
          marginHorizontal: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
          paddingVertical: 2,
        }}
      >
        <ActionRow
          likeCount={post.likeCount}
          commentCount={post.commentCount}
          likedByMe={post.likedByMe}
          onPressLike={onPressLike}
          onPressComment={onPressComment}
          onPressShare={onPressShare}
        />
      </View>

    </Pressable>
  );
}

// memo with an explicit comparator: a feed re-renders on every
// like toggle, and rows whose DATA did not change must skip
// their subtree entirely. Default shallow comparison never
// skips under the documented wiring (hosts pass inline
// closures), so callbacks are deliberately IGNORED here — a
// callback only carries the tap out and must never change what
// a tap MEANS. post and pollSlot compare by reference (a host
// that inlines pollSlot JSX re-renders poll rows — memoize the
// slot to skip those too), the two scalars by value.
export default memo(PostCard, (prev, next) =>
  prev.post === next.post &&
  prev.pollSlot === next.pollSlot &&
  prev.snippetLength === next.snippetLength &&
  prev.showSource === next.showSource);
