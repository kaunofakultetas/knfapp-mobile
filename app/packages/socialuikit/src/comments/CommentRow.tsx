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
//  callback the row is inert, and it is then a plain View —
//  never a disabled button a screen reader would announce as
//  dimmed. A deleted comment collapses to the italic
//  labels.commentDeleted placeholder and drops every
//  interaction — nothing to act on any more.
//
//  The long-press row is ONE accessibility element (its text
//  read as a whole), so the gestures a screen reader cannot
//  perform ride on it as named actions: the host's action
//  sheet (labels.commentActions) and, when the host passes
//  onPressAuthor, the author's profile — the portrait button
//  nested inside a grouped row is otherwise out of reach.
//
//  Split into (root component last):
//
//    RowAvatar     — photo, else the initial on a brand-wash disc
//    CommentBubble — name, stamp and text on the row's ground
//    CommentRow    — the row itself (default export)
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
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.42, color: colors.brandText }}>{initial}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// CommentBubble
// -----------------------------------------------------------
//
// The bubble beside the portrait: the author's name (brand
// ink — the text token, legible on both grounds in both
// schemes; a tap on it opens the author too), the relative
// stamp and the comment text, which wraps freely — a comment
// is never cut.
//
// Used by:
//   - CommentRow (below)
// -----------------------------------------------------------

function CommentBubble({
  comment,
  onPressAuthor,
}: {
  comment: KitComment;
  onPressAuthor?: (user: KitUser) => void;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  return (
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
          style={{ flexShrink: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.brandText }}
        >
          {comment.author.displayName.trim() || labels.unknownUser}
        </Text>
        <RelativeTime iso={comment.createdAt} style={{ marginLeft: 8, fontSize: 11 }} />
      </View>
      <Text style={{ marginTop: 2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink }}>
        {comment.text}
      </Text>
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
//   - app/(main)/news-post and news-comments — through
//     components/news/commentActions.ts
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


  // The portrait presses separately from the row's long-press;
  // with no onPressAuthor it is plain décor. hitSlop 6 lifts
  // the 32dp disc to the 44pt floor
  const portrait = (
    <Pressable
      onPress={onPressAuthor ? () => onPressAuthor(comment.author) : undefined}
      disabled={!onPressAuthor}
      hitSlop={6}
      accessibilityRole={onPressAuthor ? 'button' : undefined}
      accessibilityLabel={onPressAuthor ? labels.avatarA11y(comment.author.displayName) : undefined}
    >
      <RowAvatar user={comment.author} size={AVATAR_SIZE} />
    </Pressable>
  );
  const rowStyle = { flexDirection: 'row' as const, paddingHorizontal: 12, paddingVertical: 4 };


  if (!onLongPress) {
    return (
      <View testID="socialuikit-comment-row" style={rowStyle}>
        {portrait}
        <CommentBubble comment={comment} onPressAuthor={onPressAuthor} />
      </View>
    );
  }


  // The screen reader's doors to what fingers do by gesture
  const name = comment.author.displayName.trim() || labels.unknownUser;
  const actions = [
    { name: 'longpress', label: labels.commentActions },
    ...(onPressAuthor ? [{ name: 'openAuthor', label: labels.openProfile(name) }] : []),
  ];


  return (
    <Pressable
      testID="socialuikit-comment-row"
      onLongPress={() => onLongPress(comment)}
      accessibilityActions={actions}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') onLongPress(comment);
        else if (event.nativeEvent.actionName === 'openAuthor') onPressAuthor?.(comment.author);
      }}
      style={rowStyle}
    >
      {portrait}
      <CommentBubble comment={comment} onPressAuthor={onPressAuthor} />
    </Pressable>
  );
}
