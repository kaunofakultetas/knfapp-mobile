// -----------------------------------------------------------
//  [*] Tests — the assistant conversation history screen
//
//  The chooser between the tab and the stored threads: the
//  list renders titles with the preview second line, the
//  "new conversation" row and every thread row navigate
//  INTO the tab with a nonce (each tap distinct, so the
//  tab's consumed-once param works every time), the session
//  kind picks which listing the service runs, delete asks
//  FIRST and only a confirmed tap reaches the server (then
//  the list reloads, a success toast says so), a failed
//  delete keeps the row and toasts the failure, a second trash
//  tap while one delete is in flight is ignored, a pull
//  refreshes the list, a row without an answer shows its age
//  ONCE, the screen reader hears title + preview + age and a
//  named trash button, and a failed load shows the error
//  state whose retry refetches. The threads service is
//  faked at its seam; useLoad is a faithful mini
//  implementation (the real one is pinned by its own suite
//  and needs the dataengine provider).
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AssistantThreadsScreen from '@/app/(main)/assistant-threads/index';

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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'lt' } }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: { brand: '#7B003F', onBrand: '#FFF', ink: '#111', inkSoft: '#666', danger: '#C00' },
  }),
}));

jest.mock('@/services/format', () => ({ formatRelativeAgo: () => 'prieš 2 val.' }));

let mockAuth: { isAuthenticated: boolean } = { isAuthenticated: false };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

