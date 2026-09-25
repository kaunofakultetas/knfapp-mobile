// -----------------------------------------------------------
//  [*] UI kit — SectionTitle
//
//  The small uppercase group label above settings and info
//  sections: xs Raleway bold, ink-soft, widest tracking.
//  Carries no margins of its own — the screen's layout owns
//  the spacing around it. It IS a heading to assistive tech:
//  VoiceOver's rotor and TalkBack's heading navigation jump
//  section to section on it, in the app's language.
// -----------------------------------------------------------

// Label primitive, announced in the app's language
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';


interface SectionTitleProps {
  children: ReactNode;
}







// -----------------------------------------------------------
// SectionTitle (default export)
// -----------------------------------------------------------
//
// Deliberately typography-only: one Text pinning the group-
// label look in a single place — margin-free, so screens own
// the spacing and headings never fight their layouts.
//
// Used by:
//   - app/(main)/tabs/settings.tsx — every settings group
//   - app/(main)/info/ — contacts / links / hours headings
// -----------------------------------------------------------

export default function SectionTitle({ children }: SectionTitleProps) {

  const { i18n } = useTranslation();


  return (
    <Text
      className="font-raleway-bold text-xs uppercase tracking-widest text-ink-soft"
      accessibilityRole="header"
      accessibilityLanguage={i18n?.language}
    >
      {children}
    </Text>
  );
}
