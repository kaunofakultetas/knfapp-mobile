// -----------------------------------------------------------
//  [*] Tests — the assistant tab over the wire, faked
//
//  The seams the LIVE wiring promises: the screen mounts
//  the REAL kit thread under the REAL engine runtime and
//  the REAL transport — only the fetch underneath is the
//  engine's fake server, scripted per send. A send streams
//  the scripted reply into exactly one user and one
//  assistant message; the FIRST send mints the server
//  thread through the threads service and stamps its id
//  into the chat body as threadId, the second send reuses
//  it (the lazy seam, observed on the fake's call log); a
//  suggestion chip sends its prompt; the header's history
//  button pushes the threads screen; a ?thread param loads
//  the stored transcript and the runtime replays it with
//  no send at all; a settled answer carries NO thumbs row —
//  the owner dropped answer feedback from the app, so the
//  host hands the kit no onFeedback. Chrome
//  (Screen/Header/theme/i18n) is mocked the way the schedule
//  suite mocks it — pinned by
//  their own suites; the threads service and session are
//  mocked because their storage does not exist in jest.
// -----------------------------------------------------------

// Imports sit ABOVE the mock blocks (jest hoists every
// jest.mock above them anyway) so the lint's import order and
// the runtime order agree
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AssistantScreen from '@/app/(main)/tabs/assistant';
import { TABS } from '@/constants/tabs';
import { createFakeAssistantServer, errorReply, textReply } from '@knf/assistantengine/testing';

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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'lt' },
  }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
      surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00',
    },
  }),
}));

jest.mock('@/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the primitives
  const { Text, View } = require('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title, right }: { title: string; right?: unknown }) => (
      <View>
        <Text>{title}</Text>
        {right as never}
      </View>
    ),
    LoadingSpinner: () => <Text>loading</Text>,
  };
});

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => {}) }));

// The session store and auth context reach native storage —
// absent in jest; the screen only reads a token (guest) and
// the signed-in flag
jest.mock('@/services/session', () => ({ getStoredToken: async () => null }));
// Mutable so a test can flip the session mid-render — the
// screen must discard the mounted conversation on a flip
let mockAuth: { isAuthenticated: boolean; user?: { id: string } } = { isAuthenticated: false };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('@/context/NetworkContext', () => ({ showToast: jest.fn() }));

// The api client module boots axios over the real session
// store — the screen takes only the base URL from it
jest.mock('@/services/api/client', () => ({ API_BASE_URL: 'https://knf.test/api' }));

// The threads service — storage-backed, so faked whole; the
// mint answers a fixed thread and the transcript loader is
// per-test
const mockCreateThread = jest.fn(async () => ({
  id: 'thread-fixed-1', title: null, language: 'lt',
  createdAt: '2026-09-15T10:00:00Z', lastMessageAt: '2026-09-15T10:00:00Z',
}));
const mockFetchThreadMessages = jest.fn(async () => [] as { id: string; format: string; content: unknown; createdAt: string }[]);
jest.mock('@/services/assistantThreads', () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...(args as [])),
  fetchThreadMessages: (...args: unknown[]) => mockFetchThreadMessages(...(args as [])),
}));

