// -----------------------------------------------------------
//  [*] Tests — components/navigation/TabBar
//
//  The bar's three deterministic rules: unpinned routes stay
//  out, a focused-but-unpinned route stays IN (the reader must
//  never stand on a screen with no selected tab), and the
//  unread badge rides the messages tab only.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let mockPinnedTabs: string[] = ['news', 'messages', 'schedule', 'id'];
jest.mock('@/context/AppContext', () => ({ useApp: () => ({ pinnedTabs: mockPinnedTabs }) }));

let mockUnread = 0;
jest.mock('@/hooks/useUnreadCount', () => ({ useUnreadCount: () => ({ count: mockUnread }) }));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      brand: '#7B003F', brandSoft: '#F3E0EA', onBrand: '#FFFFFF',
      ink: '#111111', inkSoft: '#555555', inkFaint: '#999999',
      surface: '#FFFFFF', surfaceSoft: '#F5F5F5', line: '#DDDDDD',
    },
  }),
}));

import { fireEvent, render } from '@testing-library/react-native';

import TabBar from '@/components/navigation/TabBar';
import { TABS } from '@/constants/tabs';

import type { BottomTabBarProps } from 'expo-router/js-tabs';


// One route per roster entry; titles are distinct so queries
// can name a tab unambiguously
const routes = TABS.map((tab) => ({ key: `${tab.key}-key`, name: tab.key }));

const makeProps = (focused: string): BottomTabBarProps => {
  const state = {
    index: routes.findIndex((route) => route.name === focused),
    routes,
  };
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { options: { title: `title-${route.name}` } }]),
  );
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return { state, descriptors, navigation, insets } as unknown as BottomTabBarProps;
};


describe('TabBar', () => {
  beforeEach(() => {
    mockPinnedTabs = ['news', 'messages', 'schedule', 'id'];
    mockUnread = 0;
  });

  it('renders pinned tabs and filters unpinned ones out', async () => {
    const { queryByText } = await render(<TabBar {...makeProps('news')} />);

    expect(queryByText('title-news')).toBeTruthy();
    expect(queryByText('title-messages')).toBeTruthy();
    expect(queryByText('title-schedule')).toBeTruthy();
    expect(queryByText('title-id')).toBeTruthy();
    expect(queryByText('title-map')).toBeNull();
    expect(queryByText('title-settings')).toBeNull();
  });

  it('keeps a focused-but-unpinned route in the bar', async () => {
    mockPinnedTabs = ['news', 'messages'];
    const { queryByText } = await render(<TabBar {...makeProps('map')} />);

    expect(queryByText('title-map')).toBeTruthy();
    expect(queryByText('title-schedule')).toBeNull();
    expect(queryByText('title-settings')).toBeNull();
  });

  it('marks exactly the focused tab as selected', async () => {
    const { getByLabelText } = await render(<TabBar {...makeProps('schedule')} />);

    expect(getByLabelText('title-schedule').props.accessibilityState.selected).toBe(true);
    expect(getByLabelText('title-news').props.accessibilityState.selected).toBe(false);
  });

  it('shows the unread badge on the messages tab only', async () => {
    mockUnread = 3;
    const { queryAllByText, getByLabelText } = await render(<TabBar {...makeProps('news')} />);

    // The badge is a11y-hidden (its count rides the tab label),
    // so the text query must include hidden elements
    expect(queryAllByText('3', { includeHiddenElements: true })).toHaveLength(1);
    expect(getByLabelText('title-messages, tabs.messagesUnread')).toBeTruthy();
  });

  it('caps the badge at 99+', async () => {
    mockUnread = 250;
    const { queryByText } = await render(<TabBar {...makeProps('news')} />);

    expect(queryByText('99+', { includeHiddenElements: true })).toBeTruthy();
  });

  it('navigates on tab press unless a listener prevents it', async () => {
    const props = makeProps('news');
    const { getByText, rerender } = await render(<TabBar {...props} />);

    await fireEvent.press(getByText('title-schedule'));
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'schedule-key' }),
    );
    expect(props.navigation.navigate).toHaveBeenCalledWith('schedule', undefined);

    // A prevented tabPress must not navigate
    const guarded = makeProps('news');
    (guarded.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await rerender(<TabBar {...guarded} />);
    await fireEvent.press(getByText('title-schedule'));
    expect(guarded.navigation.navigate).not.toHaveBeenCalled();
  });
});
