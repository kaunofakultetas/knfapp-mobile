// -----------------------------------------------------------
//  [*] Tests — the cached-data strip
//
//  The strip ages its "updated X ago" label every minute, and
//  it used to be a live region: TalkBack re-read the whole
//  strip on every tick. It now announces ONCE per stale-data
//  episode (a new cachedAt) and stays silent while it ages.
// -----------------------------------------------------------

import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import CachedBanner from '@/components/CachedBanner';


jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ scheme: 'light', colors: jest.requireActual('@/constants/theme').palettes.light }),
}));


describe('CachedBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });


  it('announces once, then ages silently — no live region re-reading every minute', async () => {
    const cachedAt = Date.now() - 5 * 60_000;
    const view = await render(<CachedBanner cachedAt={cachedAt} />);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);

    const strip = screen.getByLabelText(/·/);
    expect(strip.props.accessibilityLiveRegion).toBeUndefined();
    expect(strip.props.accessibilityRole).toBeUndefined();

    const before = strip.props.accessibilityLabel;
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    // The visible label moved on; the announcement did not repeat
    expect(screen.getByLabelText(/·/).props.accessibilityLabel).not.toBe(before);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('a new stale-data episode is announced again', async () => {
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const view = await render(<CachedBanner cachedAt={Date.now() - 60_000} />);
    const afterMount = announce.mock.calls.length;
    await view.rerender(<CachedBanner cachedAt={Date.now() - 120_000} />);
    expect(announce.mock.calls.length).toBe(afterMount + 1);
    expect(announce.mock.calls.at(-1)?.[0]).toContain('2');
    await view.unmount();
  });
});
