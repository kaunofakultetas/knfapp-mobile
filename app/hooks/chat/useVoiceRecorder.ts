// -----------------------------------------------------------
//  [*] useVoiceRecorder — the device half of voice notes
//
//  Owns the microphone (expo-audio): permission, the audio
//  mode, the recorder, the elapsed ticker the kit's recording
//  bar shows, and the auto-stop at the cap. A finished take
//  becomes a PickedAsset (kind 'audio', .m4a) handed to the
//  engine's composer.attach — upload, optimistic bubble and
//  retry are its business from there. A take under a second
//  is discarded (a mis-tap, not a message).
//
//  Used by:
//    - app/(main)/chat-room/index.tsx
// -----------------------------------------------------------

import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/context/NetworkContext';

import type { PickedAsset } from '@knf/chatengine';


const MAX_VOICE_SECONDS = 180;
const TICK_MS = 500;
const WAVEFORM_BARS = 40;


// Bucket-averages the tick samples into the bars the bubble
// draws; too short a take answers nothing (a flat pair of bars
// says less than the plain track)
function downsample(samples: number[]): number[] | undefined {
  if (samples.length < 4) return undefined;
  const bars = Math.min(WAVEFORM_BARS, samples.length);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const start = Math.floor((i * samples.length) / bars);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / bars));
    const slice = samples.slice(start, end);
    out.push(Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 1000) / 1000);
  }
  return out;
}


export function useVoiceRecorder(onRecorded: (asset: PickedAsset) => Promise<void>) {

  const { t } = useTranslation();
  // Metering on: the ticker samples the level for the message's
  // waveform bars
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [recording, setRecording] = useState<{ elapsedSeconds: number } | null>(null);

  // Set synchronously so a double tap cannot start two takes;
  // startedAt is the single clock every reader derives from
  const busyRef = useRef(false);
  const startedAtRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Raw level samples (0..1), one per tick — bucketed down to
  // the bars the bubble draws
  const samplesRef = useRef<number[]>([]);


  const clearTicker = useCallback(() => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
  }, []);


  // Ends the take either way; iOS keeps routing audio oddly while
  // allowsRecording stays on, so the mode is always put back
  const finish = useCallback(
    async (send: boolean) => {
      if (!busyRef.current) return;
      busyRef.current = false;
      clearTicker();
      const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      setRecording(null);
      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        uri = null;
      }
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const samples = samplesRef.current;
      samplesRef.current = [];
      if (!send || !uri || seconds < 1) return;
      await onRecorded({
        uri,
        name: `voice-${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        duration: Math.min(seconds, MAX_VOICE_SECONDS),
        kind: 'audio',
        waveform: downsample(samples),
      });
    },
    [clearTicker, onRecorded, recorder],
  );
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });


  const start = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        busyRef.current = false;
        showToast('error', t('chat.micPermission'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedAtRef.current = Date.now();
      samplesRef.current = [];
      setRecording({ elapsedSeconds: 0 });
      clearTicker();
      tickerRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
        if (elapsed >= MAX_VOICE_SECONDS) {
          void finishRef.current(true);
          return;
        }
        // The level in dBFS (-160..0) folded into 0..1; a recorder
        // without metering just yields a flat quiet line
        try {
          const level = recorder.getStatus().metering;
          const value = typeof level === 'number' ? Math.max(0, Math.min(1, (level + 50) / 50)) : 0.15;
          samplesRef.current.push(value);
        } catch {
          samplesRef.current.push(0.15);
        }
        setRecording({ elapsedSeconds: elapsed });
      }, TICK_MS);
    } catch {
      busyRef.current = false;
      clearTicker();
      setRecording(null);
      showToast('error', t('chat.voiceRecordError'));
    }
  }, [clearTicker, recorder, t]);


  const stop = useCallback(() => void finishRef.current(true), []);
  const cancel = useCallback(() => void finishRef.current(false), []);


  // An unmounted room never leaves the ticker running or the
  // microphone mode on
  useEffect(
    () => () => {
      clearTicker();
      if (busyRef.current) void finishRef.current(false);
    },
    [clearTicker],
  );


  return { recording, start, stop, cancel };
}
