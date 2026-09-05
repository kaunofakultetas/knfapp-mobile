// -----------------------------------------------------------
//  [*] Tests — the settings screen's notification block
//
//  The screen over a stubbed engine and the real kit. The gate:
//  denied-for-good shows the open-settings card whose button
//  deep-links and never asks the engine, unsupported shows the
//  honest note, undetermined shows the prompt card whose button
//  asks the engine once. The rows: a guest gets the master
//  switch alone and never asks the wire; an account gets the
//  channel rows LOCKED until this screen's own read lands — a
//  'fresh' or 'stale' store from before unlocks nothing, a
//  session flip re-locks and reads again, an answer landing
//  after a sign-out is dropped; a failed first read shows the
//  retry row, whose press reads again. The facade: a master-ON
//  the engine reports as impossible snaps back with the
//  permission / unsupported toast, one that failed on the wire
//  stays ON with the network toast, a guest's (answered
//  'unauthenticated') stays ON in silence; a chat-preview save
//  the engine reverted toasts the save error, a confirmed one
//  is silent. Reset re-enables a switched-off master — guests
//  included — with the same outcomes. Pull-to-refresh reads for
//  an account only, and a failed pull is a failed READ (generic
//  toast), never a failed save.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SettingsScreen from '@/app/(main)/tabs/settings';
import { notifyEngine } from '@/services/notifyEngine';

import type { createNotifyEngineStub } from '@knf/notifyengine/testing';


// One stub for the whole file — the screen imports the
// singleton, so the tests drive the same object it renders
jest.mock('@/services/notifyEngine', () => {
  const { createNotifyEngineStub: makeStub } = jest.requireActual('@knf/notifyengine/testing');
  const stub = makeStub();
  return { notifyEngine: stub, readyNotifyEngine: async () => stub };
});

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

let mockAuthenticated = true;
const mockLogout = jest.fn(async () => {});
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockAuthenticated,
    user: mockAuthenticated
      ? { id: 'u1', username: 'jonas', email: 'jonas@knf.vu.lt', displayName: 'Jonas', role: 'student' }
      : null,
    logout: mockLogout,
    loggingOut: false,
  }),
}));

const mockResetSettings = jest.fn();
jest.mock('@/context/AppContext', () => ({
  useApp: () => ({
    theme: 'system',
    language: 'lt',
    setTheme: jest.fn(),
    setLanguage: jest.fn(),
    resetSettings: mockResetSettings,
  }),
}));

jest.mock('@/services/api', () => ({ API_BASE_URL: 'https://api.test' }));
jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/settings' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', brandSoft: '#F5E4EC', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
      surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00', dangerSoft: '#FEE',
      accent: '#C62B4C', shadow: '#000',
    },
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'lt' } }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

// The confirm dialog answers yes; the refresh control becomes a
// pressable so the pull can be driven by hand
const mockConfirm = jest.fn(async () => true);
jest.mock('@/components/ui', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    Screen: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    Header: ({ title }: { title: string }) => <Text>{title}</Text>,
    Card: ({ children }: { children?: unknown }) => <View>{children as never}</View>,
    SectionTitle: ({ children }: { children?: unknown }) => <Text>{children as never}</Text>,
    Avatar: () => null,
    Button: ({ title, onPress }: { title: string; onPress?: () => void }) => (
      <Pressable onPress={onPress} accessibilityRole="button">
        <Text>{title}</Text>
      </Pressable>
    ),
    RefreshSpinner: ({ onRefresh }: { onRefresh?: () => void }) => (
      <Pressable testID="pull-to-refresh" onPress={onRefresh} />
    ),
    confirmAction: (...args: unknown[]) => mockConfirm(...(args as [])),
  };
});


type Stub = ReturnType<typeof createNotifyEngineStub>;
type Prefs = ReturnType<Stub['prefs']['get']>;
type Permission = ReturnType<Stub['permission']['get']>;
const stub = notifyEngine as unknown as Stub;

const FRESH: Prefs = {
  masterEnabled: true,
  channels: { news: true, chat: true, schedule: true, admin: true },
  chatPreview: true,
  syncState: 'fresh',
};

const GRANTED: Permission = { status: 'granted', canAskAgain: true, canDeliver: true };
const BLOCKED: Permission = { status: 'denied', canAskAgain: false, canDeliver: false };
const UNDETERMINED: Permission = { status: 'undetermined', canAskAgain: true, canDeliver: false };
const UNSUPPORTED: Permission = { status: 'unsupported', canAskAgain: false, canDeliver: false };

const callsOf = (method: string) => stub.calls.filter((call) => call.method === method);
const refreshCalls = () => callsOf('refreshPrefs').length;
const newsRowDisabled = (view: Awaited<ReturnType<typeof render>>) =>
  view.getByTestId('notifyuikit-channel-news').props.disabled as boolean | undefined;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

