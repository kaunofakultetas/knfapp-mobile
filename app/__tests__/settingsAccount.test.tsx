// -----------------------------------------------------------
//  [*] Tests — the settings screen's account section and footer
//
//  The GDPR access right (KNF-192): a signed-in account gets a
//  "download my data" row, a guest never does. One press is one
//  export — the row locks and reads busy while it runs — and
//  the JSON reaches the device the platform's way: iOS writes
//  the cache file and opens the share sheet, Android writes
//  into the folder the system picker returned (a closed picker
//  says nothing), a failed fetch speaks the shared API error
//  copy, a failed write the export's own line. The footer
//  names the version for everyone and the backend address only
//  for dev builds and staff. The notify kit sets its text in
//  the screen's Raleway — the "no push here" note included —
//  and the language pills are radios named from the catalog.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform, Share } from 'react-native';

import SettingsScreen from '@/app/(main)/tabs/settings';
import { notifyEngine } from '@/services/notifyEngine';

import type { createNotifyEngineStub } from '@knf/notifyengine/testing';


jest.mock('@/services/notifyEngine', () => {
  const { createNotifyEngineStub: makeStub } = jest.requireActual('@knf/notifyengine/testing');
  const stub = makeStub();
  return { notifyEngine: stub, readyNotifyEngine: async () => stub };
});

const mockShowToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

let mockRole: string | null = 'student';
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: mockRole !== null,
    user: mockRole
      ? { id: 'u1', username: 'jonas', email: 'jonas@knf.vu.lt', displayName: 'Jonas', role: mockRole }
      : null,
    logout: jest.fn(async () => {}),
    loggingOut: false,
  }),
}));

jest.mock('@/context/AppContext', () => ({
  useApp: () => ({
    theme: 'system',
    language: 'lt',
    setTheme: jest.fn(),
    setLanguage: jest.fn(),
    resetSettings: jest.fn(),
  }),
}));

// The export call and the error → copy map, scriptable per test
const mockExport = jest.fn();
jest.mock('@/services/api', () => ({
  API_BASE_URL: 'https://api.test',
  exportMyDataApi: (...args: unknown[]) => mockExport(...args),
  apiErrorKey: () => 'errors.http.429',
}));

// The file system: a cache File that records create/write, and
// a folder picker the tests answer
const mockFileCreate = jest.fn();
const mockFileWrite = jest.fn();
const mockPick = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: jest.fn().mockImplementation((_dir: unknown, name: string) => ({
    uri: `file:///cache/${name}`,
    create: (...args: unknown[]) => mockFileCreate(...args),
    write: (...args: unknown[]) => mockFileWrite(...args),
  })),
  Directory: { pickDirectoryAsync: (...args: unknown[]) => mockPick(...args) },
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '2.3.4' } } }));

jest.mock('@/hooks/useReturnHref', () => ({ useReturnHref: () => '/settings' }));
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    scheme: 'light',
    colors: {
      brand: '#7B003F', brandSoft: '#F5E4EC', onBrand: '#FFF', ink: '#111', inkSoft: '#666', inkFaint: '#999',
      surface: '#FFF', surfaceSoft: '#EEE', line: '#DDD', danger: '#C00', dangerSoft: '#FEE',
    },
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key),
    i18n: { language: 'lt' },
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

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
    RefreshSpinner: () => null,
    confirmAction: async () => true,
  };
});


type Stub = ReturnType<typeof createNotifyEngineStub>;
const stub = notifyEngine as unknown as Stub;

const EXPORT = { exportedAt: '2026-09-25T10:00:00Z', profile: { username: 'jonas' } };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

const flatStyle = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'student';
  stub.calls.length = 0;
  stub.permission.set({ status: 'granted', canAskAgain: true, canDeliver: true });
  mockExport.mockResolvedValue(EXPORT);
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction } as never);
});

afterEach(() => {
  shareSpy.mockRestore();
});


