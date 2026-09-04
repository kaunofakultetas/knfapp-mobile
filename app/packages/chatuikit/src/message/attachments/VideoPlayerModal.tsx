// -----------------------------------------------------------
//  [*] chatuikit — VideoPlayerModal
//
//  The kit's player for a video bubble: a full-window black
//  stage on expo-video with the platform's own controls, a
//  close button under the status bar, Android back / web
//  Escape to close. The host mounts it while a video is open
//  (`{video ? <VideoPlayerModal … /> : null}`) — one player
//  exists at a time and is released on close.
//
//  expo-video is an OPTIONAL peer: it is required at render
//  time, not import time, so a host without it still bundles
//  the kit (and jest never loads a native module). Without it
//  the modal explains itself instead of crashing.
//
//  Split into (root component last):
//
//    loadExpoVideo    — the lazy require
//    Stage            — the player, once the module is there
//    VideoPlayerModal — the modal (default export)
//
//  Used by:
//    - the host's chat screen (app/(main)/chat-room/index.tsx)
// -----------------------------------------------------------

// Theme + labels
import { useKitLabels, useKitTheme } from '../../provider';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Modal, Platform, Pressable, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type ExpoVideoModule = typeof import('expo-video');

function loadExpoVideo(): ExpoVideoModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-video') as ExpoVideoModule;
  } catch {
    return null;
  }
}







// -----------------------------------------------------------
// Stage
// -----------------------------------------------------------
//
// Used by:
//   - VideoPlayerModal (below)
// -----------------------------------------------------------

function Stage({ mod, uri, label }: { mod: ExpoVideoModule; uri: string; label: string }) {

  const player = mod.useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  // Leaving the stage stops the audio at once — the player
  // object itself is released with the hook
  useEffect(() => () => {
    try {
      player.pause();
    } catch {
      // Already released
    }
  }, [player]);


  return (
    <mod.VideoView
      player={player}
      style={{ flex: 1 }}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
      accessibilityLabel={label}
    />
  );
}







// -----------------------------------------------------------
// VideoPlayerModal (default export)
// -----------------------------------------------------------

export default function VideoPlayerModal({
  visible,
  uri,
  onClose,
}: {
  visible: boolean;
  // Already loadable (the host resolves the stored reference)
  uri: string | null;
  onClose: () => void;
}) {

  const labels = useKitLabels();
  const { colors, fonts } = useKitTheme();
  const insets = useSafeAreaInsets();
  const mod = loadExpoVideo();


  // Web: Escape closes, like the context menu
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);


  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={['portrait', 'landscape']}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {mod && uri ? (
          <Stage mod={mod} uri={uri} label={labels.video} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Ionicons name="videocam-off-outline" size={40} color={colors.surface} />
            <Text style={{ marginTop: 10, fontFamily: fonts.regular, fontSize: 14, color: colors.surface, textAlign: 'center' }}>
              {labels.videoUnavailable}
            </Text>
          </View>
        )}
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={labels.close}
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
          }}
        >
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </Pressable>
      </View>
    </Modal>
  );
}
