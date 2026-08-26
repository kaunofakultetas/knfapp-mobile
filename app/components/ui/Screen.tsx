// -----------------------------------------------------------
//  [*] UI — Screen
//
//  The outermost element of every screen: a flex-1 bg-canvas
//  SafeAreaView. Edges default to [] on purpose — tab screens
//  sit between Header (which owns the top inset) and the tab
//  bar (which owns the bottom), so a wrapper that claimed the
//  insets too would double them; full-bleed screens pass their
//  own edges instead.
//
//  With `scroll` the children go into a ScrollView with
//  keyboardShouldPersistTaps="handled", so a tap on a button
//  lands on the first touch while the keyboard is open.
//  `padded` applies the standard md screen padding — on the
//  scroll CONTENT when scrolling, so the indicator still hugs
//  the screen edge.
// -----------------------------------------------------------

// Wrapper primitives
import React, { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';


interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
}







// -----------------------------------------------------------
// Screen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - every route screen under app/ — tabs and pushed screens
// -----------------------------------------------------------

export default function Screen({
  children,
  scroll = false,
  padded = false,
  edges = [],
}: ScreenProps) {
  if (scroll) {
    return (
      <SafeAreaView edges={edges} className="flex-1 bg-canvas">
        <ScrollView
          className="flex-1"
          contentContainerClassName={padded ? 'p-md' : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView
      edges={edges}
      className={padded ? 'flex-1 bg-canvas p-md' : 'flex-1 bg-canvas'}
    >
      {children}
    </SafeAreaView>
  );
}
