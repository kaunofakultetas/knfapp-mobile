// -----------------------------------------------------------
//  [*] Tests — the activity screen over the engine + kit
//
//  A guest sees the login prompt and never asks the wire; a
//  signed-in viewer sees grouped rows from the transport,
//  landing marks everything read, and a tap opens what the
//  row is about. A return to the screen re-reads the list
//  SILENTLY — the rows stay on screen (never the full-screen
//  spinner) and what arrived meanwhile lands marked read; the
//  focus callback once closed over the mount's loading flag
//  and never refetched at all.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { SocialEngineProvider, fakeSocialTransport, type SocialNotification } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';

import ActivityScreen from '@/app/(main)/activity/index';


// The ui barrel drags the API client and the i18n polyfills in
// through Avatar — plain stand-ins keep the screen's own logic
// under test
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

jest.mock('@/components/ui', () => {
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    LoadingSpinner: () => <Text>loading</Text>,
    EmptyState: ({ title, hint }: { title: string; hint?: string }) => (
      <View>
        <Text>{title}</Text>
        {hint ? <Text>{hint}</Text> : null}
      </View>
    ),
    ErrorState: ({ message }: { message: string }) => <Text>{message}</Text>,
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/activity' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: { inkSoft: '#666', inkFaint: '#999', brand: '#7B003F', surfaceSoft: '#eee' }, scheme: 'light' }),
}));
// Every router push — a row tap lands here
const mockPush = jest.fn();
// The focus callback is captured so a test can replay a return
let mockFocus: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    mockFocus = effect;
    useEffect(() => {
      effect();
    }, [effect]);
  },
}));
let mockAuthenticated = true;
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: mockAuthenticated }) }));
jest.mock('@/context/NetworkContext', () => ({ useNetwork: () => ({ isConnected: true }) }));


// The signed-in viewer the engine runs as
const VIEWER = { id: 'me', displayName: 'Aš' };
// The actor every fixture row names
const ONA = { id: 'u-ona', displayName: 'Ona' };







// -----------------------------------------------------------
// row
// -----------------------------------------------------------
//
// One activity row from Ona (a like on post-1), overridable.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const row = (id: string, over: Partial<SocialNotification> = {}): SocialNotification => ({
  id,
  kind: 'like',
  actor: ONA,
  createdAt: '2026-08-31T10:00:00Z',
  read: false,
  subjectId: 'post-1',
  subjectPreview: 'Sveiki',
  ...over,
});







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Drains the microtask chains a list load settles through.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });







// -----------------------------------------------------------
// wrap
// -----------------------------------------------------------
//
// The screen under the real social engine and kit providers,
// signed in (or not). RNTL 14 renders asynchronously — callers
// await it.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const wrap = (ui: ReactElement, transport: ReturnType<typeof fakeSocialTransport>, signedIn = true) =>
  render(
    <SocialEngineProvider transport={transport} currentUser={signedIn ? VIEWER : null}>
      <SocialUiKitProvider locale="lt">{ui}</SocialUiKitProvider>
    </SocialEngineProvider>,
  );


describe('ActivityScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockAuthenticated = true;
  });

  it('a guest sees the login prompt and the wire is never asked', async () => {
    mockAuthenticated = false;
    const transport = fakeSocialTransport();
    const r = await wrap(<ActivityScreen />, transport, false);
    await flush();
    expect(r.getByText('activity.loginRequired')).toBeTruthy();
    expect(transport.calls.filter((c) => c.method === 'fetchNotifications')).toHaveLength(0);
  });

  it('renders the grouped rows, marks everything read on landing, and a tap opens the post', async () => {
    const transport = fakeSocialTransport({
      notifications: [row('n1'), row('n2', { actor: { id: 'u-tomas', displayName: 'Tomas' } }), row('n3', { kind: 'comment', subjectId: 'post-2', createdAt: '2026-08-31T11:00:00Z' })],
    });
    const r = await wrap(<ActivityScreen />, transport);
    await flush();

    // Two likes on one post fold into one row; the comment stands alone
    const rows = r.getAllByTestId(/socialuikit-notification-row/);
    expect(rows).toHaveLength(2);
    expect(transport.calls.some((c) => c.method === 'markNotificationsRead')).toBe(true);
    expect(await transport.fetchUnreadCount()).toBe(0);

    await fireEvent.press(rows[0]);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(main)/news-post', params: { postId: 'post-2' } });
  });

  it('an empty list shows the calm empty state', async () => {
    const r = await wrap(<ActivityScreen />, fakeSocialTransport());
    await flush();
    expect(r.getByText('activity.empty')).toBeTruthy();
  });

  it('a return to the screen refetches silently — rows stay, new ones land marked read', async () => {
    const transport = fakeSocialTransport({ notifications: [row('n1')] });
    const r = await wrap(<ActivityScreen />, transport);
    await flush();
    expect(r.getAllByTestId(/socialuikit-notification-row/)).toHaveLength(1);
    const fetchesBefore = transport.calls.filter((c) => c.method === 'fetchNotifications').length;

    // Something new happened while the viewer was elsewhere
    transport.seedNotification({ kind: 'comment', actor: { id: 'u-jonas', displayName: 'Jonas' }, createdAt: '2026-08-31T12:00:00Z', read: false, subjectId: 'post-3', subjectPreview: 'Puiku' });
    const release = transport.stall('fetchNotifications');
    await act(async () => {
      mockFocus?.();
    });
    await flush();

    // The refetch is on the wire — the old row stays on screen
    expect(transport.calls.filter((c) => c.method === 'fetchNotifications').length).toBe(fetchesBefore + 1);
    expect(r.queryByText('loading')).toBeNull();
    expect(r.getAllByTestId(/socialuikit-notification-row/)).toHaveLength(1);

    await act(async () => release());
    await flush();
    expect(r.getAllByTestId(/socialuikit-notification-row/)).toHaveLength(2);
    expect(await transport.fetchUnreadCount()).toBe(0);
  });
});
