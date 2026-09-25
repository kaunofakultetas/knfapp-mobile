// -----------------------------------------------------------
//  [*] TimetableHost — the app's TimetableProvider wiring
//
//  Maps the app's world onto @knf/timetableuikit's seams the
//  same way ChatUiKitHost does for the chat kit: the ACTIVE
//  palette rides in wholesale (its token names are a structural
//  superset of the kit's — only nowLine needs picking, and the
//  accent red reads as "current minute" without fighting the
//  burgundy brand), the Raleway family fills the four font
//  roles, and the kit's own LT/EN catalogs follow the app
//  language through the locale prop. Mounted around the
//  timetable views only — no other screen renders this kit.
//
//  Two deliberate single sources. The COPY: no labels prop —
//  the kit's catalogs (packages/timetableuikit/src/provider/
//  labels.ts) are the one home of every string the timetable
//  chrome draws (day names, view modes, the overlap banner,
//  kinds, subgroups); the app catalogs keep only the
//  screen's own strings, so no translator edits a twin that
//  never reaches the screen (KNF-185). The CLOCK: formatTime
//  is the engine's formatMinutes, the zero-padded "09:45"
//  the list cards and the detail sheet print too — the grid
//  used to fall back to an unpadded "9:45" of its own
//  (KNF-184). Both app locales run 24-hour clocks; a 12-hour
//  one would change this one function.
//
//  Used by:
//    - app/(main)/tabs/schedule.tsx — day/week timetable views
// -----------------------------------------------------------

import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formatMinutes } from '@knf/timetableengine';
import { TimetableProvider, type TimetableTheme } from '@knf/timetableuikit';

import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';







// -----------------------------------------------------------
// TimetableHost (default export)
// -----------------------------------------------------------
//
// One theme object, memoized per palette change: the active
// palette spread wholesale with nowLine picked from accent,
// and the four Raleway families named into the kit's font
// roles; the locale prop tracks the app language live and
// the engine's formatMinutes is the clock (a module function
// — a stable identity, so the env memo never churns).
//
// Used by:
//   - app/(main)/tabs/schedule.tsx — wraps the timetable views
// -----------------------------------------------------------

export default function TimetableHost({ children }: { children: ReactNode }) {

  const { colors } = useTheme();
  const { i18n } = useTranslation();

  const theme = useMemo<TimetableTheme>(
    () => ({
      colors: { ...colors, nowLine: colors.accent },
      fonts: {
        regular: fonts.regular,
        medium: fonts.medium,
        semiBold: fonts.semiBold,
        bold: fonts.bold,
      },
    }),
    [colors],
  );

  return (
    <TimetableProvider theme={theme} locale={i18n.language === 'lt' ? 'lt' : 'en'} formatTime={formatMinutes}>
      {children}
    </TimetableProvider>
  );
}