// A store write from "the engine" — inside act so the screen's
// subscriptions settle before the next assertion
const engineSets = (snapshot: Prefs) =>
  act(async () => {
    stub.prefs.set(snapshot);
  });

// Spies on the shared stub are restored after EVERY test, pass
// or fail — a failing assertion must never leak a scripted
// setMasterEnabled into the next case
const spies: jest.SpyInstance[] = [];
const track = <S extends jest.SpyInstance>(spy: S): S => {
  spies.push(spy);
  return spy;
};

// A register the engine could not complete: the intent is
// recorded (the store flips), the reason comes back typed. The
// stub's own signature only knows the ok shape, hence the cast;
// the call is logged by hand so callsOf() stays truthful
type DenyReason = 'permission' | 'unsupported' | 'network' | 'unauthenticated';
const denyMasterOn = (reason: DenyReason) =>
  track(
    jest.spyOn(stub, 'setMasterEnabled').mockImplementation((async (on: boolean) => {
      stub.calls.push({ method: 'setMasterEnabled', args: [on] });
      stub.prefs.set({ ...stub.prefs.get(), masterEnabled: on });
      return on ? { ok: false, reason } : undefined;
    }) as unknown as Stub['setMasterEnabled']),
  );

// The stub's refreshPrefs leaves the store alone, so a test
// that needs a read to LAND (fresh, error, or not yet) scripts
// each successive read here; reads past the script change
// nothing, like the stub. The call log keeps counting (the
// stub's signature answers with the log length, hence the cast)
type Read = () => void | Promise<void>;
const scriptReads = (...reads: Read[]) =>
  track(
    jest.spyOn(stub, 'refreshPrefs').mockImplementation((async () => {
      stub.calls.push({ method: 'refreshPrefs', args: [] });
      await reads.shift()?.();
    }) as unknown as Stub['refreshPrefs']),
  );

const lands = (snapshot: Prefs): Read => () => {
  stub.prefs.set(snapshot);
};

// A read the engine has not answered yet; release() lets it
// land with the given snapshot
const pendingRead = (snapshot: Prefs) => {
  let release: () => void = () => {};
  const answered = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read: Read = async () => {
    await answered;
    stub.prefs.set(snapshot);
  };
  return { read, release: () => release() };
};

// A chat-preview save the engine confirmed (true) or reverted
// (false) — per the engine's contract the store flips first
// and, on a revert, flips back before the promise settles
const scriptChatPreview = (confirmed: boolean) =>
  track(
    jest.spyOn(stub, 'setChatPreview').mockImplementation((async (on: boolean) => {
      stub.calls.push({ method: 'setChatPreview', args: [on] });
      stub.prefs.set({ ...stub.prefs.get(), chatPreview: confirmed ? on : !on });
      return confirmed;
    }) as unknown as Stub['setChatPreview']),
  );


beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticated = true;
  stub.calls.length = 0;
  stub.permission.set(GRANTED);
  stub.prefs.set(FRESH);
});

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});


