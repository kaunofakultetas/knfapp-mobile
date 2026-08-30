// -----------------------------------------------------------
//  [*] socialuikit — ConnectButton
//
//  One relationship, one face: the button reads KitRelationship
//  and renders exactly the action(s) that state affords, firing
//  a plain verb back at the host — the kit never mutates a
//  relationship itself. The faces:
//
//    'none'      → primary  labels.connect   → 'connect'
//    'outgoing'  → subtle   labels.requested → 'cancel'
//    'incoming'  → primary  labels.accept    → 'accept'
//                  subtle   labels.decline   → 'decline'
//    'connected' → subtle   labels.connected → 'disconnect'
//    'blocking'  → subtle   labels.unblock   → 'unblock'
//    'self'      → nothing (you cannot connect to yourself)
//    'blockedBy' → nothing — a block must be invisible to its
//                  target, so this face NEVER advertises it
//
//  While `pending` (the host's request is in flight) every face
//  dims, stops accepting taps and reports disabled to the
//  reader, so a double-tap can never fire the verb twice.
//
//  Split into (root component last):
//
//    FaceButton    — one pill, primary or subtle
//    ConnectButton — the state switch (default export)
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';

import type { KitRelationship } from '../core/types';
import { useKitLabels, useKitTheme } from '../provider';


export type ConnectAction = 'connect' | 'cancel' | 'accept' | 'decline' | 'disconnect' | 'unblock';







// -----------------------------------------------------------
// FaceButton
// -----------------------------------------------------------
//
// One pill: brand fill for the primary action, chip ground for
// the subtle ones. The testID carries the ACTION, not the
// state, because 'incoming' draws two of these at once. The
// accessible name defaults to the visible label; the outgoing
// face overrides it with labels.cancelRequest, since its
// visible text names the status while the tap does the
// opposite.
//
// Used by:
//   - ConnectButton (below)
// -----------------------------------------------------------

function FaceButton({
  kind,
  label,
  action,
  pending,
  onAction,
  a11yLabel,
  grow = false,
}: {
  kind: 'primary' | 'subtle';
  label: string;
  action: ConnectAction;
  pending: boolean;
  onAction: (action: ConnectAction) => void;
  a11yLabel?: string;
  // The incoming pair splits its row evenly; lone faces size to
  // their container
  grow?: boolean;
}) {

  const { colors, fonts, radii } = useKitTheme();


  return (
    <Pressable
      testID={`socialuikit-connect-${action}`}
      // Belt and braces: `disabled` stops the event system, the
      // undefined handler stops a synthetic press in tests
      disabled={pending}
      onPress={pending ? undefined : () => onAction(action)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled: pending }}
      style={{
        height: 36,
        paddingHorizontal: 16,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: kind === 'primary' ? colors.brand : colors.chip,
        opacity: pending ? 0.5 : 1,
        flex: grow ? 1 : undefined,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fonts.medium,
          fontSize: 14,
          color: kind === 'primary' ? colors.onBrand : colors.chipInk,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ConnectButton (default export)
// -----------------------------------------------------------
//
// Used by:
//   - the host's profile screen — usually dropped into
//     ProfileHeader's actions slot
//   - the host's connection request lists
// -----------------------------------------------------------

export default function ConnectButton({
  state,
  pending = false,
  onAction,
}: {
  state: KitRelationship;
  pending?: boolean;
  onAction: (action: ConnectAction) => void;
}) {

  const labels = useKitLabels();


  // Your own profile carries no relationship button; a block by
  // the other side renders NOTHING — never a disabled face, which
  // would still advertise the block to its target
  if (state === 'self' || state === 'blockedBy') return null;


  if (state === 'incoming') {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FaceButton kind="primary" label={labels.accept} action="accept" pending={pending} onAction={onAction} grow />
        <FaceButton kind="subtle" label={labels.decline} action="decline" pending={pending} onAction={onAction} grow />
      </View>
    );
  }


  if (state === 'none') {
    return <FaceButton kind="primary" label={labels.connect} action="connect" pending={pending} onAction={onAction} />;
  }

  if (state === 'outgoing') {
    return (
      <FaceButton
        kind="subtle"
        label={labels.requested}
        action="cancel"
        pending={pending}
        onAction={onAction}
        a11yLabel={labels.cancelRequest}
      />
    );
  }

  if (state === 'connected') {
    return <FaceButton kind="subtle" label={labels.connected} action="disconnect" pending={pending} onAction={onAction} />;
  }


  return <FaceButton kind="subtle" label={labels.unblock} action="unblock" pending={pending} onAction={onAction} />;
}
