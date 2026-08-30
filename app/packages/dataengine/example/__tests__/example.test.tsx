// -----------------------------------------------------------
//  [*] Tests — @knf/dataengine example screen
//
//  The example mounted whole: the offline first page under its
//  cachedAt banner, the network toggle whose off→on flip
//  triggers the automatic refetch, loadMore through the list's
//  onEndReached, and the pull-to-refresh merge folding a fresh
//  post in on top of the loaded pages.
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ExampleOfflineScreen from '../ExampleOfflineScreen';


// Settle pending microtask chains inside act — deep enough for
// the fetch → state → effect cascades under test
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


describe('ExampleOfflineScreen', () => {
  it('serves the offline copy, then refetches each time the toggle brings the network back', async () => {
    const screen = await render(<ExampleOfflineScreen />);
    await flush();


    // Mounted offline: the seeded copy is the first page, under
    // the banner — no error state, four cached rows
    expect(screen.getByTestId('cached-banner')).toBeTruthy();
    expect(screen.getByText('Library hours change next week — check the door.')).toBeTruthy();
    expect(screen.getByTestId('board-list').props.data).toHaveLength(4);


    // Reconnect: offline→online is the restore event — the feed
    // refetches by itself, the live page replaces the copy
    await fireEvent.press(screen.getByTestId('network-toggle'));
    await flush();
    await waitFor(() => expect(screen.queryByTestId('cached-banner')).toBeNull());
    expect(screen.getByText('Online — tap to go offline')).toBeTruthy();


    // Off and on again: another restore, another refetch — the
    // fake server gained a post in between, so it shows
    await fireEvent.press(screen.getByTestId('network-toggle'));
    await fireEvent.press(screen.getByTestId('network-toggle'));
    await flush();
    await waitFor(() => expect(screen.getByText('Posted while you were away #1')).toBeTruthy());
  });


  it('pages through onEndReached and folds a pull-to-refresh in as a merge', async () => {
    const screen = await render(<ExampleOfflineScreen />);
    await flush();


    // Go online first — a cached page has no live continuation,
    // so pagination only exists after a real page 1
    await fireEvent.press(screen.getByTestId('network-toggle'));
    await flush();
    await waitFor(() => expect(screen.queryByTestId('cached-banner')).toBeNull());


    // The end of the list loads page 2 behind the footer
    const list = screen.getByTestId('board-list');
    await act(async () => {
      list.props.onEndReached();
    });
    await waitFor(() => expect(screen.getByTestId('board-list').props.data).toHaveLength(8));


    // Pull to refresh: the merge prepends the post the server
    // gained and leaves the loaded pages exactly where they were
    await act(async () => {
      screen.getByTestId('board-list').props.refreshControl.props.onRefresh();
    });
    await flush();
    await waitFor(() => expect(screen.getByText('Posted while you were away #1')).toBeTruthy());
    const ids = screen.getByTestId('board-list').props.data.map((row: { id: string }) => row.id);
    expect(ids).toEqual(['p102', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']);
  });
});
