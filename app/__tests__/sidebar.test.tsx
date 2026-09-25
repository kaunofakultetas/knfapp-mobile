// -----------------------------------------------------------
//  [*] Tests — components/Sidebar + DrawerContext
//
//  The drawer's open/close coordination: layer interactivity
//  and assistive visibility must follow the isOpen flag, the
//  pin toggles must write through setPinnedTabs (with the
//  land-on-news escape when unpinning the active surface),
//  hard-pinned surfaces never offer a toggle at all, and every
//  jump made from the drawer lands with the floating tab bar
//  expanded — a chip a scroll folded away must not stay folded
//  on the screen it lands on.
// -----------------------------------------------------------

// The drawer polls the activity badge through the social engine —
// no provider here, so the hook answers a quiet badge
// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject
jest.mock('@/services/features', () => {
  const { TABS } = require('@/constants/tabs');
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    ENABLED_TAB_KEYS: new Set(TABS.map((tab: { key: string }) => tab.key)),
    TAB_FEATURES: {},
  };
});

jest.mock('@knf/socialengine', () => ({ useUnreadBadge: () => ({ badge: '', refresh: async () => {} }) }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/' }));
jest.mock('@/components/ui', () => ({ Avatar: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    // Passthrough: the identity card and footer render inside
    // SafeAreaView; a hook-only mock leaves it undefined and the
    // whole drawer fails to mount
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => (
      <View {...props}>{children}</View>
    ),
  };
});

// The pan gesture is not exercised here — a chainable stub
// keeps the component's useMemo happy without native gestures
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ['activeOffsetX', 'onBegin', 'onUpdate', 'onEnd']) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };
  return {
    Gesture: { Pan: chain },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});

const mockNavigate = jest.fn();
let mockPathname = '/(main)/tabs/news';
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  usePathname: () => mockPathname,
}));

let mockIsOpen = true;
const mockOpen = jest.fn();
const mockClose = jest.fn();
jest.mock('@/context/DrawerContext', () => ({
  ...jest.requireActual('@/context/DrawerContext'),
  useDrawer: () => ({ isOpen: mockIsOpen, open: mockOpen, close: mockClose }),
}));

let mockPinnedTabs: string[] = ['news', 'messages', 'schedule', 'id'];
const mockSetPinnedTabs = jest.fn();
jest.mock('@/context/AppContext', () => ({
  useApp: () => ({
    pinnedTabs: mockPinnedTabs,
    setPinnedTabs: mockSetPinnedTabs,
    theme: 'system',
    setTheme: jest.fn(),
    language: 'lt',
    setLanguage: jest.fn(),
  }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      brand: '#7B003F', brandSoft: '#F3E0EA', brandStrong: '#5E0030', onBrand: '#FFFFFF',
      ink: '#111111', inkSoft: '#555555', inkFaint: '#999999',
      surface: '#FFFFFF', surfaceSoft: '#F5F5F5', line: '#DDDDDD',
    },
  }),
}));

import { act, fireEvent, render, renderHook } from '@testing-library/react-native';

import Sidebar from '@/components/Sidebar';
import { isTabBarCollapsed, releaseTabBarHold, setTabBarCollapsed } from '@/components/navigation/tabBarCollapse';


// The pin Pressable calls e.stopPropagation() — fireEvent must
// hand it an event object or the handler throws
const pressEvent = { stopPropagation: () => {} };


