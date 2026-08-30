// -----------------------------------------------------------
//  [*] chatuikit — ConnectionBanner
//
//  The slim strip above the list while the realtime door is
//  not open: a spinner with "Connecting…" while the socket
//  works on it, a quiet "No connection" while the device is
//  offline. `state` null draws nothing — the host maps its
//  engine status / network flag; the kit only paints.
//
//  Used by:
//    - the host's chat room, above MessageList
// -----------------------------------------------------------

// Theme + labels
import { useKitLabels, useKitTheme } from '../provider';

// Rendering
import { ActivityIndicator, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';


export default function ConnectionBanner({ state }: { state: 'connecting' | 'offline' | null }) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();


  if (!state) return null;


  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(120)}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      testID="chatuikit-connection"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 5,
        backgroundColor: colors.surfaceSoft,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      {state === 'connecting' ? <ActivityIndicator size={10} color={colors.inkSoft} style={{ marginRight: 6 }} /> : null}
      <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 15, color: colors.inkSoft }}>
        {state === 'connecting' ? labels.connecting : labels.noConnection}
      </Text>
    </Animated.View>
  );
}
