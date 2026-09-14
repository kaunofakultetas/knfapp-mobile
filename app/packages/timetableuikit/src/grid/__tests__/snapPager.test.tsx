// -----------------------------------------------------------
//  [*] Tests — SnapPager: the scrolling cursor carousel
//
//  Pins the pager's whole contract: nothing renders before the
//  container width lands, three offset pages render after it,
//  a momentum stop on a side page reports its direction and
//  snaps back to center, and a stop on the middle page reports
//  nothing.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import SnapPager from '../SnapPager';

const WIDTH = 390;

const layOut = async (view: Awaited<ReturnType<typeof render>>) =>
  fireEvent(view.getByTestId('timetableuikit-snappager-frame'), 'layout', {
    nativeEvent: { layout: { width: WIDTH, height: 600 } },
  });

const momentumStop = async (view: Awaited<ReturnType<typeof render>>, x: number) =>
  fireEvent(view.getByTestId('timetableuikit-snappager'), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x, y: 0 } },
  });

const renderPager = (onSettle: (direction: 1 | -1) => void) =>
  render(
    <SnapPager
      onSettle={onSettle}
      renderPage={(offset) => <Text>{`page:${offset}`}</Text>}
    />,
  );

describe('SnapPager', () => {
  it('renders nothing until the width lands, then all three offset pages', async () => {
    const view = await renderPager(jest.fn());
    expect(view.queryByText('page:0')).toBeNull();

    await layOut(view);
    expect(view.getByText('page:-1')).toBeTruthy();
    expect(view.getByText('page:0')).toBeTruthy();
    expect(view.getByText('page:1')).toBeTruthy();
  });

  it('settling on the right page reports +1, on the left -1, on the middle nothing', async () => {
    const onSettle = jest.fn();
    const view = await renderPager(onSettle);
    await layOut(view);

    await momentumStop(view, 2 * WIDTH);
    expect(onSettle).toHaveBeenLastCalledWith(1);

    await momentumStop(view, 0);
    expect(onSettle).toHaveBeenLastCalledWith(-1);

    await momentumStop(view, WIDTH);
    expect(onSettle).toHaveBeenCalledTimes(2);
  });
});
