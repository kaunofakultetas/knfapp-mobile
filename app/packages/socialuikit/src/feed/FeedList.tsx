// -----------------------------------------------------------
//  [*] socialuikit — FeedList
//
//  The scaffold under a social feed: a plain TOP-DOWN FlatList
//  (newest post first — none of a chat list's inverted-list
//  mechanics) over host-shaped rows the kit never inspects.
//  Every cell is sealed in its own RowErrorBoundary, and the
//  host's renderItem is EVALUATED inside that boundary through
//  a thunk — even a renderItem that throws synchronously fails
//  one row, never the list.
//
//  Paging: onEndReached fires only while hasMore && !loadingMore,
//  and never on the zero/negative distances the mount and layout
//  passes emit before the reader scrolls; loadingMore shows the
//  footer spinner. Pull-to-refresh mounts only when the host
//  hands in onRefresh. The new-posts pill overlays the top while
//  newCount > 0 — pressing it calls onPressNew AND scrolls back
//  to the top, so the merged posts land in view.
//
//  Rendering is tuned for card-sized rows: initialNumToRender
//  covers the first window even if every row is as short as
//  rows get (a 140dp floor), windowSize stays at 9, offscreen
//  subtrees are clipped, and batches stay small — Android pays
//  more per batch, so it renders one card at a time. flatListProps
//  is the escape hatch for the rest; the kit's own props are
//  spread AFTER it, so on any clash the kit wins.
//
//  Split into (root component last):
//
//    RowBody       — evaluates renderItem inside the boundary
//    FooterSpinner — the loading-more footer
//    FeedList      — the list (default export)
// -----------------------------------------------------------

// Feed chrome
import NewPostsPill from './NewPostsPill';
import GapRow from './GapRow';
import RowErrorBoundary from './RowErrorBoundary';
import { useKitTheme } from '../provider';

// Primitives
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, Platform, RefreshControl, View, useWindowDimensions, type FlatListProps, type ListRenderItemInfo, type StyleProp, type ViewStyle } from 'react-native';


// The shortest a feed card gets (a one-line text post); real
// heights are unknown before layout, so the first-screen row
// count is derived pessimistically from this floor
const MIN_ROW_HEIGHT = 140;


export interface FeedListProps<T> {
  // The rows in display order — the kit never sorts or dedupes
  items: readonly T[];
  // Stable identity per row; cells and their boundaries key on it
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  // The id of the last row ABOVE an unfilled hole (a data
  // layer's gapAfterId) — a GapRow renders right under it
  gapAfterKey?: string | null;
  onFillGap?: () => void;
  fillingGap?: boolean;

  // Paging off the bottom edge
  onEndReached?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;

  // Pull-to-refresh; without onRefresh no control is mounted
  refreshing?: boolean;
  onRefresh?: () => void;

  // The new-posts pill; the host counts what waits above
  newCount?: number;
  onPressNew?: () => void;

  ListHeaderComponent?: FlatListProps<T>['ListHeaderComponent'];
  ListEmptyComponent?: FlatListProps<T>['ListEmptyComponent'];
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Escape hatch for the rest of FlatList; the kit's own props
  // win on any clash
  flatListProps?: Partial<FlatListProps<T>>;
}







// -----------------------------------------------------------
// RowBody
// -----------------------------------------------------------
//
// The thunk seam: renderItem is CALLED here, inside the
// boundary's subtree — called directly in the cell renderer,
// its throw would climb past the boundary and fell the list.
//
// Used by:
//   - FeedList (below), one per cell
// -----------------------------------------------------------

function RowBody({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}







// -----------------------------------------------------------
// FooterSpinner
// -----------------------------------------------------------
//
// Used by:
//   - FeedList (below), while loadingMore
// -----------------------------------------------------------

function FooterSpinner({ color }: { color: string }) {
  return (
    <View testID="socialuikit-feed-spinner" style={{ alignItems: 'center', paddingVertical: 16 }}>
      <ActivityIndicator size="small" color={color} />
    </View>
  );
}







// -----------------------------------------------------------
// FeedList (default export)
// -----------------------------------------------------------
//
// Used by:
//   - the host's feed, profile-posts and topic screens
// -----------------------------------------------------------

export default function FeedList<T>({
  items,
  keyOf,
  renderItem,
  onEndReached,
  hasMore = false,
  loadingMore = false,
  refreshing = false,
  onRefresh,
  newCount = 0,
  onPressNew,
  gapAfterKey = null,
  onFillGap,
  fillingGap = false,
  ListHeaderComponent,
  ListEmptyComponent,
  contentContainerStyle,
  flatListProps,
}: FeedListProps<T>) {

  const { colors } = useKitTheme();
  const listRef = useRef<FlatList<T>>(null);
  const { height: windowHeight } = useWindowDimensions();
  const initialNumToRender = Math.max(1, Math.ceil(windowHeight / MIN_ROW_HEIGHT));


  const keyExtractor = useCallback((item: T) => keyOf(item), [keyOf]);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<T>) => (
      <>
        <RowErrorBoundary>
          <RowBody render={() => renderItem(item)} />
        </RowErrorBoundary>
        {gapAfterKey !== null && keyOf(item) === gapAfterKey ? <GapRow filling={fillingGap} onPress={onFillGap} /> : null}
      </>
    ),
    [renderItem, gapAfterKey, keyOf, fillingGap, onFillGap],
  );


  // Mount and layout passes fire onEndReached with a zero or
  // negative distance before the reader ever scrolls — those
  // must not burn a page; loadingMore gates the double-fire a
  // slow page would otherwise cause
  const handleEndReached = ({ distanceFromEnd }: { distanceFromEnd: number }) => {
    if (distanceFromEnd <= 0) return;
    if (!hasMore || loadingMore) return;
    onEndReached?.();
  };


  // Merging the waiting posts always lands the reader at the
  // top, where they were just told the posts are
  const handlePressNew = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onPressNew?.();
  };


  return (
    <View style={{ flex: 1 }}>

      <FlatList
        {...flatListProps}
        ref={listRef}
        testID="socialuikit-feed-list"
        data={items}
        keyExtractor={keyExtractor}
        // Cells re-render only when data or extraData move — the
        // gap marker and its spinner live OUTSIDE the item data,
        // so they ride here or a filling state never paints
        extraData={`${gapAfterKey ?? ''}:${fillingGap ? 1 : 0}`}
        renderItem={renderRow}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={loadingMore ? <FooterSpinner color={colors.brand} /> : null}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              testID="socialuikit-feed-refresh"
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
        contentContainerStyle={contentContainerStyle}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={initialNumToRender}
        maxToRenderPerBatch={Platform.OS === 'ios' ? 5 : 1}
        windowSize={9}
      />

      {/* Hides itself at zero, so the count alone drives it */}
      <NewPostsPill count={newCount} onPress={handlePressNew} />

    </View>
  );
}
