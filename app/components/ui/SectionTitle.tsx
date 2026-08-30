// -----------------------------------------------------------
//  [*] UI kit — SectionTitle
//
//  The small uppercase group label above settings and info
//  sections: xs Raleway bold, ink-soft, widest tracking.
//  Carries no margins of its own — the screen's layout owns
//  the spacing around it.
// -----------------------------------------------------------

// Label primitive
import type { ReactNode } from 'react';
import { Text } from 'react-native';


interface SectionTitleProps {
  children: ReactNode;
}







// -----------------------------------------------------------
// SectionTitle (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/settings.tsx — every settings group
//   - app/(main)/info/ — contacts / links / hours headings
// -----------------------------------------------------------

export default function SectionTitle({ children }: SectionTitleProps) {
  return (
    <Text className="font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
      {children}
    </Text>
  );
}
