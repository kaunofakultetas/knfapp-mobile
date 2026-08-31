// -----------------------------------------------------------
//  [*] Tests — socialuikit feed chrome
//
//  The scaffold's promises, pinned: one throwing row falls back
//  alone while its siblings render (and try-again clears the
//  boundary), onEndReached ignores the mount-time zero/negative
//  misfires and stays inert without hasMore or during a page,
//  the new-posts pill hides at zero and its press both scrolls
//  to the top and reports to the host, pull-to-refresh mounts
//  only when wired, the footer spinner tracks loadingMore, and
//  the kit's own FlatList props win over flatListProps.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, FlatList, Platform, Text } from 'react-native';

import FeedList from '../FeedList';
import NewPostsPill from '../NewPostsPill';
import RowErrorBoundary from '../RowErrorBoundary';


type Item = { id: string; body: string };
const makeItems = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, body: `post ${i}` }));
const keyOf = (item: Item) => item.id;
const renderRow = (item: Item) => <Text>{item.body}</Text>;
const baseProps = { items: makeItems(3), keyOf, renderItem: renderRow };

// React logs every boundary-caught throw through console.error —
// noise here, signal nowhere
const silenced = (): jest.SpyInstance => jest.spyOn(console, 'error').mockImplementation(() => {});




describe('RowErrorBoundary', () => {

  it('contains one throwing row while its siblings render', async () => {
    const silence = silenced();
    const Bomb = (): null => {
      throw new Error('row exploded');
    };
    const r = await render(
      <FeedList
        items={makeItems(3)}
        keyOf={keyOf}
        renderItem={(item) => (item.id === 'p1' ? <Bomb /> : <Text>{item.body}</Text>)}
      />,
    );

    expect(r.getByText('post 0')).toBeTruthy();
    expect(r.getByText('post 2')).toBeTruthy();
    expect(r.queryByText('post 1')).toBeNull();
    expect(r.getByTestId('socialuikit-row-error')).toBeTruthy();
    expect(r.getByText('Šio įrašo parodyti nepavyko')).toBeTruthy();
    silence.mockRestore();
  });


  it('resets through the try-again link and renders the recovered row', async () => {
    const silence = silenced();
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error('first render only');
      return <Text>recovered</Text>;
    };
    const r = await render(
      <RowErrorBoundary>
        <Flaky />
      </RowErrorBoundary>,
    );
    expect(r.getByTestId('socialuikit-row-error')).toBeTruthy();
    expect(r.queryByText('recovered')).toBeNull();

    shouldThrow = false;
    await fireEvent.press(r.getByText('Bandyti dar kartą'));
    expect(r.queryByTestId('socialuikit-row-error')).toBeNull();
    expect(r.getByText('recovered')).toBeTruthy();
    silence.mockRestore();
  });
});




describe('NewPostsPill', () => {

  it('renders nothing at zero and a labelled button above it', async () => {
    const r = await render(<NewPostsPill count={0} onPress={() => {}} />);
    expect(r.queryByTestId('socialuikit-new-posts-pill')).toBeNull();

    await r.rerender(<NewPostsPill count={2} onPress={() => {}} />);
    expect(r.getByTestId('socialuikit-new-posts-pill')).toBeTruthy();
    expect(r.getByRole('button', { name: '2 nauji įrašai' })).toBeTruthy();
  });
});




