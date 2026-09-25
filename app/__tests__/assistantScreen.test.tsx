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
//  host hands the kit no onFeedback. The error sentence comes
//  from the CURRENT run's failure (a 429 two turns ago never
//  captions a mid-stream fault — KNF-087), names the wait a
//  Retry-After carried and the precise case (a switched-off
//  assistant, a vanished thread); the kit draws in the app's
//  Raleway; answer links open only for web/mail/phone; a
//  conversation deleted from the history leaves the tab; the
//  header's "new conversation" door appears once there is a
//  conversation to leave; a malformed ?thread param is never
//  fetched. Chrome
//  (Screen/Header/theme/i18n) is mocked the way the schedule
//  suite mocks it — pinned by their own suites; the threads
//  service and session are mocked because their storage does
//  not exist in jest.
// -----------------------------------------------------------

// Imports sit ABOVE the mock blocks (jest hoists every
// jest.mock above them anyway) so the lint's import order and
// the runtime order agree
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import AssistantScreen from '@/app/(main)/tabs/assistant';
import { TABS } from '@/constants/tabs';
import { createFakeAssistantServer, errorReply, streamReply, textReply } from '@knf/assistantengine/testing';

// This suite pins its module's BEHAVIOR, so the shipping
// flags are pinned all-on — the real features.json (whatever
// the current release preset says) must never decide whether
// these tests see their subject
jest.mock('@/services/features', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the roster
  const { TABS } = require('@/constants/tabs');
  return {
    isFeatureEnabled: () => true,
    FEATURES: { accounts: true, news: true, chat: true, social: true, schedule: true, assistant: true, studentId: true, map: true },
    ENABLED_TABS: TABS,
    ENABLED_TAB_KEYS: new Set(TABS.map((tab: { key: string }) => tab.key)),
    TAB_FEATURES: {},
  };
});

