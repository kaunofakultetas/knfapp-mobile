// -----------------------------------------------------------
//  [*] socialuikit — ActionRow
//
//  The like / comments / share strip under a post: three
//  separate press targets, never one accessibility blob — a
//  screen reader walks button by button, and each button's
//  spoken name carries the live tally (likeWithCount flips to
//  unlikeWithCount with likedByMe, so the announced action
//  always matches what the next tap does). Tallies compact
//  through formatCount so a viral post never blows the column.
//  Every tap stops the event: the row usually sits on a card
//  whose own press opens the post, and a like must never ALSO
//  navigate (touches bubble on react-native-web).
//
//  pendingLike dims the heart while an optimistic toggle is
//  still in flight but keeps it tappable — the host's queue
//  coalesces rapid flips, so a locked button would only punish
//  the impatient. The share target mounts only when the host
//  passes onPressShare (a web host without a share sheet just
//  omits it).
//
//  Split into (root component last):
//
//    Target    — one icon-plus-tally press target
//    ActionRow — the strip (default export)
// -----------------------------------------------------------

// Theme and the label catalog
import { useKitLabels, useKitTheme } from '../provider';

// Tally compaction ('1.2k')
import { formatCount } from '../core/format';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';







// -----------------------------------------------------------
// Target
// -----------------------------------------------------------
//
// One press target of the strip: icon, optional tally, its own
// accessibility name. The visual footprint is small, so hitSlop
// restores a comfortable tap area; the stop keeps the tap from
// also firing the surrounding card's press.
//
// Used by:
//   - ActionRow (below) — like / comments / share
// -----------------------------------------------------------

function Target({
  testID,
  icon,
  count,
  label,
  active = false,
  dimmed = false,
  onPress,
}: {
  testID: string;
  icon: keyof typeof Ionicons.glyphMap;
  // The tally next to the icon; the share target carries none
  count?: number;
  label: string;
  active?: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {

  const { colors, fonts } = useKitTheme();


  const tint = active ? colors.like : colors.inkSoft;


  return (
    <Pressable
      testID={testID}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event: GestureResponderEvent) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 6,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      {count != null ? (
        <Text style={{ marginLeft: 6, fontFamily: fonts.medium, fontSize: 13, color: tint }}>{formatCount(count)}</Text>
      ) : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// ActionRow (default export)
// -----------------------------------------------------------
//
//   <ActionRow likeCount={post.likeCount} likedByMe={liked}
//              commentCount={post.commentCount}
//              pendingLike={queueBusy}
//              onPressLike={toggle} onPressComment={open}
//              onPressShare={share} />
//
// Used by:
//   - post/PostCard.tsx — the card's footer
//   - the host's post detail screen, through the root export
// -----------------------------------------------------------

export default function ActionRow({
  likeCount,
  commentCount,
  likedByMe,
  pendingLike = false,
  onPressLike,
  onPressComment,
  onPressShare,
  shareCount,
}: {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  // A share tally beside the share glyph — hosts that count
  // completed shares pass it, others leave the target bare
  shareCount?: number;
  // An optimistic like still in flight — the heart dims but
  // stays tappable (the host's queue coalesces rapid flips)
  pendingLike?: boolean;
  onPressLike: () => void;
  onPressComment: () => void;
  // Omitted on hosts with no share sheet — the target hides
  onPressShare?: () => void;
}) {

  const labels = useKitLabels();


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>

      <Target
        testID="socialuikit-action-like"
        icon={likedByMe ? 'heart' : 'heart-outline'}
        count={likeCount}
        label={likedByMe ? labels.unlikeWithCount(likeCount) : labels.likeWithCount(likeCount)}
        active={likedByMe}
        dimmed={pendingLike}
        onPress={onPressLike}
      />

      <Target
        testID="socialuikit-action-comment"
        icon="chatbubble-outline"
        count={commentCount}
        label={labels.commentsWithCount(commentCount)}
        onPress={onPressComment}
      />

      {onPressShare ? (
        <Target testID="socialuikit-action-share" icon="share-outline" count={shareCount} label={labels.share} onPress={onPressShare} />
      ) : null}

    </View>
  );
}
