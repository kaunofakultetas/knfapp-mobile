// -----------------------------------------------------------
//  [*] socialuikit — ProfileHeader
//
//  The top of a profile screen: the large portrait, the name
//  and handle, the bio (folded at four lines), the post and
//  connection tallies, and an actions slot the host fills —
//  typically with a ConnectButton wired to its own mutation.
//  Display truth only: every number arrives pre-counted in
//  profile.counts and is compacted with formatCount; a missing
//  tally shows as 0, never as a blank cell, so the row keeps
//  its shape while a profile loads.
//
//  The connections tally becomes a press target only when the
//  host passes onPressConnections — without a destination the
//  cell is plain text, not a dead button.
//
//  Split into (root component last):
//
//    HeaderAvatar  — photo via env.resolveImageUrl, initial disc
//                    fallback; honours components.Avatar
//    CountCell     — one tally, pressable when it leads somewhere
//    ProfileHeader — the header itself (default export)
// -----------------------------------------------------------

import { Image as ExpoImage } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { formatCount } from '../core/format';
import type { KitProfile, KitUser } from '../core/types';
import { useKitComponents, useKitEnv, useKitLabels, useKitTheme } from '../provider';


// Diameter of the portrait in dp — the profile is the one place
// the kit draws it large
const AVATAR_SIZE = 72;







// -----------------------------------------------------------
// HeaderAvatar
// -----------------------------------------------------------
//
// The host's components.Avatar wins when supplied, so the
// profile portrait matches every other portrait the host
// redrew. The default: the photo through env.resolveImageUrl
// (a stored path becomes loadable), and when there is no URL —
// or the URL is dead — the first glyph of the display name on
// a brand-washed disc. Spread iterates code points, not UTF-16
// units, so an emoji-leading name keeps its whole first glyph.
//
// Used by:
//   - ProfileHeader (below)
// -----------------------------------------------------------

function HeaderAvatar({ user }: { user: KitUser }) {

  const { colors, fonts } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const { Avatar } = useKitComponents();


  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatarUrl]);


  if (Avatar) return <Avatar user={user} size={AVATAR_SIZE} />;


  if (user.avatarUrl && !failed) {
    return (
      <ExpoImage
        testID="socialuikit-profile-avatar-image"
        source={{ uri: resolveImageUrl(user.avatarUrl) }}
        style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
        contentFit="cover"
        transition={100}
        accessibilityIgnoresInvertColors
        onError={() => setFailed(true)}
      />
    );
  }


  const initial = [...user.displayName.trim()][0]?.toUpperCase() ?? '?';

  return (
    <View
      style={{
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.brandSoft,
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: AVATAR_SIZE * 0.42, color: colors.brand }}>{initial}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// CountCell
// -----------------------------------------------------------
//
// One tally: the compacted number over its label. With onPress
// it is a real button whose accessible name carries both parts
// ('8 Ryšiai'); without one it stays plain text — no role, no
// dead tap target.
//
// Used by:
//   - ProfileHeader (below) — posts (never pressable) and
//     connections (pressable when the host routes it)
// -----------------------------------------------------------

function CountCell({
  testID,
  count,
  label,
  onPress,
}: {
  testID: string;
  count: number;
  label: string;
  onPress?: () => void;
}) {

  const { colors, fonts } = useKitTheme();


  const body = (
    <>
      <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink }}>{formatCount(count)}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.inkFaint, marginTop: 1 }}>{label}</Text>
    </>
  );


  if (!onPress) {
    return (
      <View testID={testID} style={{ alignItems: 'center' }}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${formatCount(count)} ${label}`}
      style={{ alignItems: 'center' }}
    >
      {body}
    </Pressable>
  );
}







// -----------------------------------------------------------
// ProfileHeader (default export)
// -----------------------------------------------------------
//
// Used by:
//   - the host's profile screen, above that person's post feed
// -----------------------------------------------------------

export default function ProfileHeader({
  profile,
  actions,
  onPressConnections,
  onPressAvatar,
}: {
  profile: KitProfile;
  // The host drops a ConnectButton (or its own controls) here
  actions?: ReactNode;
  onPressConnections?: () => void;
  onPressAvatar?: () => void;
}) {

  const { colors, fonts } = useKitTheme();
  const labels = useKitLabels();


  const { user, bio, counts } = profile;

  // Handles are stored bare or already prefixed, host by host —
  // normalise so the line never reads '@@ona'
  const handle = user.handle ? `@${user.handle.replace(/^@/, '')}` : null;


  const avatar = <HeaderAvatar user={user} />;


  return (
    <View testID="socialuikit-profile-header" style={{ padding: 16, backgroundColor: colors.surface }}>

      {/* Portrait left, tallies spread over the remaining width —
          the classic profile top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {onPressAvatar ? (
          <Pressable
            onPress={onPressAvatar}
            accessibilityRole="button"
            accessibilityLabel={labels.avatarA11y(user.displayName)}
          >
            {avatar}
          </Pressable>
        ) : (
          avatar
        )}

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-evenly', marginLeft: 12 }}>
          <CountCell testID="socialuikit-profile-posts" count={counts?.posts ?? 0} label={labels.profilePosts} />
          <CountCell
            testID="socialuikit-profile-connections"
            count={counts?.connections ?? 0}
            label={labels.profileConnections}
            onPress={onPressConnections}
          />
        </View>
      </View>


      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginTop: 12 }}>{user.displayName.trim() || labels.unknownUser}</Text>
      {handle ? (
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft, marginTop: 1 }}>{handle}</Text>
      ) : null}

      {bio ? (
        <Text
          numberOfLines={4}
          style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.ink, marginTop: 8 }}
        >
          {bio}
        </Text>
      ) : null}


      {actions ? <View style={{ marginTop: 12 }}>{actions}</View> : null}

    </View>
  );
}