// Stable t and i18n, like the real hook's (it memoizes per
// language); params ride after the key so an interpolated
// sentence is observable
jest.mock('react-i18next', () => {
  const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);
  const i18n = { language: 'lt' };
  return { useTranslation: () => ({ t, i18n }) };
});

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', brandText: '#9E1F5C', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
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
const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

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
const mockFetchThreadMessages = jest.fn(async (_id?: string) => [] as { id: string; format: string; content: unknown; createdAt: string }[]);
// The delete announcements: the tab's listener is captured so
// a test can play a delete from the history screen
const mockDeleteListeners = new Set<(id: string) => void>();
jest.mock('@/services/assistantThreads', () => ({
  createThread: (...args: unknown[]) => mockCreateThread(...(args as [])),
  fetchThreadMessages: (...args: unknown[]) => mockFetchThreadMessages(...(args as [])),
  onThreadDeleted: (listener: (id: string) => void) => {
    mockDeleteListeners.add(listener);
    return () => mockDeleteListeners.delete(listener);
  },
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

// Type a question and press Send, the way a student would
const ask = async (view: View, text: string) => {
  await fireEvent.changeText(view.getByTestId('assistantuikit-composer-input'), text);
  await fireEvent.press(view.getByTestId('assistantuikit-composer-send'));
};


beforeEach(() => {
  serverHolder.current = createFakeAssistantServer();
  mockParams = {};
  mockAuth = { isAuthenticated: false };
  mockPush.mockClear();
  mockCreateThread.mockClear();
  mockFetchThreadMessages.mockClear();
  mockShowToast.mockClear();
  mockDeleteListeners.clear();
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

  it('failures branch by CODE: a 429 reads as the quota sentence WITH its wait, not "check your connection"', async () => {
    serverHolder.current!.script(errorReply(429, { error: 'spent' }, { 'retry-after': '30' }));
    const view = await render(<AssistantScreen />);

    await ask(view, 'Klausimas?');

    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    // This used to pin the wait-less 'assistant.errorQuota': the
    // Retry-After the server sent now names the wait
    expect(view.getByText('assistant.errorQuotaWait {"wait":"assistant.waitSeconds {\\"seconds\\":30}"}')).toBeTruthy();
    expect(view.queryByText('assistant.errorBody')).toBeNull();
    expect(view.queryByText('assistant.errorNetwork')).toBeNull();
  });

  it('a dead backend reads as the unavailable message; a switched-off one says so', async () => {
    serverHolder.current!.script(errorReply(503, { error: 'down' }));
    const view = await render(<AssistantScreen />);

    await ask(view, 'Klausimas?');

    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('assistant.errorUnavailable')).toBeTruthy();

    // The container's envelope: no active prompt is a
    // deliberate OFF, not an outage
    serverHolder.current!.script(errorReply(503, {
      message: 'No active system prompt — activate one in the admin panel',
      error: { code: 'PROMPT_NOT_CONFIGURED', message: 'No active system prompt — activate one in the admin panel' },
    }));
    await fireEvent.press(view.getByText('assistant.retry'));
    await waitFor(() => expect(view.getByText('assistant.errorNotConfigured')).toBeTruthy());
    // The precise technical line stays visible under it
    expect(view.getByText(/unavailable 503 PROMPT_NOT_CONFIGURED: No active system prompt/)).toBeTruthy();
  });

  it('KNF-087: a 429 two turns ago never captions a later mid-stream fault', async () => {
    const server = serverHolder.current!;
    server.script(errorReply(429, { error: 'spent' }));
    server.script(textReply(['Gerai.']));
    server.script(streamReply([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', delta: 'Egzaminai prasideda ' },
      { type: 'text-end', id: 't1' },
      { type: 'error', errorText: 'Atsiprašau, įvyko klaida generuojant atsakymą.' },
    ]));
    const view = await render(<AssistantScreen />);

    await ask(view, 'Pirmas?');
    await waitFor(() => expect(view.getByText('assistant.errorQuota')).toBeTruthy());

    // Retry succeeds — the strip leaves
    await fireEvent.press(view.getByText('assistant.retry'));
    await settled(view, 'Gerai.');
    await waitFor(() => expect(view.queryByTestId('assistantuikit-error')).toBeNull());

    // A fault INSIDE a 200 stream: the sentence is the server
    // one, never the stale quota line
    await ask(view, 'Kada egzaminai?');
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    expect(view.getByText('assistant.errorServer')).toBeTruthy();
    expect(view.queryByText('assistant.errorQuota')).toBeNull();
    expect(view.getByText(/Atsiprašau, įvyko klaida generuojant atsakymą/)).toBeTruthy();
    expect(view.getByText(/Egzaminai prasideda/)).toBeTruthy();
  });

  it('a vanished thread (404) says so — start a new one', async () => {
    serverHolder.current!.script(errorReply(404, { message: 'Thread not found', error: { code: 'THREAD_NOT_FOUND', message: 'Thread not found' } }));
    const view = await render(<AssistantScreen />);
    await ask(view, 'Klausimas?');
    await waitFor(() => expect(view.getByText('assistant.errorThreadGone')).toBeTruthy());
  });
});


describe('the host around the kit', () => {
  it('draws the kit in the app\'s Raleway families', async () => {
    const view = await render(<AssistantScreen />);
    const face = (text: string) => Object.assign({}, ...[view.getByText(text).props.style].flat(Infinity).filter(Boolean));
    expect(face('assistant.emptyTitle')).toMatchObject({ fontFamily: 'Raleway-Bold' });
    expect(face('assistant.emptyTitle').fontWeight).toBeUndefined();
    expect(face('assistant.emptyBody')).toMatchObject({ fontFamily: 'Raleway-Regular' });
    expect(face('assistant.suggestionScheduleTitle')).toMatchObject({ fontFamily: 'Raleway-SemiBold' });
    expect(face('assistant.send')).toMatchObject({ fontFamily: 'Raleway-SemiBold' });
  });

  it('answer links are drawn in the theme\'s brand TEXT hue, not the fill', async () => {
    serverHolder.current!.script(textReply(['Žr. [svetainę](https://knf.vu.lt).']));
    const view = await render(<AssistantScreen />);
    await ask(view, 'Kur?');
    await settled(view, 'svetainę');
    expect(Object.assign({}, ...[view.getByText('svetainę').props.style].flat()).color).toBe('#9E1F5C');
  });

  it('answer links open for web, mail and phone — never another scheme', async () => {
    serverHolder.current!.script(textReply([
      '[svetainė](https://knf.vu.lt) [paštas](mailto:knf@knf.vu.lt) [telefonas](tel:+37037422523) [blogas](javascript:alert(1)) [programa](intent://x)',
    ]));
    const view = await render(<AssistantScreen />);
    await ask(view, 'Kontaktai?');
    await settled(view, 'svetainė');

    const open = Linking.openURL as jest.Mock;
    open.mockClear();
    for (const label of ['svetainė', 'paštas', 'telefonas', 'blogas', 'programa']) {
      await fireEvent.press(view.getByText(label));
    }
    expect(open.mock.calls.map(([url]) => url)).toEqual(['https://knf.vu.lt', 'mailto:knf@knf.vu.lt', 'tel:+37037422523']);
  });

  it('deleting the conversation on screen from the history resets the tab; another delete does not', async () => {
    serverHolder.current!.script(textReply(['Atsakymas.']));
    const view = await render(<AssistantScreen />);
    await ask(view, 'Klausimas?');
    await settled(view, 'Atsakymas.');
    expect(mockCreateThread).toHaveBeenCalledTimes(1);

    // Some OTHER thread deleted — the chat stays
    await act(async () => {
      mockDeleteListeners.forEach((listener) => listener('another-thread'));
    });
    expect(view.getAllByTestId('assistantuikit-message-user')).toHaveLength(1);

    // THIS chat's minted thread deleted — it leaves the screen
    await act(async () => {
      mockDeleteListeners.forEach((listener) => listener('thread-fixed-1'));
    });
    expect(view.queryAllByTestId('assistantuikit-message-user')).toHaveLength(0);
    expect(view.getByText('assistant.emptyTitle')).toBeTruthy();
  });

  it('the header offers "new conversation" once a chat is on screen, and it starts a fresh one', async () => {
    serverHolder.current!.script(textReply(['Atsakymas.']));
    const view = await render(<AssistantScreen />);
    // Nothing to leave yet — only the history door
    expect(view.queryByLabelText('assistant.threadsNew')).toBeNull();

    await ask(view, 'Klausimas?');
    await settled(view, 'Atsakymas.');
    await fireEvent.press(view.getByLabelText('assistant.threadsNew'));

    expect(view.queryAllByTestId('assistantuikit-message-user')).toHaveLength(0);
    expect(view.getByText('assistant.emptyTitle')).toBeTruthy();
    expect(view.queryByLabelText('assistant.threadsNew')).toBeNull();
    // The next send mints a NEW thread — the old one is left
    serverHolder.current!.script(textReply(['Kitas.']));
    await ask(view, 'Kitas klausimas?');
    await settled(view, 'Kitas.');
    expect(mockCreateThread).toHaveBeenCalledTimes(2);
  });

  it('a malformed ?thread param is never fetched', async () => {
    mockParams = { thread: '../../etc/passwd', n: '1' };
    await render(<AssistantScreen />);
    await act(async () => {});
    expect(mockFetchThreadMessages).not.toHaveBeenCalled();
  });

  it('a transcript that fails to load keeps the chat on screen and toasts', async () => {
    serverHolder.current!.script(textReply(['Pirmas atsakymas.']));
    const view = await render(<AssistantScreen />);
    await ask(view, 'Klausimas?');
    await settled(view, 'Pirmas atsakymas.');

    mockFetchThreadMessages.mockRejectedValueOnce(new Error('offline'));
    mockParams = { thread: 'b2c3d4e5-1111-2222-3333-444455556666', n: '9' };
    await view.rerender(<AssistantScreen />);
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', 'assistant.threadsError'));
    expect(view.getByText('Pirmas atsakymas.')).toBeTruthy();
    expect(view.queryByText('loading')).toBeNull();
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
