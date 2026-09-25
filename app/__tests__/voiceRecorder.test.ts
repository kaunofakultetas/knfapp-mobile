// -----------------------------------------------------------
//  [*] Tests — useVoiceRecorder, a take ended mid-start
//
//  A start awaits the microphone permission and the recorder;
//  a take ended meanwhile (cancel, the room unmounting) once
//  let that start carry on — the microphone switched on with
//  nobody left to stop it and the ticker running for good. The
//  late start now backs out, puts the audio mode back and owes
//  nobody a toast. A normal take still sends as an audio pick.
// -----------------------------------------------------------

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// The toast spy — (level, message) per toast
const mockToast = jest.fn();
jest.mock('@/context/NetworkContext', () => ({ showToast: (...args: unknown[]) => mockToast(...args) }));

// The recorder stand-in and the permission answer each test
// scripts (a deferred one holds the start mid-await)
const mockRecorder = {
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  stop: jest.fn(async () => {}),
  uri: 'file:///take.m4a' as string | null,
  getStatus: jest.fn(() => ({ metering: -20 })),
};
let mockPermission: () => Promise<{ granted: boolean }> = async () => ({ granted: true });
// The audio-mode spy — the last call is the mode left behind
const mockSetAudioMode = jest.fn(async (_mode: { allowsRecording: boolean }) => {});
jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: () => mockPermission() },
  RecordingPresets: { HIGH_QUALITY: {} },
  setAudioModeAsync: (mode: { allowsRecording: boolean }) => mockSetAudioMode(mode),
  useAudioRecorder: () => mockRecorder,
}));

import { act, renderHook } from '@testing-library/react-native';

import { useVoiceRecorder } from '@/hooks/chat/useVoiceRecorder';







// -----------------------------------------------------------
// deferred
// -----------------------------------------------------------
//
// A promise with its resolver outside — holds an await open
// until the test lets it go.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}







// -----------------------------------------------------------
// flush
// -----------------------------------------------------------
//
// Lets pending promise continuations run inside act().
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}


describe('useVoiceRecorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.record.mockReset();
    mockRecorder.prepareToRecordAsync.mockReset().mockImplementation(async () => {});
    jest.useFakeTimers();
    mockPermission = async () => ({ granted: true });
    mockRecorder.uri = 'file:///take.m4a';
  });
  afterEach(() => jest.useRealTimers());

  it('a room left while the permission prompt is up never switches the mic on', async () => {
    const gate = deferred<{ granted: boolean }>();
    mockPermission = () => gate.promise;
    const hook = await renderHook(() => useVoiceRecorder(jest.fn(async () => {})));
    await act(async () => {
      void hook.result.current.start();
    });
    await act(async () => hook.unmount());
    gate.resolve({ granted: true });
    await flush();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(mockRecorder.getStatus).not.toHaveBeenCalled();
  });

  it('a cancel while the recorder prepares backs the start out and puts the mode back', async () => {
    const prepared = deferred<void>();
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => prepared.promise);
    const onRecorded = jest.fn(async () => {});
    const hook = await renderHook(() => useVoiceRecorder(onRecorded));
    await act(async () => {
      void hook.result.current.start();
    });
    await flush();
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    await act(async () => hook.result.current.cancel());
    prepared.resolve();
    await flush();
    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(hook.result.current.recording).toBeNull();
    expect(mockSetAudioMode.mock.calls.at(-1)?.[0]).toMatchObject({ allowsRecording: false });
    expect(onRecorded).not.toHaveBeenCalled();
    // The recorder is free again for the next take
    await act(async () => {
      void hook.result.current.start();
    });
    await flush();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
  });

  it('a recorder that throws after the take ended owes nobody a toast', async () => {
    const prepared = deferred<void>();
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(() => prepared.promise);
    const hook = await renderHook(() => useVoiceRecorder(jest.fn(async () => {})));
    await act(async () => {
      void hook.result.current.start();
    });
    await flush();
    await act(async () => hook.unmount());
    // The released recorder refuses the pending prepare
    prepared.reject(new Error('released'));
    await flush();
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });

  it('a recorder failing a live take still says so', async () => {
    mockRecorder.prepareToRecordAsync.mockImplementationOnce(async () => {
      throw new Error('busy');
    });
    const hook = await renderHook(() => useVoiceRecorder(jest.fn(async () => {})));
    await act(async () => {
      await hook.result.current.start();
    });
    expect(mockToast).toHaveBeenCalledWith('error', 'chat.voiceRecordError');
    expect(hook.result.current.recording).toBeNull();
  });

  it('a normal take sends as an audio pick with its length', async () => {
    const onRecorded = jest.fn(async () => {});
    const hook = await renderHook(() => useVoiceRecorder(onRecorded));
    await act(async () => {
      void hook.result.current.start();
    });
    await flush();
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(hook.result.current.recording?.elapsedSeconds).toBe(3);
    await act(async () => hook.result.current.stop());
    await flush();
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ kind: 'audio', uri: 'file:///take.m4a', duration: 3, mimeType: 'audio/m4a' }));
  });
});