// The ui barrel: passthrough chrome, an observable ErrorState
// retry, and the confirm seam the delete flow rides
const mockConfirm = jest.fn(async () => true);
jest.mock('@/components/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads; only require() can reach the primitives
  const { Pressable, Text, View } = require('react-native');
  return {
    // The pull is a pressable here — the gesture itself is the
    // platform's, the screen's job is what onRefresh does
    RefreshSpinner: ({ onRefresh, refreshing }: { onRefresh?: () => void; refreshing?: boolean }) => (
      <Pressable testID="pull-to-refresh" accessibilityState={{ busy: refreshing }} onPress={onRefresh} />
    ),
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    LoadingSpinner: () => <Text>loading</Text>,
    EmptyState: ({ title }: { title: string }) => <Text>{title}</Text>,
    ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
      <View>
        <Text>{message}</Text>
        <Pressable testID="error-retry" onPress={onRetry} />
      </View>
    ),
    confirmAction: (...args: unknown[]) => mockConfirm(...(args as [])),
  };
});

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads
  const React = require('react');
  return {
    useRouter: () => ({ navigate: mockNavigate }),
    useFocusEffect: (effect: () => void) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

// A faithful mini useLoad — the real hook is pinned by its own
// suite and demands the dataengine provider this screen test
// does not need
jest.mock('@knf/dataengine', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a mock factory runs before the module graph loads
  const React = require('react');
  return {
    useLoad: (fetcher: () => Promise<unknown>, deps: unknown[]) => {
      const [state, setState] = React.useState({ data: null, loading: true, error: false });
      const run = React.useCallback(async (spinner: boolean) => {
        if (spinner) setState({ data: null, loading: true, error: false });
        try {
          const data = await fetcher();
          setState({ data, loading: false, error: false });
        } catch {
          setState((was: object) => ({ ...was, loading: false, error: true }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the screen's deps contract, verbatim
      }, deps);
      React.useEffect(() => { void run(true); }, [run]);
      // STABLE identities, like the real hook — the screen's
      // focus effect depends on refresh, and a fresh function
      // per render would refetch forever
      const refresh = React.useCallback(() => run(false), [run]);
      const retry = React.useCallback(() => run(true), [run]);
      return { ...state, refresh, retry };
    },
  };
});

const mockListThreads = jest.fn();
const mockDeleteThread = jest.fn(async () => {});
jest.mock('@/services/assistantThreads', () => ({
  listThreads: (...args: unknown[]) => mockListThreads(...(args as [])),
  deleteThread: (...args: unknown[]) => mockDeleteThread(...(args as [])),
}));


const thread = (id: string, title: string, preview: string | null = null) => ({
  id, title, preview, language: 'lt' as const,
  createdAt: '2026-09-15T10:00:00Z', lastMessageAt: '2026-09-15T12:00:00Z',
});

type View = Awaited<ReturnType<typeof render>>;
const loaded = async (view: View, text: string) =>
  waitFor(() => expect(view.getByText(text)).toBeTruthy());


beforeEach(() => {
  mockAuth = { isAuthenticated: false };
  mockNavigate.mockClear();
  mockConfirm.mockClear();
  mockConfirm.mockResolvedValue(true);
  mockShowToast.mockClear();
  mockDeleteThread.mockReset();
  mockDeleteThread.mockResolvedValue(undefined);
  mockListThreads.mockReset();
  mockListThreads.mockResolvedValue([
    thread('t-1', 'Kada paskaitos?', 'Rytoj 9:00, 215 aud.'),
    thread('t-2', 'Stipendija'),
  ]);
});


describe('the conversation history screen', () => {
  it('lists titles with the preview second line, and asks the service for the SESSION kind', async () => {
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');

    expect(mockListThreads).toHaveBeenCalledWith({ signedIn: false });
    expect(view.getByText('Rytoj 9:00, 215 aud.')).toBeTruthy();
    expect(view.getByText('Stipendija')).toBeTruthy();

    mockAuth = { isAuthenticated: true };
    const signedIn = await render(<AssistantThreadsScreen />);
    await loaded(signedIn, 'Kada paskaitos?');
    expect(mockListThreads).toHaveBeenLastCalledWith({ signedIn: true });
  });

  it('a row opens its thread in the tab with a nonce; the new-row opens a fresh chat', async () => {
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');

    await fireEvent.press(view.getByText('Kada paskaitos?'));
    expect(mockNavigate).toHaveBeenCalledWith({
      pathname: '/(main)/tabs/assistant',
      params: expect.objectContaining({ thread: 't-1', n: expect.any(String) }),
    });

    await fireEvent.press(view.getByText('assistant.threadsNew'));
    expect(mockNavigate).toHaveBeenLastCalledWith({
      pathname: '/(main)/tabs/assistant',
      params: expect.objectContaining({ thread: 'new', n: expect.any(String) }),
    });
  });

  it('delete asks first — a confirmed tap deletes and reloads the list', async () => {
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');
    mockListThreads.mockResolvedValue([thread('t-2', 'Stipendija')]);

    await fireEvent.press(view.getAllByLabelText('assistant.threadsDeleteNamed')[0]);

    await waitFor(() => expect(mockDeleteThread).toHaveBeenCalledWith('t-1'));
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'assistant.threadsDeleteConfirmTitle',
      destructive: true,
    }));
    // The reload happened and the row is gone — and it was said
    await waitFor(() => expect(view.queryByText('Kada paskaitos?')).toBeNull());
    expect(view.getByText('Stipendija')).toBeTruthy();
    expect(mockShowToast).toHaveBeenCalledWith('success', 'assistant.threadsDeleted');
  });

  it('a failed delete keeps the row and says so', async () => {
    mockDeleteThread.mockRejectedValueOnce(new Error('502'));
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');

    await fireEvent.press(view.getAllByLabelText('assistant.threadsDeleteNamed')[0]);
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('error', 'assistant.threadsDeleteFailed'));
    expect(view.getByText('Kada paskaitos?')).toBeTruthy();
    expect(mockShowToast).not.toHaveBeenCalledWith('success', expect.anything());
  });

  it('a second trash tap while a delete is in flight is ignored', async () => {
    let answer: (confirmed: boolean) => void = () => {};
    mockConfirm.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      answer = resolve;
    }));
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');

    // The second tap lands while the first still waits on its
    // confirm — the first holds the guard across its whole chain
    const trash = view.getAllByLabelText('assistant.threadsDeleteNamed');
    await fireEvent.press(trash[0]);
    await fireEvent.press(trash[1]);
    await act(async () => answer(true));
    await waitFor(() => expect(mockDeleteThread).toHaveBeenCalledTimes(1));
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockDeleteThread).toHaveBeenCalledWith('t-1');
  });

  it('a pull refreshes the list in place', async () => {
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');
    mockListThreads.mockResolvedValue([thread('t-9', 'Naujas klausimas', 'Atsakymas')]);

    await fireEvent.press(view.getByTestId('pull-to-refresh'));
    await loaded(view, 'Naujas klausimas');
    expect(view.queryByText('Kada paskaitos?')).toBeNull();
  });

  it('a row without an answer shows its age once; the reader hears title, preview and age', async () => {
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Stipendija');
    // t-1 has a preview (age beside the title), t-2 none (age
    // on the second line only) — two ages, never three
    expect(view.getAllByText('prieš 2 val.')).toHaveLength(2);
    expect(view.getByLabelText('Kada paskaitos?, Rytoj 9:00, 215 aud., prieš 2 val.')).toBeTruthy();
    expect(view.getByLabelText('Stipendija, prieš 2 val.')).toBeTruthy();
  });

  it('a declined confirm deletes NOTHING', async () => {
    mockConfirm.mockResolvedValue(false);
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'Kada paskaitos?');

    await fireEvent.press(view.getAllByLabelText('assistant.threadsDeleteNamed')[0]);
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockDeleteThread).not.toHaveBeenCalled();
    expect(view.getByText('Kada paskaitos?')).toBeTruthy();
  });

  it('a failed load shows the error state and retry refetches', async () => {
    mockListThreads.mockRejectedValueOnce(new Error('502'));
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'assistant.threadsError');

    await fireEvent.press(view.getByTestId('error-retry'));
    await loaded(view, 'Kada paskaitos?');
  });

  it('an empty history shows the empty state, not a bare screen', async () => {
    mockListThreads.mockResolvedValue([]);
    const view = await render(<AssistantThreadsScreen />);
    await loaded(view, 'assistant.threadsEmptyTitle');
  });
});
