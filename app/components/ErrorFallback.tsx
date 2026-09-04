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
//  thing that crashed). Colors come straight from the static
//  palette matching the OS scheme; i18n works through the
//  global instance loaded by the '@/i18n' import chain.
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

// App version for the crash-report mail body
import Constants from 'expo-constants';

// The buffered failure trail rides along in the report mail
import { getErrorLog } from '@/services/log';

import { useTranslation } from 'react-i18next';
import { Appearance, Platform, Pressable, Text, View } from 'react-native';


// Report address; subject and body are built per crash
const SUPPORT_EMAIL = 'support@vu.lt';

// Fallback subject in case i18n itself is what crashed
const REPORT_SUBJECT_FALLBACK = 'KNF App Error';

// The crash screen follows the OS scheme via the static
// Appearance API — the theme context that knows the in-app
// override may itself be what crashed, so the override is
// deliberately ignored here
// The scheme type now carries an 'unspecified' member — only
// an explicit 'dark' earns the dark palette
const c = palettes[Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'];







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


  const detail = error instanceof Error ? error.message : null;


  // The draft opens pre-filled with what support needs: the
  // raw error, app version, platform and a timestamp. Devices
  // without a mail handler reject openURL — the crash screen
  // must never crash again, so every failure is swallowed
  const reportIssue = async () => {

    // i18n may be the thing that crashed — fall back to the
    // English literal rather than throwing again
    let subject = REPORT_SUBJECT_FALLBACK;
    try {
      subject = t('error.reportSubject');
    } catch {
      // keep the fallback literal
    }


    // The last few logError lines — the swallowed failures
    // leading up to the crash often name the real cause; capped
    // so the mailto URL stays within every handler's limits
    const trail = getErrorLog().slice(-10);

    const body = [
      detail ?? String(error),
      `App: ${Constants.expoConfig?.version ?? 'unknown'}`,
      `OS: ${Platform.OS} ${Platform.Version}`,
      `Time: ${new Date().toISOString()}`,
      ...(trail.length ? ['', 'Recent errors:', ...trail] : []),
    ].join('\n');


    try {
      await Linking.openURL(
        `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      );
    } catch {
      // no mail app — nothing more we can do from here
    }
  };


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
          selectable
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