describe('download my data (KNF-192)', () => {
  it('a signed-in account gets the row; a guest never does', async () => {
    const view = await render(<SettingsScreen />);
    expect(view.getByTestId('settings-export-data')).toBeTruthy();
    expect(view.getByLabelText('settings.exportData').props.accessibilityHint).toBe('settings.exportDataDesc');

    mockRole = null;
    const guest = await render(<SettingsScreen />);
    expect(guest.queryByTestId('settings-export-data')).toBeNull();
  });

  it('iOS: the JSON goes to a dated cache file and the share sheet opens on it — nothing to toast', async () => {
    const view = await render(<SettingsScreen />);
    await fireEvent.press(view.getByTestId('settings-export-data'));
    await flush();

    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockFileCreate).toHaveBeenCalledWith({ overwrite: true });
    expect(mockFileWrite).toHaveBeenCalledWith(JSON.stringify(EXPORT, null, 2));
    const [content, options] = shareSpy.mock.calls[0];
    expect(content.url).toMatch(/^file:\/\/\/cache\/knfapp-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(options).toEqual({ subject: 'settings.exportDataShareTitle' });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('one press is one export — the row locks and reads busy until it settles', async () => {
    let answer: (value: unknown) => void = () => {};
    mockExport.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByTestId('settings-export-data'));
    await fireEvent.press(view.getByTestId('settings-export-data'));
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('settings-export-data').props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    await act(async () => answer(EXPORT));
    await flush();
    expect(view.getByTestId('settings-export-data').props.accessibilityState).toMatchObject({ busy: false });
  });

  describe('on Android', () => {
    let restoreOS: () => void;
    beforeEach(() => {
      const replaced = jest.replaceProperty(Platform, 'OS', 'android');
      restoreOS = () => replaced.restore();
    });
    afterEach(() => restoreOS());

    it('the file is written into the folder the picker returned, and the save is confirmed', async () => {
      const created = { write: jest.fn() };
      const createFile = jest.fn(() => created);
      mockPick.mockResolvedValue({ createFile });
      const view = await render(<SettingsScreen />);

      await fireEvent.press(view.getByTestId('settings-export-data'));
      await flush();

      expect(createFile).toHaveBeenCalledWith(expect.stringMatching(/^knfapp-data-.*\.json$/), 'application/json');
      expect(created.write).toHaveBeenCalledWith(JSON.stringify(EXPORT, null, 2));
      expect(shareSpy).not.toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('success', 'settings.exportDataSaved');
    });

    it('a picker the person closed is a choice, not an error — silence', async () => {
      mockPick.mockRejectedValue(Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }));
      const view = await render(<SettingsScreen />);

      await fireEvent.press(view.getByTestId('settings-export-data'));
      await flush();

      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('a folder that cannot be written toasts the save failure', async () => {
      mockPick.mockResolvedValue({
        createFile: () => ({
          write: () => {
            throw new Error('Unable to write');
          },
        }),
      });
      const view = await render(<SettingsScreen />);

      await fireEvent.press(view.getByTestId('settings-export-data'));
      await flush();

      expect(mockShowToast).toHaveBeenCalledWith('error', 'settings.exportDataSaveError');
    });
  });

  it('a refused fetch speaks the shared API error copy and writes nothing', async () => {
    mockExport.mockRejectedValue(Object.assign(new Error('429'), { status: 429 }));
    const view = await render(<SettingsScreen />);

    await fireEvent.press(view.getByTestId('settings-export-data'));
    await flush();

    expect(mockShowToast).toHaveBeenCalledWith('error', 'errors.http.429');
    expect(mockFileWrite).not.toHaveBeenCalled();
    expect(shareSpy).not.toHaveBeenCalled();
    // ...and the row is free again for a later try
    expect(view.getByTestId('settings-export-data').props.accessibilityState).toMatchObject({ busy: false });
  });
});


describe('the footer', () => {
  const realDev = (global as { __DEV__?: boolean }).__DEV__;
  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = realDev;
  });

  it('names the app version for everyone', async () => {
    const view = await render(<SettingsScreen />);
    expect(view.getByText('VU KNF · menu.version {"version":"2.3.4"}')).toBeTruthy();
  });

  it('a release build shows a student no server address — staff still get it', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    const student = await render(<SettingsScreen />);
    expect(student.queryByText(/settings\.serverAddress/)).toBeNull();

    mockRole = 'curator';
    const staff = await render(<SettingsScreen />);
    expect(staff.getByText('settings.serverAddress {"url":"https://api.test"}')).toBeTruthy();
  });

  it('a dev build shows the address to anyone — it is how a misconfigured build is told from offline', async () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    const view = await render(<SettingsScreen />);
    expect(view.getByText('settings.serverAddress {"url":"https://api.test"}')).toBeTruthy();
  });
});


describe('typography and controls', () => {
  it("the notify kit sets in the screen's Raleway — the 'no push here' note included", async () => {
    stub.permission.set({ status: 'unsupported', canAskAgain: false, canDeliver: false });
    const view = await render(<SettingsScreen />);
    expect(flatStyle(view.getByText('settings.pushUnsupported').props.style).fontFamily).toBe('Raleway-Regular');
  });

  it("the switch rows use the screen's faces too", async () => {
    const view = await render(<SettingsScreen />);
    await flush();
    expect(flatStyle(view.getByText('settings.pushNotifications').props.style).fontFamily).toBe('Raleway-Medium');
  });

  it('the language pills are radios, named from the catalog', async () => {
    const view = await render(<SettingsScreen />);
    const lithuanian = view.getByLabelText('settings.languageLithuanian');
    expect(lithuanian.props.accessibilityRole).toBe('radio');
    expect(lithuanian.props.accessibilityState).toMatchObject({ checked: true });
    expect(view.getByLabelText('settings.languageEnglish').props.accessibilityState).toMatchObject({ checked: false });
  });
});