describe('FeedList', () => {

  it('ignores endReached misfires and pages only while hasMore and not loading', async () => {
    const onEndReached = jest.fn();
    const r = await render(<FeedList {...baseProps} hasMore onEndReached={onEndReached} />);
    const list = r.getByTestId('socialuikit-feed-list');

    // The mount/layout passes report zero or negative distance
    await act(async () => list.props.onEndReached({ distanceFromEnd: 0 }));
    await act(async () => list.props.onEndReached({ distanceFromEnd: -24 }));
    expect(onEndReached).not.toHaveBeenCalled();

    await act(async () => list.props.onEndReached({ distanceFromEnd: 80 }));
    expect(onEndReached).toHaveBeenCalledTimes(1);

    // No further pages to ask for
    await r.rerender(<FeedList {...baseProps} hasMore={false} onEndReached={onEndReached} />);
    await act(async () => r.getByTestId('socialuikit-feed-list').props.onEndReached({ distanceFromEnd: 80 }));
    expect(onEndReached).toHaveBeenCalledTimes(1);

    // A page already in flight
    await r.rerender(<FeedList {...baseProps} hasMore loadingMore onEndReached={onEndReached} />);
    await act(async () => r.getByTestId('socialuikit-feed-list').props.onEndReached({ distanceFromEnd: 80 }));
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });


  it('hides the pill at zero; pressing it scrolls to the top and reports', async () => {
    const onPressNew = jest.fn();
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
    const r = await render(<FeedList {...baseProps} newCount={0} onPressNew={onPressNew} />);
    expect(r.queryByTestId('socialuikit-new-posts-pill')).toBeNull();

    await r.rerender(<FeedList {...baseProps} newCount={4} onPressNew={onPressNew} />);
    expect(r.getByText('4 nauji įrašai')).toBeTruthy();

    await fireEvent.press(r.getByTestId('socialuikit-new-posts-pill'));
    expect(onPressNew).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    scrollToOffset.mockRestore();
  });


  it('mounts the refresh control only when onRefresh is wired', async () => {
    // Read through the list's own prop: the jest environment's
    // RefreshControl mock renders a bare host element, so the
    // element handed to the list is the reliable seam
    const bare = await render(<FeedList {...baseProps} />);
    expect(bare.getByTestId('socialuikit-feed-list').props.refreshControl).toBeUndefined();

    const onRefresh = jest.fn();
    const r = await render(<FeedList {...baseProps} onRefresh={onRefresh} />);
    const control = r.getByTestId('socialuikit-feed-list').props.refreshControl;
    expect(control).toBeTruthy();
    expect(control.props.refreshing).toBe(false);

    await act(async () => control.props.onRefresh());
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await r.rerender(<FeedList {...baseProps} onRefresh={onRefresh} refreshing />);
    expect(r.getByTestId('socialuikit-feed-list').props.refreshControl.props.refreshing).toBe(true);
  });


  it('shows the footer spinner only while loadingMore', async () => {
    const r = await render(<FeedList {...baseProps} loadingMore />);
    expect(r.getByTestId('socialuikit-feed-spinner')).toBeTruthy();

    await r.rerender(<FeedList {...baseProps} />);
    expect(r.queryByTestId('socialuikit-feed-spinner')).toBeNull();
  });


  it('derives its tuning from the window and wins over flatListProps', async () => {
    const r = await render(<FeedList {...baseProps} flatListProps={{ testID: 'host-list', windowSize: 3 }} />);
    const list = r.getByTestId('socialuikit-feed-list');

    expect(r.queryByTestId('host-list')).toBeNull();
    expect(list.props.windowSize).toBe(9);
    expect(list.props.removeClippedSubviews).toBe(true);
    expect(list.props.maxToRenderPerBatch).toBe(Platform.OS === 'ios' ? 5 : 1);
    // The first screen covered even if every row sits at the
    // 140dp floor
    const expected = Math.max(1, Math.ceil(Dimensions.get('window').height / 140));
    expect(list.props.initialNumToRender).toBe(expected);
  });

  it('renders the gap row exactly under its named key, tappable, spinner while filling', async () => {
    const onFillGap = jest.fn();
    const items = [{ id: 'x' }, { id: 'y' }, { id: 'c' }];
    const r = await render(
      <FeedList items={items} keyOf={(item) => item.id} renderItem={(item) => <Text testID={`row-${item.id}`}>{item.id}</Text>} gapAfterKey="y" onFillGap={onFillGap} />,
    );
    expect(r.getByTestId('socialuikit-gap-row')).toBeTruthy();
    await fireEvent.press(r.getByTestId('socialuikit-gap-row'));
    expect(onFillGap).toHaveBeenCalledTimes(1);

    await r.rerender(
      <FeedList items={items} keyOf={(item) => item.id} renderItem={(item) => <Text testID={`row-${item.id}`}>{item.id}</Text>} gapAfterKey="y" onFillGap={onFillGap} fillingGap />,
    );
    // The spinner seat is a plain View, not a button (firing a
    // synthetic press here would bubble to the composite's prop —
    // an RNTL artifact a device never has — so assert structure)
    const seat = r.getByTestId('socialuikit-gap-row');
    expect(seat.props.accessibilityRole).toBeUndefined();

    await r.rerender(
      <FeedList items={items} keyOf={(item) => item.id} renderItem={(item) => <Text testID={`row-${item.id}`}>{item.id}</Text>} gapAfterKey={null} />,
    );
    expect(r.queryByTestId('socialuikit-gap-row')).toBeNull();
  });
});