// Navigation: the history push is observed; the ?thread param
// is per-test
const mockPush = jest.fn();
let mockParams: { thread?: string; n?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

// The engine stays REAL — only the wire under its transport is
// the fake server, one per test via this holder
const serverHolder: { current: ReturnType<typeof createFakeAssistantServer> | null } = { current: null };
jest.mock('@knf/assistantengine', () => {
  const actual = jest.requireActual<typeof import('@knf/assistantengine')>('@knf/assistantengine');
  return {
    ...actual,
    createKnfAssistantTransport: (config: Parameters<typeof actual.createKnfAssistantTransport>[0]) =>
      actual.createKnfAssistantTransport({ ...config, fetch: serverHolder.current!.fetch }),
  };
});


type View = Awaited<ReturnType<typeof render>>;

const settled = (view: View, text: string) =>
  waitFor(() => expect(view.getByText(text)).toBeTruthy());


beforeEach(() => {
  serverHolder.current = createFakeAssistantServer();
  mockParams = {};
  mockAuth = { isAuthenticated: false };
  mockPush.mockClear();
  mockCreateThread.mockClear();
  mockFetchThreadMessages.mockClear();
});


describe('the assistant screen on the wire', () => {
  it('mounts the thread, the composer, the chips and the history door', async () => {
    const view = await render(<AssistantScreen />);

    expect(view.getByText('assistant.title')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-thread')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-composer-input')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-composer-send')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-suggestion-0')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-suggestion-3')).toBeNull();

    await fireEvent.press(view.getByLabelText('assistant.threadsOpen'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/assistant-threads');
  });

  it('a send streams the scripted reply; the first send mints the thread and stamps it, the second reuses it', async () => {
    const server = serverHolder.current!;
    server.script(textReply(['Paskaitos ', 'rytoj 9:00.']));
    server.script(textReply(['Auditorija 215.']));

    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Kada paskaitos?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view, 'Paskaitos rytoj 9:00.');

    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);
    expect(view.getAllByTestId('assistantuikit-message-assistant')).toHaveLength(1);
    expect(view.getByText('Kada paskaitos?')).toBeTruthy();

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Kur?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view, 'Auditorija 215.');

    // The lazy seam, observed on the wire: one mint, both
    // bodies stamped with the same thread
    expect(mockCreateThread).toHaveBeenCalledTimes(1);
    const chatCalls = server.calls.filter((call) => call.url.endsWith('/api/assistant/chat'));
    expect(chatCalls).toHaveLength(2);
    for (const call of chatCalls) {
      expect((call.body as { threadId?: string }).threadId).toBe('thread-fixed-1');
    }
  });

  it('a suggestion chip sends its PROMPT as the user turn', async () => {
    serverHolder.current!.script(textReply(['Tvarkaraštį rasite programėlėje.']));
    const view = await render(<AssistantScreen />);

    await fireEvent.press(view.getByTestId('assistantuikit-suggestion-0'));
    await settled(view, 'Tvarkaraštį rasite programėlėje.');

    // The mocked t answers keys, so the prompt key IS the text
    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);
    expect(view.getByText('assistant.suggestionSchedulePrompt')).toBeTruthy();
  });

  it('a session flip discards the mounted conversation', async () => {
    serverHolder.current!.script(textReply(['Atsakymas A.']));
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Klausimas?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view, 'Atsakymas A.');
    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);

    // Login: the guest's conversation (and its thread id) must
    // not survive into the new identity's chat
    mockAuth = { isAuthenticated: true, user: { id: 'user-9' } };
    await view.rerender(<AssistantScreen />);
    expect(view.queryAllByTestId('assistantuikit-message-user')).toHaveLength(0);
    expect(view.queryAllByTestId('assistantuikit-message-assistant')).toHaveLength(0);
  });

  it('re-opening the same thread works every time — the nonce makes navigations distinct', async () => {
    mockParams = { thread: 'b2c3d4e5-1111-2222-3333-444455556666', n: '1' };
    const view = await render(<AssistantScreen />);
    await waitFor(() => expect(mockFetchThreadMessages).toHaveBeenCalledTimes(1));

    mockParams = { thread: 'b2c3d4e5-1111-2222-3333-444455556666', n: '2' };
    await view.rerender(<AssistantScreen />);
    await waitFor(() => expect(mockFetchThreadMessages).toHaveBeenCalledTimes(2));
  });

  it('a ?thread param replays the stored transcript with no send at all', async () => {
    mockParams = { thread: 'b2c3d4e5-1111-2222-3333-444455556666', n: '1' };
    mockFetchThreadMessages.mockResolvedValueOnce([
      {
        id: 'm1', format: 'aisdk-v7', createdAt: '2026-09-15T10:00:00Z',
        content: { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Kaip gauti stipendija?' }] },
      },
      {
        id: 'm2', format: 'aisdk-v7', createdAt: '2026-09-15T10:00:05Z',
        content: {
          id: 'm2', role: 'assistant',
          parts: [
            // A stored tool part replays through the REAL card
            // registry — the crash class where the registry was
            // built before its inputs existed only fired here
            { type: 'tool-searchHandbook', toolCallId: 'c1', state: 'output-available',
              input: { query: 'stipendija' },
              output: { entries: [{ id: 'h1', title: 'Kaip gauti stipendiją?', excerpt: 'Pagal rezultatus.', language: 'lt' }] } },
            { type: 'text', text: 'Stipendijos skiriamos pagal rezultatus.' },
          ],
        },
      },
    ]);

    const view = await render(<AssistantScreen />);
    await settled(view, 'Stipendijos skiriamos pagal rezultatus.');

    expect(mockFetchThreadMessages).toHaveBeenCalledWith('b2c3d4e5-1111-2222-3333-444455556666');
    expect(view.getByText('Kaip gauti stipendija?')).toBeTruthy();
    // The humanized card, not the raw tool name (mocked t
    // answers keys), and the tappable source row under it
    expect(view.getByText('assistant.toolHandbookDone')).toBeTruthy();
    expect(view.queryByText('searchHandbook')).toBeNull();
    expect(view.getByTestId('assistantuikit-source-0')).toBeTruthy();
    expect(serverHolder.current!.calls).toHaveLength(0);
  });

  it('a settled answer carries NO thumbs row: the host passes no onFeedback by the owner\'s decision', async () => {
    serverHolder.current!.script(textReply(['Rytoj 9:00.']));
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Kada?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
    await settled(view, 'Rytoj 9:00.');

    // The kit renders the pair only when handed a callback —
    // and the tab deliberately hands none
    expect(view.queryByLabelText('assistant.feedbackDown')).toBeNull();
    expect(view.queryByLabelText('assistant.feedbackUp')).toBeNull();
  });

  it('failures branch by CODE: a 429 reads as the quota message, not "check your connection"', async () => {
    serverHolder.current!.script(errorReply(429, { error: 'spent' }, { 'retry-after': '30' }));
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Klausimas?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));

    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('assistant.errorQuota')).toBeTruthy();
    expect(view.queryByText('assistant.errorBody')).toBeNull();
  });

  it('a dead backend reads as the unavailable message', async () => {
    serverHolder.current!.script(errorReply(503, { error: 'down' }));
    const view = await render(<AssistantScreen />);

    await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), 'Klausimas?');
    await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));

    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('assistant.errorUnavailable')).toBeTruthy();
  });
});


describe('the shared tab roster', () => {
  it('carries the assistant surface with the sparkles glyph pair, unpinned, after schedule', () => {
    const entry = TABS.find((tab) => tab.key === 'assistant');

    expect(entry).toMatchObject({
      key: 'assistant',
      icon: 'sparkles-outline',
      iconFilled: 'sparkles',
      route: '/(main)/tabs/assistant',
      hardPinned: false,
    });
    expect(TABS.findIndex((tab) => tab.key === 'assistant')).toBe(
      TABS.findIndex((tab) => tab.key === 'schedule') + 1,
    );
  });
});
