// -----------------------------------------------------------
//  [*] assistantuikit — AssistantErrorBanner
//
//  The strip that appears when the message in scope ended in
//  an error: the host's title and body, the runtime's own
//  message underneath (a transport failure names itself
//  there), and a retry button that calls whatever the host
//  wired — in AssistantThread that is a reload of the failed
//  message. The upstream error primitives decide the
//  visibility: they read the message scope they are rendered
//  in and render nothing while it carries no error, so the
//  banner needs no state of its own and must sit under a
//  message provider (the thread places it under the LAST
//  message's). The strip is an ALERT to assistive tech — it
//  appears without the reader asking — and every line is
//  drawn in the host's families.
//
//  Used by:
//    - AssistantThread.tsx — above the composer, last message scope
//    - hosts composing their own thread
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { ErrorPrimitive } from '@assistant-ui/react-native';

import { typeface } from './core/typography';
import { defaultColors, defaultFonts, type AssistantColors, type AssistantFonts, type AssistantLabels } from './core/types';







// -----------------------------------------------------------
// AssistantErrorBanner (default export)
// -----------------------------------------------------------
//
// Holds no state: the error primitives read the message
// scope above and render nothing while it carries no error.
// The retry button calls `onRetry` verbatim — wiring the
// actual reload is the host's job.
//
// Used by:
//   - AssistantThread.tsx — above the composer, last message
//     scope
//   - hosts composing their own thread
// -----------------------------------------------------------

export default function AssistantErrorBanner({
  labels,
  colors = defaultColors,
  fonts = defaultFonts,
  onRetry,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  fonts?: AssistantFonts;
  onRetry: () => void;
}) {
  return (
    <ErrorPrimitive.Root
      testID="assistantuikit-error"
      // Announced when it appears — VoiceOver reads an alert,
      // TalkBack a polite live region
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.danger,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ fontSize: 14, ...typeface(fonts, 'semibold'), color: colors.danger, marginBottom: 2 }}>{labels.errorTitle}</Text>
      <Text style={{ fontSize: 13, lineHeight: 18, ...typeface(fonts, 'regular'), color: colors.ink }}>{labels.errorBody}</Text>
      {/* The runtime's own words — the code and status of the
          failure, kept visible and selectable on purpose:
          students report problems by screenshot */}
      <ErrorPrimitive.Message
        selectable
        style={{ fontSize: 12, lineHeight: 16, ...typeface(fonts, 'regular'), color: colors.inkSoft, marginTop: 4 }}
      />
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{
            paddingHorizontal: 16,
            borderRadius: 10,
            backgroundColor: colors.brand,
            // The platform touch-target floor — students retry
            // this exact button on bad dorm Wi-Fi
            minHeight: 44,
            minWidth: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 13, ...typeface(fonts, 'semibold'), color: colors.onBrand }}>{labels.retry}</Text>
        </Pressable>
      </View>
    </ErrorPrimitive.Root>
  );
}
