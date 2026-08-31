// -----------------------------------------------------------
//  [*] socialuikit — CommentRow
//
//  One comment of a post's discussion: the author's portrait,
//  their name, a timestamp and the text on a soft bubble (the
//  reader's own comments take the brand wash instead of the
//  neutral chip ground). The row is display truth only — a
//  long-press hands the whole comment back to the host (its
//  action sheet decides what "report" or "delete" mean) and a
//  tap on the portrait hands back the author; with neither
//  callback the row is inert. A deleted comment collapses to
//  the italic labels.commentDeleted placeholder and drops
//  every interaction — nothing to act on any more.
//
//  Split into (root component last):
//
//    RowAvatar  — photo, else the initial on a brand-wash disc
//    CommentRow — the row itself (default export)
// -----------------------------------------------------------

// Theme, labels, the host's slot overrides and URL resolver
import { useKitComponents, useKitEnv, useKitLabels, useKitTheme } from '../provider';

// The comment payload shape
import type { KitComment, KitUser } from '../core/types';

// The self-updating stamp (reads env.now, so tests freeze it)
import RelativeTime from '../time/RelativeTime';

// Row primitives
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';


// One diameter everywhere the row draws a portrait, so the
// deleted face keeps the thread's indentation
const AVATAR_SIZE = 32;







// -----------------------------------------------------------
// RowAvatar
// -----------------------------------------------------------
//
// The portrait: the host's components.Avatar when one is
// mounted, else the photo through env.resolveImageUrl (a dead
// URL falls back too), else the name's first glyph on a
// brand-wash disc.
//
// Used by:
//   - CommentRow (below)
// -----------------------------------------------------------

function RowAvatar({ user, size }: { user: KitUser; size: number }) {

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
        testID="socialuikit-comment-avatar"
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
// CommentRow (default export)
// -----------------------------------------------------------
//
//   <CommentRow comment={c} onPressAuthor={openProfile}
//               onLongPress={showActions} />
//
// Used by:
//   - src/index.ts — the public surface; hosts render one per
//     row of a post's comment thread
// -----------------------------------------------------------

export default function CommentRow({
  comment,
  onPressAuthor,
  onLongPress,
}: {
  comment: KitComment;
  // A tap on the portrait (open the author's profile)
  onPressAuthor?: (user: KitUser) => void;
  // A long-press anywhere on the row (the host's action sheet)
  onLongPress?: (comment: KitComment) => void;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  // The deleted face keeps the thread's shape (portrait and
  // indentation) but is inert — there is nothing left to act on
  if (comment.deleted) {
    return (
      <View testID="socialuikit-comment-row" style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4 }}>

        <RowAvatar user={comment.author} size={AVATAR_SIZE} />

        <View
          style={{
            flex: 1,
            marginLeft: 8,
            borderRadius: radii.chip,
            backgroundColor: colors.chip,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, fontStyle: 'italic', color: colors.inkFaint }}>
            {labels.commentDeleted}
          </Text>
        </View>

      </View>
    );
  }


  return (
    <Pressable
      testID="socialuikit-comment-row"
      onLongPress={onLongPress ? () => onLongPress(comment) : undefined}
      disabled={!onLongPress}
      style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4 }}
    >

      {/* The portrait presses separately from the row's
          long-press; with no onPressAuthor it is plain décor */}
      <Pressable
        onPress={onPressAuthor ? () => onPressAuthor(comment.author) : undefined}
        disabled={!onPressAuthor}
        hitSlop={4}
        accessibilityRole={onPressAuthor ? 'button' : undefined}
        accessibilityLabel={onPressAuthor ? labels.avatarA11y(comment.author.displayName) : undefined}
      >
        <RowAvatar user={comment.author} size={AVATAR_SIZE} />
      </Pressable>

      <View
        style={{
          flex: 1,
          marginLeft: 8,
          borderRadius: radii.chip,
          backgroundColor: comment.isOwn ? colors.brandSoft : colors.chip,
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text
            numberOfLines={1}
            onPress={onPressAuthor ? () => onPressAuthor(comment.author) : undefined}
            style={{ flexShrink: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.brand }}
          >
            {comment.author.displayName.trim() || labels.unknownUser}
          </Text>
          <RelativeTime iso={comment.createdAt} style={{ marginLeft: 8, fontSize: 11 }} />
        </View>
        <Text style={{ marginTop: 2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink }}>
          {comment.text}
        </Text>
      </View>

    </Pressable>
  );
}
