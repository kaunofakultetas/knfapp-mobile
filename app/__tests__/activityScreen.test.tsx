// -----------------------------------------------------------
//  [*] Tests — the activity screen over the engine + kit
//
//  A guest sees the login prompt and never asks the wire; a
//  signed-in viewer sees grouped rows from the transport,
//  landing marks everything read, and a tap opens what the
//  row is about.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { SocialEngineProvider, fakeSocialTransport, type SocialNotification } from '@knf/socialengine';
import { SocialUiKitProvider } from '@knf/socialuikit';

import ActivityScreen from '@/app/(main)/activity/index';


// The ui barrel drags the API client and the i18n polyfills in
// through Avatar — plain stand-ins keep the screen's own logic
// under test
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args) }),
  useFocusEffect: (effect: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      effect();
    }, [effect]);
  },
}));
let mockAuthenticated = true;
jest.mock('@/context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: mockAuthenticated }) }));
jest.mock('@/context/NetworkContext', () => ({ useNetwork: () => ({ isConnected: true }) }));


const VIEWER = { id: 'me', displayName: 'Aš' };
const ONA = { id: 'u-ona', displayName: 'Ona' };
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

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

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
});
