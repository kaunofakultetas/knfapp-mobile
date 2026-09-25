// -----------------------------------------------------------
//  [*] socialuikit — NotificationRow
//
//  One (possibly grouped) activity row: the actor's portrait
//  (for a group, its first two people as a DUO — two smaller
//  heads offset diagonally inside the same slot), the sentence
//  built from the kind map ('Ona ir dar 3 žmonės pamėgo jūsų
//  įrašą' — the label functions carry the andOthers phrasing
//  themselves, the row only hands them the first name and how
//  many ride behind it), a one-line subject snippet, and the
//  row's age right-aligned on the first line. An unrecognised
//  kind never crashes the list — it answers
//  labels.notifGeneric, so a server that grows a new activity
//  type degrades to a generic line on old clients.
//
//  The slot is one portrait wide on every row, so every
//  sentence starts at the same edge. It used to be a stack of
//  up to five heads — 160 dp of a phone's row, which cut a
//  group's sentence to 'Ona ir dar 4 žmonės pamėgo jūsų …'
//  and zig-zagged the text column down the list; the sentence
//  already counts everyone, the faces are only a cue.
//
//  Unread rows take the unreadTint wash and a brand dot, and
//  swap the testID suffix to '-unread' so a harness can count
//  them. Unlike the post card, the WHOLE row is one
//  accessibility target with one combined label (sentence,
//  then snippet): an activity row has exactly one action —
//  open the subject — so a screen reader should hear one
//  sentence, not four stops.
//
//  Split into (root component last):
//
//    StackAvatar     — one portrait of the slot
//    ActorFaces      — the slot: one portrait, or the duo
//    lineFor         — kind → the row's sentence
//    NotificationRow — the row (default export)
// -----------------------------------------------------------

// Theme, labels, slot overrides and the URL resolver
import { useKitComponents, useKitEnv, useKitLabels, useKitTheme } from '../provider';

// Snippet fold and the label catalog's shape
import { clampSnippet } from '../core/format';
import type { KitLabels } from '../provider/labels';

// The self-updating stamp (reads env.now, so tests freeze it)
import RelativeTime from '../time/RelativeTime';

// The payload shapes
import type { KitNotification, KitUser } from '../core/types';

// Rendering
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';


// A lone actor's portrait, in dp
const AVATAR_SIZE = 36;
// Each head of a group's duo — two of them, offset diagonally,
// fit the lone portrait's slot
const DUO_SIZE = 24;
// The ring around each head — the row's own background color,
// so the duo's front head reads as separate from the one
// behind it, not one blob
const RING_WIDTH = 2;
// The slot every row keeps for its faces: one ringed portrait
const SLOT_SIZE = AVATAR_SIZE + 2 * RING_WIDTH;

// The subject snippet is one visual line anyway; the character
// fold also keeps the row's combined accessibility sentence
// from swallowing a whole article
const SNIPPET_LENGTH = 90;







// -----------------------------------------------------------
// StackAvatar
// -----------------------------------------------------------
//
// One portrait of the slot, `size` dp across: the host's
// components.Avatar when one is mounted, else the photo
// through env.resolveImageUrl (a dead URL falls back too),
// else the name's first glyph on a brand-wash disc — all
// inside the ring that separates overlapping heads. `place`
// pins a duo head to its corner of the slot.
//
// Used by:
//   - ActorFaces (below) — the lone portrait or each duo head
// -----------------------------------------------------------

function StackAvatar({
  user,
  index,
  size,
  ringColor,
  place,
}: {
  user: KitUser;
  index: number;
  size: number;
  ringColor: string;
  place?: { top?: number; left?: number; right?: number; bottom?: number };
}) {

  const { colors, fonts } = useKitTheme();
  const { Avatar } = useKitComponents();
  const { resolveImageUrl } = useKitEnv();


  // A new URL gets a fresh chance after an earlier one failed
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatarUrl]);


  const outer = size + 2 * RING_WIDTH;
  const frame = {
    ...(place ? { position: 'absolute' as const, ...place } : null),
    width: outer,
    height: outer,
    borderRadius: outer / 2,
    borderWidth: RING_WIDTH,
    borderColor: ringColor,
    overflow: 'hidden' as const,
  };


  if (Avatar) {
    return (
      <View testID={`socialuikit-notification-avatar-${index}`} style={frame}>
        <Avatar user={user} size={size} />
      </View>
    );
  }


  if (user.avatarUrl && !failed) {
    return (
      <View testID={`socialuikit-notification-avatar-${index}`} style={frame}>
        <ExpoImage
          source={{ uri: resolveImageUrl(user.avatarUrl) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
        />
      </View>
    );
  }


  // Spread iterates code points, not UTF-16 units — an emoji-
  // or non-BMP-leading name keeps its whole first glyph
  const initial = [...user.displayName.trim()][0]?.toUpperCase() ?? '?';


  return (
    <View
      testID={`socialuikit-notification-avatar-${index}`}
      style={[frame, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft }]}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.42, color: colors.brandText }}>{initial}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// ActorFaces