describe('the permission gate', () => {
  it('denied for good: the open-settings card, no switches, and the button deep-links without asking the engine', async () => {
    const openSettings = track(jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined));
    stub.permission.set(BLOCKED);
    const view = await render(<SettingsScreen />);
    await flush();

    expect(view.getByTestId('notifyuikit-blocked')).toBeTruthy();
    expect(view.getByText('settings.pushBlockedTitle')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-master')).toBeNull();

    await fireEvent.press(view.getByTestId('notifyuikit-gate-action'));
    await flush();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(callsOf('requestPermission')).toHaveLength(0);
    expect(callsOf('setMasterEnabled')).toHaveLength(0);
  });

  it('unsupported: the honest note alone — and a guest still never touches the engine', async () => {
    mockAuthenticated = false;
    stub.permission.set(UNSUPPORTED);
    const view = await render(<SettingsScreen />);
    await flush();

    expect(view.getByTestId('notifyuikit-unsupported')).toBeTruthy();
    expect(view.getByText('settings.pushUnsupported')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-master')).toBeNull();
    expect(stub.calls).toEqual([]);
  });

  it('undetermined: the prompt card, whose button asks the engine once', async () => {
    stub.permission.set(UNDETERMINED);
    const view = await render(<SettingsScreen />);
    await flush();

    expect(view.getByTestId('notifyuikit-prompt')).toBeTruthy();
    expect(view.getByText('settings.pushPromptTitle')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-master')).toBeNull();

    await fireEvent.press(view.getByTestId('notifyuikit-gate-action'));
    await flush();
    expect(callsOf('requestPermission')).toHaveLength(1);
  });
});


describe('guest', () => {
  it('renders the master switch alone and never reads server truth', async () => {
    mockAuthenticated = false;
    const view = await render(<SettingsScreen />);
    await flush();

    expect(view.getByTestId('notifyuikit-master')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-channel-news')).toBeNull();
    expect(view.queryByTestId('notifyuikit-chat-preview')).toBeNull();
    expect(refreshCalls()).toBe(0);
  });

  it('a pull just retracts', async () => {
    mockAuthenticated = false;
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByTestId('pull-to-refresh'));
    await flush();
    expect(refreshCalls()).toBe(0);
  });

  it("a master-ON the engine answers 'unauthenticated' stays ON in silence — the intent is recorded, login claims the token", async () => {
    mockAuthenticated = false;
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('unauthenticated');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
    expect(stub.prefs.get().masterEnabled).toBe(true);
    expect(callsOf('register')).toHaveLength(0);
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});


describe('signed in', () => {
  it('shows the channel rows and reads server truth once on mount', async () => {
    const view = await render(<SettingsScreen />);
    await flush();

    for (const key of ['news', 'chat', 'schedule', 'admin']) {
      expect(view.getByTestId(`notifyuikit-channel-${key}`)).toBeTruthy();
    }
    expect(view.getByTestId('notifyuikit-chat-preview')).toBeTruthy();
    expect(refreshCalls()).toBe(1);
    // The mount read landed without error: the rows unlock
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('a pull reads server truth again', async () => {
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByTestId('pull-to-refresh'));
    await flush();
    expect(refreshCalls()).toBe(2);
  });

  it("a store still 'stale' locks the rows — no retry row — until this screen's read lands", async () => {
    stub.prefs.set({ ...FRESH, syncState: 'stale' });
    const first = pendingRead(FRESH);
    scriptReads(first.read);
    const view = await render(<SettingsScreen />);
    await flush();

    expect(newsRowDisabled(view)).toBe(true);
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();
    expect(refreshCalls()).toBe(1);

    first.release();
    await flush();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it("a 'fresh' left behind by a previous account unlocks nothing until this screen's own read lands", async () => {
    const own = pendingRead(FRESH);
    scriptReads(own.read);
    const view = await render(<SettingsScreen />);
    await flush();

    // The store already says fresh — the rows stay locked anyway
    expect(stub.prefs.get().syncState).toBe('fresh');
    expect(newsRowDisabled(view)).toBe(true);
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();

    own.release();
    await flush();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('a session flip re-locks the rows and reads again; a guest loses them', async () => {
    mockAuthenticated = false;
    const first = pendingRead(FRESH);
    const second = pendingRead(FRESH);
    scriptReads(first.read, second.read);
    const view = await render(<SettingsScreen />);
    await flush();
    expect(view.queryByTestId('notifyuikit-channel-news')).toBeNull();
    expect(refreshCalls()).toBe(0);

    // Sign in: the rows appear locked and one read starts
    mockAuthenticated = true;
    await view.rerender(<SettingsScreen />);
    await flush();
    expect(newsRowDisabled(view)).toBe(true);
    expect(refreshCalls()).toBe(1);
    first.release();
    await flush();
    expect(newsRowDisabled(view)).toBeFalsy();

    // Sign out: the rows go; the store keeps the last account's fresh
    mockAuthenticated = false;
    await view.rerender(<SettingsScreen />);
    await flush();
    expect(view.queryByTestId('notifyuikit-channel-news')).toBeNull();

    // The next account starts locked despite that fresh, and reads for itself
    mockAuthenticated = true;
    await view.rerender(<SettingsScreen />);
    await flush();
    expect(newsRowDisabled(view)).toBe(true);
    expect(refreshCalls()).toBe(2);
    second.release();
    await flush();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('an answer that lands after a sign-out unlocks nothing for the next account', async () => {
    const late = pendingRead(FRESH);
    const own = pendingRead(FRESH);
    scriptReads(late.read, own.read);
    const view = await render(<SettingsScreen />);
    await flush();
    expect(newsRowDisabled(view)).toBe(true);

    mockAuthenticated = false;
    await view.rerender(<SettingsScreen />);
    await flush();
    // The old session's read lands now — nobody is listening
    late.release();
    await flush();

    mockAuthenticated = true;
    await view.rerender(<SettingsScreen />);
    await flush();
    expect(newsRowDisabled(view)).toBe(true);
    expect(refreshCalls()).toBe(2);

    own.release();
    await flush();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('a failed first read shows the retry row, locks the rows, and the press reads again', async () => {
    scriptReads(lands({ ...FRESH, syncState: 'error' }), lands(FRESH));
    const view = await render(<SettingsScreen />);
    await flush();

    expect(view.getByText('settings.channelsLoadError')).toBeTruthy();
    expect(newsRowDisabled(view)).toBe(true);

    await fireEvent.press(view.getByLabelText('common.tryAgain'));
    await flush();
    expect(refreshCalls()).toBe(2);

    // The retry landed: the row goes, the switches unlock
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('a later failed save never re-locks rows that already showed truth', async () => {
    const view = await render(<SettingsScreen />);
    await flush();

    await engineSets({ ...FRESH, syncState: 'flushing' });
    await engineSets({ ...FRESH, syncState: 'error' });
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();
    expect(newsRowDisabled(view)).toBeFalsy();
    // ...but the user hears about the failed save
    expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.channelUpdateError');
  });

  it('a failed read after truth arrived toasts nothing about saving', async () => {
    const view = await render(<SettingsScreen />);
    await flush();

    await engineSets({ ...FRESH, syncState: 'error' });
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('a pull that fails toasts the generic error — a failed read is not a failed save', async () => {
    scriptReads(lands(FRESH), lands({ ...FRESH, syncState: 'error' }));
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByTestId('pull-to-refresh'));
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'toast.genericError');
    expect(mockShowToast).not.toHaveBeenCalledWith('error', 'settings.channelUpdateError');
    // The rows already showed truth — no retry row, no re-lock
    expect(view.queryByText('settings.channelsLoadError')).toBeNull();
    expect(newsRowDisabled(view)).toBeFalsy();
  });

  it('a chat-preview save the engine confirmed is silent', async () => {
    scriptChatPreview(true);
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-chat-preview'), 'valueChange', false);
    await flush();

    expect(callsOf('setChatPreview')).toEqual([{ method: 'setChatPreview', args: [false] }]);
    expect(stub.prefs.get().chatPreview).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('a chat-preview save the engine reverted toasts the save error', async () => {
    scriptChatPreview(false);
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-chat-preview'), 'valueChange', false);
    await flush();

    expect(stub.prefs.get().chatPreview).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.channelUpdateError');
  });
});


describe('master switch', () => {
  it('a blocked master-ON snaps back with the permission toast', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('permission');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.pushPermissionDenied');
    expect(spy).toHaveBeenLastCalledWith(false);
    expect(stub.prefs.get().masterEnabled).toBe(false);
  });

  it('an unsupported master-ON snaps back with the runtime toast', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('unsupported');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.pushUnsupported');
    expect(spy).toHaveBeenLastCalledWith(false);
    expect(stub.prefs.get().masterEnabled).toBe(false);
  });

  it('a master-ON that failed on the wire stays ON with the network toast', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('network');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'toast.networkError');
    // No snap-back: the intent is stored, the next register re-asserts it
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stub.prefs.get().masterEnabled).toBe(true);
  });

  it('reset re-enables a switched-off master', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByText('settings.resetDefaults'));
    await flush();

    expect(mockResetSettings).toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith('success', 'settings.resetDone');
    expect(callsOf('setMasterEnabled').some((call) => call.args[0] === true)).toBe(true);
    expect(stub.prefs.get().masterEnabled).toBe(true);
  });

  it('reset leaves an already-on master alone', async () => {
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByText('settings.resetDefaults'));
    await flush();

    expect(mockResetSettings).toHaveBeenCalled();
    expect(callsOf('setMasterEnabled')).toHaveLength(0);
  });

  it('reset snaps the master back off with the toast when delivery is blocked', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('permission');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByText('settings.resetDefaults'));
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.pushPermissionDenied');
    expect(spy).toHaveBeenLastCalledWith(false);
    expect(stub.prefs.get().masterEnabled).toBe(false);
  });

  it('reset that fails on the wire keeps the master ON and toasts the network error', async () => {
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('network');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByText('settings.resetDefaults'));
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('success', 'settings.resetDone');
    expect(mockShowToast).toHaveBeenCalledWith('error', 'toast.networkError');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(stub.prefs.get().masterEnabled).toBe(true);
  });

  it("a guest reset re-enables the master too — the engine records the intent ('unauthenticated') and the switch stays ON in silence", async () => {
    mockAuthenticated = false;
    stub.prefs.set({ ...FRESH, masterEnabled: false });
    const spy = denyMasterOn('unauthenticated');
    const view = await render(<SettingsScreen />);
    await flush();

    await fireEvent.press(view.getByText('settings.resetDefaults'));
    await flush();

    expect(mockResetSettings).toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
    expect(stub.prefs.get().masterEnabled).toBe(true);
    expect(callsOf('register')).toHaveLength(0);
    expect(refreshCalls()).toBe(0);
    // Only the reset's own success toast — nothing about the register
    expect(mockShowToast).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith('success', 'settings.resetDone');
  });
});
