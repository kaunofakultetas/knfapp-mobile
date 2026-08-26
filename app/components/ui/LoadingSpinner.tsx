// -----------------------------------------------------------
//  [*] UI kit — LoadingSpinner
//
//  Brand-tinted ActivityIndicator with an optional caption.
//  As `overlay` it fills its parent with the scrim token and
//  floats the spinner on a small surface card, so the caption
//  stays readable over any content in either scheme — the
//  old overlay flashed rgba-white across dark UIs.
//
//  Callers pass already-translated `text`; the component
//  renders no strings of its own.
// -----------------------------------------------------------

// Spinner and caption primitives
import { ActivityIndicator, Text, View } from 'react-native';

// Brand tint for the active scheme
import { useTheme } from '@/hooks/useTheme';


interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  text?: string;
  overlay?: boolean;
}







// -----------------------------------------------------------
// LoadingSpinner (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/_layout.tsx — the font-loading gate
//   - app/(main)/tabs/* and other data screens — first-load
//     states from useLoad / useFeed
//   - app/(main)/chat-room/ — history loading
// -----------------------------------------------------------

export default function LoadingSpinner({
  size = 'large',
  text,
  overlay = false,
}: LoadingSpinnerProps) {

  const { colors } = useTheme();


  const content = (
    <>
      <ActivityIndicator size={size} color={colors.brand} />
      {text && <Text className="mt-md font-raleway text-base text-ink-soft">{text}</Text>}
    </>
  );


  // The scrim fill also swallows touches, blocking the UI
  // underneath for the duration of the wait
  if (overlay) {
    return (
      <View className="absolute inset-0 z-50 items-center justify-center bg-scrim">
        <View className="items-center rounded-xl bg-surface px-xl py-lg">{content}</View>
      </View>
    );
  }


  return <View className="items-center justify-center p-lg">{content}</View>;
}

// Named alongside the default so the ui barrel can `export *`
export { LoadingSpinner };
