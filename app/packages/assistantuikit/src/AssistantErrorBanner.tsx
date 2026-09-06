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
//  message's).
//
//  Used by:
//    - AssistantThread.tsx — above the composer, last message scope
//    - hosts composing their own thread
// -----------------------------------------------------------

import { Pressable, Text, View } from 'react-native';
import { ErrorPrimitive } from '@assistant-ui/react-native';

import { defaultColors, type AssistantColors, type AssistantLabels } from './core/types';


export default function AssistantErrorBanner({
  labels,
  colors = defaultColors,
  onRetry,
}: {
  labels: AssistantLabels;
  colors?: AssistantColors;
  onRetry: () => void;
}) {
  return (
    <ErrorPrimitive.Root
      testID="assistantuikit-error"
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
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger, marginBottom: 2 }}>{labels.errorTitle}</Text>
      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.ink }}>{labels.errorBody}</Text>
      <ErrorPrimitive.Message style={{ fontSize: 12, lineHeight: 16, color: colors.inkSoft, marginTop: 4 }} />
      <View style={{ flexDirection: 'row', marginTop: 10 }}>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.brand }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.onBrand }}>{labels.retry}</Text>
        </Pressable>
      </View>
    </ErrorPrimitive.Root>
  );
}
