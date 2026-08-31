// -----------------------------------------------------------
//  [*] socialuikit — RowErrorBoundary
//
//  The seal around every feed row: a render throw inside one
//  post is caught here and swapped for a compact fallback row,
//  so one malformed post never takes the whole list down. The
//  fallback carries the row-failed notice and a try-again link
//  that clears the boundary — the children render fresh, which
//  is enough when the throw came from transient data the host
//  has since replaced. FeedList keys each boundary by the row's
//  identity, so a NEW item under the list never inherits an old
//  row's failure.
//
//  Split into (root component last):
//
//    FailedRow        — the fallback the reader sees
//    RowErrorBoundary — the boundary (default export)
// -----------------------------------------------------------

// Theme
import { useKitLabels, useKitTheme } from '../provider';

// Primitives
import { Component, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';







// -----------------------------------------------------------
// FailedRow
// -----------------------------------------------------------
//
// A hook-reading function component, because the class above it
// cannot touch the provider's context hooks itself. Card-shaped
// like a post so a failed row does not jolt the feed's rhythm.
//
// Used by:
//   - RowErrorBoundary (below)
// -----------------------------------------------------------

function FailedRow({ onReset }: { onReset: () => void }) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();


  return (
    <View
      testID="socialuikit-row-error"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginHorizontal: 12,
        marginVertical: 6,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      <Text style={{ flex: 1, color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, marginRight: 12 }}>
        {labels.rowFailed}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={labels.tryAgain} hitSlop={8} onPress={onReset}>
        <Text style={{ color: colors.brand, fontFamily: fonts.medium, fontSize: 14 }}>{labels.tryAgain}</Text>
      </Pressable>
    </View>
  );
}







// -----------------------------------------------------------
// RowErrorBoundary (default export)
// -----------------------------------------------------------
//
// A class because error boundaries have no hook equivalent.
//
// Used by:
//   - FeedList.tsx — around every cell it renders
//   - a host wrapping rows of its own custom list
// -----------------------------------------------------------

export default class RowErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {

  state = { failed: false };

  // The render-phase half: React swaps the subtree for the
  // fallback in the same pass the row threw in
  static getDerivedStateFromError() {
    return { failed: true };
  }

  // The commit-phase half; the error is swallowed on purpose —
  // a bad post is a row-level event, not a feed-level one, and
  // the kit has no reporting seam to hand it to
  componentDidCatch() {}

  // Try-again just clears the flag: the children mount fresh,
  // and a row that throws again lands straight back here
  reset = () => {
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) return <FailedRow onReset={this.reset} />;
    return this.props.children;
  }
}
