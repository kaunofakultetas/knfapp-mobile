// -----------------------------------------------------------
//  [*] ErrorFallback — the crash screen of last resort
//
//  Rendered by the root ErrorBoundary when anything in the
//  tree throws. The boundary sits OUTSIDE every provider, so
//  this screen must be fully self-contained: no useTheme()/
//  useApp() (they would throw again inside the crash
//  handler), no UI-kit components (Button reads the theme
//  context), and no className color tokens (their CSS
//  variables live on the ThemedShell View, which may be the
//  thing that crashed). Colors come straight from the light
//  palette; i18n works through the global instance loaded by
//  the '@/i18n' import chain.
//
//  The translated message leads; the raw technical error text
//  is shown small underneath so axios/JS internals never
//  headline the screen.
// -----------------------------------------------------------

// Crash-boundary plumbing
import { FallbackProps } from 'react-error-boundary';

// Static palette — no context available here
import { fonts, palettes } from '@/constants/theme';

// Mail composer for the report button
import * as Linking from 'expo-linking';

import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';


// Pre-filled support address; the subject is URL-encoded
const SUPPORT_MAILTO = 'mailto:support@vu.lt?subject=KNF%20App%20Error';

// The crash screen always renders the light palette — the
// theme context that knows the user's choice may itself be
// what crashed
const c = palettes.light;







// -----------------------------------------------------------
// FallbackButton
// -----------------------------------------------------------
//
// A context-free stand-in for the kit Button — plain Pressable
// with static palette colors.
//
// Used by:
//   - ErrorFallback (below)
// -----------------------------------------------------------

function FallbackButton({
  title,
  onPress,
  outline,
}: {
  title: string;
  onPress: () => void;
  outline?: boolean;
}) {

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 48,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: outline ? 'transparent' : pressed ? c.brandStrong : c.brand,
        borderWidth: outline ? 1 : 0,
        borderColor: c.brand,
        opacity: outline && pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fonts.medium,
          fontSize: 16,
          color: outline ? c.brand : c.onBrand,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ErrorFallback (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/_layout.tsx — FallbackComponent of the root
//     ErrorBoundary
// -----------------------------------------------------------

export default function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {

  const { t } = useTranslation();


  // Devices without a mail handler reject openURL — the crash
  // screen must never crash again, so the rejection is
  // swallowed on purpose
  const reportIssue = async () => {
    try {
      await Linking.openURL(SUPPORT_MAILTO);
    } catch {
      // no mail app — nothing more we can do from here
    }
  };


  const detail = error instanceof Error ? error.message : null;


  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        backgroundColor: c.canvas,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: 24,
          color: c.ink,
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        {t('error.title')}
      </Text>
      <Text
        style={{
          fontFamily: fonts.regular,
          fontSize: 16,
          color: c.inkSoft,
          textAlign: 'center',
        }}
      >
        {t('error.unexpected')}
      </Text>
      {detail ? (
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 12,
            color: c.inkFaint,
            textAlign: 'center',
            marginTop: 8,
          }}
          numberOfLines={4}
        >
          {detail}
        </Text>
      ) : null}

      <View style={{ width: '100%', marginTop: 32, gap: 16 }}>
        <FallbackButton title={t('common.tryAgain')} onPress={resetErrorBoundary} />
        <FallbackButton title={t('common.reportIssue')} onPress={reportIssue} outline />
      </View>
    </View>
  );
}

// Named alias — app/_layout.tsx imports { ErrorFallback }
export { ErrorFallback };
