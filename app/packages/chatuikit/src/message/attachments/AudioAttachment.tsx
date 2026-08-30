// -----------------------------------------------------------
//  [*] chatuikit — AudioAttachment
//
//  A voice note in the bubble: the round play/pause button, a
//  progress track that fills as the clip plays, and the time —
//  the remaining length while playing, the full length at
//  rest. Playback rides expo-audio, an OPTIONAL peer required
//  at render time, not import time (jest never loads a native
//  module; a host without it gets an inert row that still
//  names itself and its length). A local uri (an optimistic
//  send) plays as it is; stored paths go through the host's
//  resolver.
//
//  Split into (root component last):
//
//    loadExpoAudio    — the lazy require
//    Track            — the progress bar
//    Player           — button + track, once the module is there
//    AudioAttachment  — the row (default export)
//
//  Used by:
//    - message/MessageBubble.tsx (BubbleBody)
// -----------------------------------------------------------

// Theme + URL resolution
import { useKitEnv, useKitTheme } from '../../provider';
import type { KitLabels } from '../../provider/labels';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { formatDuration } from '../../core/media';
import type { KitAudio } from '../../core/types';


type ExpoAudioModule = typeof import('expo-audio');

function loadExpoAudio(): ExpoAudioModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio') as ExpoAudioModule;
  } catch {
    return null;
  }
}


// The row's fixed proportions — a voice note reads as a control,
// not a picture, so it never claims the photo width
const TRACK_WIDTH = 132;
const BUTTON_SIZE = 34;







// -----------------------------------------------------------
// Track
// -----------------------------------------------------------
//
// Used by:
//   - Player / AudioAttachment (below)
// -----------------------------------------------------------

function Track({ progress, own }: { progress: number; own: boolean }) {

  const { colors } = useKitTheme();


  return (
    <View style={{ width: TRACK_WIDTH, height: 4, borderRadius: 2, backgroundColor: own ? colors.onBrandWash : colors.line, overflow: 'hidden' }}>
      <View
        testID="chatuikit-audio-progress"
        style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, height: 4, backgroundColor: own ? colors.onBrand : colors.brand }}
      />
    </View>
  );
}







// -----------------------------------------------------------
// Bars
// -----------------------------------------------------------
//
// The recorded amplitude as a row of bars; the played share
// takes the ink colour, the rest stays washed. Drawn instead
// of the plain track whenever the message carries a waveform.
//
// Used by:
//   - Player / AudioAttachment (below)
// -----------------------------------------------------------

function Bars({ waveform, progress, own }: { waveform: number[]; progress: number; own: boolean }) {

  const { colors } = useKitTheme();


  const played = Math.floor(Math.min(1, Math.max(0, progress)) * waveform.length);


  return (
    <View style={{ width: TRACK_WIDTH, height: 18, flexDirection: 'row', alignItems: 'center' }} testID="chatuikit-audio-bars">
      {waveform.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            marginRight: index === waveform.length - 1 ? 0 : 1,
            height: 3 + Math.min(1, Math.max(0, value)) * 15,
            borderRadius: 1,
            backgroundColor: index < played ? (own ? colors.onBrand : colors.brand) : own ? colors.onBrandWash : colors.line,
          }}
        />
      ))}
    </View>
  );
}







// -----------------------------------------------------------
// Player
// -----------------------------------------------------------
//
// Only mounted once the module resolved — hooks may not sit
// behind a condition inside ONE component, but choosing a
// different component is fine (the module never appears or
// vanishes within a session).
//
// Used by:
//   - AudioAttachment (below)
// -----------------------------------------------------------

function Player({ mod, uri, duration, waveform, own, labels }: { mod: ExpoAudioModule; uri: string; duration?: number; waveform?: number[] | null; own: boolean; labels: KitLabels }) {

  const { colors, fonts } = useKitTheme();
  const player = mod.useAudioPlayer({ uri });
  const status = mod.useAudioPlayerStatus(player);


  const playing = status.playing;
  const length = status.duration || duration || 0;
  const progress = playing || status.currentTime > 0 ? (length > 0 ? status.currentTime / length : 0) : 0;
  const shownSeconds = playing ? Math.max(0, length - status.currentTime) : length;


  const toggle = () => {
    if (playing) {
      player.pause();
      return;
    }
    // A finished clip starts over instead of playing its last frame
    if (status.didJustFinish || (length > 0 && status.currentTime >= length - 0.05)) player.seekTo(0);
    player.play();
  };


  // A tap along the track (or the bars) jumps the clip there
  const seek = (e: GestureResponderEvent) => {
    if (!length) return;
    const fraction = Math.max(0, Math.min(1, e.nativeEvent.locationX / TRACK_WIDTH));
    player.seekTo(fraction * length);
  };


  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={playing ? labels.pauseVoice : labels.playVoice}
        testID="chatuikit-audio-toggle"
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: BUTTON_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: own ? colors.onBrandWash : colors.surfaceSoft,
        }}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={own ? colors.onBrand : colors.brand} style={playing ? undefined : { marginLeft: 2 }} />
      </Pressable>
      <View style={{ marginLeft: 10, gap: 5 }}>
        <Pressable onPress={seek} hitSlop={6} accessible={false} testID="chatuikit-audio-track">
          {waveform?.length ? <Bars waveform={waveform} progress={progress} own={own} /> : <Track progress={progress} own={own} />}
        </Pressable>
        <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 14, color: own ? colors.onBrand : colors.inkSoft }}>
          {formatDuration(shownSeconds)}
        </Text>
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// AudioAttachment (default export)
// -----------------------------------------------------------

export default function AudioAttachment({ audio, own, labels }: { audio: KitAudio; own: boolean; labels: KitLabels }) {

  const { colors, fonts } = useKitTheme();
  const { resolveImageUrl } = useKitEnv();
  const mod = loadExpoAudio();


  const uri = audio.uri.startsWith('/') ? resolveImageUrl(audio.uri) ?? audio.uri : audio.uri;


  return (
    <View
      accessible
      accessibilityLabel={`${labels.voiceNote}, ${formatDuration(audio.duration ?? 0)}`}
      style={{ paddingVertical: 2 }}
      testID="chatuikit-audio"
    >
      {mod ? (
        <Player mod={mod} uri={uri} duration={audio.duration} waveform={audio.waveform} own={own} labels={labels} />
      ) : (
        // No expo-audio in this host: still name the clip and its
        // length instead of a blank bubble
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: BUTTON_SIZE, height: BUTTON_SIZE, borderRadius: BUTTON_SIZE / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: own ? colors.onBrandWash : colors.surfaceSoft }}>
            <Ionicons name="mic" size={18} color={own ? colors.onBrand : colors.brand} />
          </View>
          <View style={{ marginLeft: 10, gap: 5 }}>
            {audio.waveform?.length ? <Bars waveform={audio.waveform} progress={0} own={own} /> : <Track progress={0} own={own} />}
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 14, color: own ? colors.onBrand : colors.inkSoft }}>
              {formatDuration(audio.duration ?? 0)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