describe('Sidebar', () => {
  beforeEach(() => {
    mockIsOpen = true;
    mockPathname = '/(main)/tabs/news';
    mockPinnedTabs = ['news', 'messages', 'schedule', 'id'];
    mockNavigate.mockClear();
    mockClose.mockClear();
    mockSetPinnedTabs.mockClear();
    // The chip's state is a module-level singleton — every case
    // starts with it expanded and unheld
    releaseTabBarHold();
    setTabBarCollapsed(false);
  });

  it('is untouchable and hidden from assistive tech while closed', async () => {
    mockIsOpen = false;
    const root = await (await render(<Sidebar />)).toJSON() as { props: Record<string, unknown> };

    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.accessibilityElementsHidden).toBe(true);
    expect(root.props.accessibilityViewIsModal).toBe(false);
  });

  it('is interactive and modal for assistive tech while open', async () => {
    const root = await (await render(<Sidebar />)).toJSON() as { props: Record<string, unknown> };

    expect(root.props.pointerEvents).toBe('auto');
    expect(root.props.accessibilityElementsHidden).toBe(false);
    expect(root.props.accessibilityViewIsModal).toBe(true);
  });

  it('closes on scrim press', async () => {
    const { getByLabelText } = await render(<Sidebar />);

    await fireEvent.press(getByLabelText('menu.close'));
    expect(mockClose).toHaveBeenCalled();
  });

  it('shows the always-pinned mark, not a toggle, on hard-pinned surfaces', async () => {
    const { getAllByLabelText } = await render(<Sidebar />);

    // news + messages are locked; the other five carry a switch
    expect(getAllByLabelText('menu.alwaysPinned')).toHaveLength(2);
    expect(getAllByLabelText('menu.unpinTab')).toHaveLength(2); // schedule, id
    expect(getAllByLabelText('menu.pinTab')).toHaveLength(3); // assistant, map, settings
  });

  it('unpins an inactive surface without navigating', async () => {
    const { getAllByLabelText } = await render(<Sidebar />);

    // First unpin switch in section order is schedule's
    await fireEvent.press(getAllByLabelText('menu.unpinTab')[0], pressEvent);
    expect(mockSetPinnedTabs).toHaveBeenCalledWith(['news', 'messages', 'id']);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('lands on news before unpinning the surface the reader is on', async () => {
    mockPathname = '/(main)/tabs/schedule';
    const { getAllByLabelText } = await render(<Sidebar />);

    await fireEvent.press(getAllByLabelText('menu.unpinTab')[0], pressEvent);
    expect(mockNavigate).toHaveBeenCalledWith('/(main)/tabs/news');
    expect(mockSetPinnedTabs).toHaveBeenCalledWith(['news', 'messages', 'id']);
  });

  it('pins an unpinned surface', async () => {
    const { getAllByLabelText } = await render(<Sidebar />);

    // First pin switch in section order is the assistant's
    await fireEvent.press(getAllByLabelText('menu.pinTab')[0], pressEvent);
    expect(mockSetPinnedTabs).toHaveBeenCalledWith(['news', 'messages', 'schedule', 'id', 'assistant']);
  });

  it('a section jump lands with the tab bar shown — the chip a scroll folded is expanded first', async () => {
    // The reader scrolled the news feed down, folding the chip
    setTabBarCollapsed(true);
    const { getByLabelText } = await render(<Sidebar />);

    await fireEvent.press(getByLabelText('tabs.settings'));

    expect(mockClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/(main)/tabs/settings');
    expect(isTabBarCollapsed()).toBe(false);
  });

  it('the unpin escape to news expands the chip too', async () => {
    mockPathname = '/(main)/tabs/schedule';
    setTabBarCollapsed(true);
    const { getAllByLabelText } = await render(<Sidebar />);

    await fireEvent.press(getAllByLabelText('menu.unpinTab')[0], pressEvent);

    expect(mockNavigate).toHaveBeenCalledWith('/(main)/tabs/news');
    expect(mockSetPinnedTabs).toHaveBeenCalledWith(['news', 'messages', 'id']);
    expect(isTabBarCollapsed()).toBe(false);
  });
});


describe('DrawerProvider', () => {
  it('walks closed → open → closed through the real provider', async () => {
    const {
      default: DrawerProvider,
      useDrawer,
    } = jest.requireActual('@/context/DrawerContext');

    const { result } = await renderHook(() => useDrawer(), { wrapper: DrawerProvider });
    expect(result.current.isOpen).toBe(false);

    await act(async () => result.current.open());
    expect(result.current.isOpen).toBe(true);

    await act(async () => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });
});