// -----------------------------------------------------------
//
// The row's portrait slot — one ringed portrait wide, always:
// a lone actor's portrait fills it; a group's first person
// sits top-left and the second bottom-right, in front, each
// head a size down. Everyone else rides in the sentence only.
// An empty actor list (a malformed row) keeps the empty slot,
// so its sentence still lines up with the rest.
//
// Used by:
//   - NotificationRow (below)
// -----------------------------------------------------------

function ActorFaces({ actors, ringColor }: { actors: KitUser[]; ringColor: string }) {

  const [first, second] = actors;


  return (
    <View style={{ width: SLOT_SIZE, height: SLOT_SIZE }}>
      {first && !second ? <StackAvatar user={first} index={0} size={AVATAR_SIZE} ringColor={ringColor} /> : null}
      {first && second ? (
        <>
          <StackAvatar user={first} index={0} size={DUO_SIZE} ringColor={ringColor} place={{ top: 0, left: 0 }} />
          <StackAvatar user={second} index={1} size={DUO_SIZE} ringColor={ringColor} place={{ bottom: 0, right: 0 }} />
        </>
      ) : null}
    </View>
  );
}







// -----------------------------------------------------------
// lineFor
// -----------------------------------------------------------
//
// The kind map. `others` is how many actors ride behind the
// named one — clamped at zero so an empty actor list (a
// malformed row) still answers a sentence instead of '-1
// others'. The default arm is the forward-compatibility valve:
// KitNotification.kind is an open string union on purpose.
// 'reply' and 'mention' are dormant on the KNF backend (its
// activity table's CHECK admits only like / comment /
// connect_request / connect_accept — there are no threaded
// replies or @mentions in the news app) and stay on purpose:
// the kit is backend-agnostic, and a backend that has them
// gets its sentence without a kit release.
//
// Used by:
//   - NotificationRow (below)
// -----------------------------------------------------------

function lineFor(notification: KitNotification, labels: KitLabels): string {

  // A tombstoned author (deleted account, scrape gap) still
  // reads as a person, never as a blank line in a sentence
  const first = notification.actors[0]?.displayName.trim() || labels.unknownUser;
  const others = Math.max(0, notification.actors.length - 1);


  switch (notification.kind) {
    case 'like':
      return labels.notifLike(first, others);
    case 'comment':
      return labels.notifComment(first, others);
    case 'reply':
      return labels.notifReply(first, others);
    case 'mention':
      return labels.notifMention(first, others);
    case 'connect_request':
      return labels.notifConnectRequest(first);
    case 'connect_accept':
      return labels.notifConnectAccept(first);
    default:
      return labels.notifGeneric(first);
  }
}







// -----------------------------------------------------------
// NotificationRow (default export)
// -----------------------------------------------------------
//
//   <NotificationRow notification={n}
//                    onPress={(n) => openSubject(n)} />
//
// Used by:
//   - src/index.ts — the public surface; hosts render one per
//     row of the activity screen's list
// -----------------------------------------------------------

export default function NotificationRow({
  notification,
  onPress,
}: {
  notification: KitNotification;
  // The row's single action — the host decides what 'open the
  // subject' means per kind
  onPress: (notification: KitNotification) => void;
}) {

  const { colors, fonts } = useKitTheme();
  const labels = useKitLabels();


  const unread = !notification.read;
  const ground = unread ? colors.unreadTint : colors.surface;
  const line = lineFor(notification, labels);
  const snippet = notification.subjectPreview ? clampSnippet(notification.subjectPreview, SNIPPET_LENGTH) : null;


  return (
    <Pressable
      testID={unread ? 'socialuikit-notification-row-unread' : 'socialuikit-notification-row'}
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={snippet ? `${line}. ${snippet}` : line}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: ground,
        opacity: pressed ? 0.92 : 1,
      })}
    >

      <ActorFaces actors={notification.actors} ringColor={ground} />

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text
            numberOfLines={2}
            style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.ink }}
          >
            {line}
          </Text>
          <RelativeTime iso={notification.newestAt} style={{ marginLeft: 8, fontSize: 12 }} />
        </View>
        {snippet ? (
          <Text numberOfLines={1} style={{ marginTop: 2, fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft }}>
            {snippet}
          </Text>
        ) : null}
      </View>

      {unread ? (
        <View
          testID="socialuikit-notification-dot"
          style={{ width: 8, height: 8, borderRadius: 4, marginLeft: 8, backgroundColor: colors.brand }}
        />
      ) : null}

    </Pressable>
  );
}
