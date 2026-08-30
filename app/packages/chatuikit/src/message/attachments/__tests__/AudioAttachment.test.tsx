// -----------------------------------------------------------
//  [*] Tests — chatuikit voice notes
//
//  The AudioAttachment row: play/pause through the (mocked)
//  expo-audio player, a finished clip starting over, the
//  spoken name with the length — and the composer's recording
//  bar: the mic button, the swap while recording, cancel and
//  send.
// -----------------------------------------------------------

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' } }));

const mockPlayer = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
const mockStatus = { playing: false, currentTime: 0, duration: 12, didJustFinish: false };
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}));

import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { formatDuration } from '../../../core/media';
import { ChatUiKitProvider } from '../../../provider';
import { defaultLabels } from '../../../provider/labels';
import Composer from '../../../composer/Composer';
import AudioAttachment from '../AudioAttachment';

const labels = defaultLabels.en;
const audio = { uri: '/api/uploads/note.m4a', duration: 12 };
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={METRICS}><ChatUiKitProvider locale="en" resolveImageUrl={(p) => `https://host${p}`}>{ui}</ChatUiKitProvider></SafeAreaProvider>);

beforeEach(() => {
  mockPlayer.play.mockClear();
  mockPlayer.pause.mockClear();
  mockPlayer.seekTo.mockClear();
  Object.assign(mockStatus, { playing: false, currentTime: 0, duration: 12, didJustFinish: false });
});

describe('AudioAttachment', () => {
  it('names itself with its length and plays on tap', async () => {
    const { getByLabelText, getByTestId } = await wrap(<AudioAttachment audio={audio} own={false} labels={labels} />);
    expect(getByLabelText(`${labels.voiceNote}, ${formatDuration(12)}`)).toBeTruthy();
    await fireEvent.press(getByTestId('chatuikit-audio-toggle'));
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });

  it('draws the bars for a waveform and a tap on the track seeks', async () => {
    const { getByTestId, queryByTestId } = await wrap(
      <AudioAttachment audio={{ ...audio, waveform: [0.1, 0.9, 0.4, 0.7] }} own={false} labels={labels} />,
    );
    expect(getByTestId('chatuikit-audio-bars')).toBeTruthy();
    expect(queryByTestId('chatuikit-audio-progress')).toBeNull();
    await fireEvent.press(getByTestId('chatuikit-audio-track'), { nativeEvent: { locationX: 66 } });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(6);
  });

  it('pauses while playing; a finished clip starts over', async () => {
    Object.assign(mockStatus, { playing: true, currentTime: 4 });
    const playing = await wrap(<AudioAttachment audio={audio} own={false} labels={labels} />);
    await fireEvent.press(playing.getByTestId('chatuikit-audio-toggle'));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    Object.assign(mockStatus, { playing: false, currentTime: 12, didJustFinish: true });
    const finished = await wrap(<AudioAttachment audio={audio} own={false} labels={labels} />);
    await fireEvent.press(finished.getByTestId('chatuikit-audio-toggle'));
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  });
});

describe('Composer recording bar', () => {
  const noop = () => {};
  const base = {
    onChangeText: noop, onSend: noop, onQuickLike: noop, onAttachMedia: noop, onAttachFile: noop,
    onToggleEmoji: noop, emojiOpen: false, uploadingMedia: false, replyTo: null, onCancelReply: noop,
  };

  it('shows the mic only when the host records, and swaps the row while recording', async () => {
    const onStartRecording = jest.fn();
    const without = await wrap(<Composer {...base} value="" />);
    expect(without.queryByRole('button', { name: labels.recordVoice })).toBeNull();

    const withMic = await wrap(<Composer {...base} value="" onStartRecording={onStartRecording} />);
    await fireEvent.press(withMic.getByRole('button', { name: labels.recordVoice }));
    expect(onStartRecording).toHaveBeenCalledTimes(1);
    expect(withMic.queryByTestId('chatuikit-recording')).toBeNull();

    const onStopRecording = jest.fn();
    const onCancelRecording = jest.fn();
    const recording = await wrap(
      <Composer {...base} value="" onStartRecording={onStartRecording} onStopRecording={onStopRecording} onCancelRecording={onCancelRecording} recording={{ elapsedSeconds: 65 }} />,
    );
    expect(recording.getByTestId('chatuikit-recording')).toBeTruthy();
    expect(recording.getByText(formatDuration(65))).toBeTruthy();
    expect(recording.queryByTestId('chatuikit-composer-input')).toBeNull();
    await fireEvent.press(recording.getByTestId('chatuikit-recording-cancel'));
    expect(onCancelRecording).toHaveBeenCalledTimes(1);
    await fireEvent.press(recording.getByTestId('chatuikit-recording-send'));
    expect(onStopRecording).toHaveBeenCalledTimes(1);
  });
});
