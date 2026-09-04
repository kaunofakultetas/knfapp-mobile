// -----------------------------------------------------------
//  [*] Chat — ImageViewerModal
//
//  Fullscreen viewer for every image of the conversation on
//  react-native-awesome-gallery (pinch/double-tap zoom, swipe
//  to close), with a centered thumbnail rail when more than
//  one image exists. Entries carry the MESSAGE id — the screen
//  opens the viewer by id, so re-sent duplicates of the same
//  URL open at the right position.
//
//  RN's Modal renders nothing while visible=false — its
//  children unmount between opens — but this component (and
//  its index state) stays mounted, so the resync effect on
//  [visible, initialIndex] is what makes every reopen land on
//  the tapped image instead of the previously viewed one. The
//  freshly-mounted rail measures its width AFTER that resync;
//  the railWidth effect re-centres once the layout lands.
//
//  Both the stage and the rail draw with expo-image (the same
//  memory-disk cache the bubbles' thumbnails already filled),
//  so the rail downsamples to its 56 px views instead of
//  decoding full-resolution originals.
//
//  The Gallery paints its own black stage; the chrome (close
//  button, rail backdrop) uses the scrim token, and safe-area
//  insets are read here rather than passed in.
//
//  Split into (root component last):
//
//    ViewerImage      — one gallery entry (message id + uri)
//    StageImage       — fullscreen entry with load/error state
//    ImageViewerModal — the modal itself (default export)
// -----------------------------------------------------------

// Theme-side chrome colors
import { useTheme } from '@/hooks/useTheme';

// Primitives and the gallery engine
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// Thumbnail rail geometry — one source for the centering math
const THUMB_SIZE = 56;
const THUMB_MARGIN = 8;
const THUMB_FULL = THUMB_SIZE + THUMB_MARGIN;







// -----------------------------------------------------------
// ViewerImage
// -----------------------------------------------------------
//
// Used by:
//   - ImageViewerModal (below)
//   - app/(main)/chat-room/index.tsx — builds the entries with
//     getUploadUrl at render time
// -----------------------------------------------------------

export interface ViewerImage {
  id: string;
  uri: string;
}







// -----------------------------------------------------------
// StageImage
// -----------------------------------------------------------
//
// One fullscreen gallery entry on expo-image: a spinner until
// the load settles, the real source dimensions handed to the
// gallery for correct pinch-zoom bounds, and a translated
// placeholder instead of a blank black stage when the download
// fails.
//
// Used by:
//   - ImageViewerModal (below)
// -----------------------------------------------------------

function StageImage({
  item,
  label,
  setImageDimensions,
}: {
  item: ViewerImage;
  label: string;
  setImageDimensions: (dims: { width: number; height: number }) => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');


  if (phase === 'error') {
    return (
      <View
        className="items-center justify-center"
        style={{ width: '100%', height: '100%' }}
        accessible
        accessibilityLabel={t('chat.imageUnavailable')}
      >
        <Ionicons name="image-outline" size={48} color={colors.onBrand} />
        <Text className="mt-sm font-raleway text-sm" style={{ color: colors.onBrand }}>
          {t('chat.imageUnavailable')}
        </Text>
      </View>
    );
  }


  return (
    <View style={{ width: '100%', height: '100%' }}>
      <Image
        source={{ uri: item.uri }}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        recyclingKey={item.id}
        cachePolicy="memory-disk"
        accessible
        accessibilityLabel={label}
        onLoad={(e) => {
          // Real dimensions give the gallery correct pinch-zoom
          // bounds for each image
          if (e.source?.width && e.source?.height) {
            setImageDimensions({ width: e.source.width, height: e.source.height });
          }
          setPhase('ready');
        }}
        onError={() => setPhase('error')}
      />
      {phase === 'loading' && (
        <View
          className="items-center justify-center"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        >
          <ActivityIndicator size="large" color={colors.onBrand} />
        </View>
      )}
    </View>
  );
}







// -----------------------------------------------------------
// ImageViewerModal (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — the chat room screen
// -----------------------------------------------------------

export default function ImageViewerModal({
  visible,
  images,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  images: ViewerImage[];
  initialIndex: number;
  onClose: () => void;
}) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();


  const [index, setIndex] = useState(initialIndex);
  const galleryRef = useRef<GalleryRef>(null);
  const thumbListRef = useRef<FlatList<ViewerImage>>(null);
  const [railWidth, setRailWidth] = useState(0);


  // Center the active thumbnail in the rail
  const sideInset = Math.max(0, Math.floor((railWidth - THUMB_SIZE) / 2));
  const centerThumb = (idx: number, animated: boolean) => {
    requestAnimationFrame(() => {
      if (!thumbListRef.current || railWidth <= 0) return;
      thumbListRef.current.scrollToOffset({ offset: idx * THUMB_FULL, animated });
    });
  };


  // The component stays mounted across opens (only the Modal's
  // children unmount) — resync both the local index and the
  // Gallery every time the viewer opens on a (possibly
  // different) image
  useEffect(() => {
    if (!visible) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- the open is the event: local index and the imperative Gallery resync together
    setIndex(initialIndex);
    galleryRef.current?.setIndex(initialIndex);
    centerThumb(initialIndex, false);
    // centerThumb identity is render-scoped on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);


  // The rail mounts fresh on every open, so its first measured
  // width lands AFTER the resync above — re-centre the active
  // thumbnail once the layout is known
  useEffect(() => {
    if (visible && railWidth > 0) centerThumb(index, false);
    // index changes are centred by onIndexChange already;
    // centerThumb identity is render-scoped on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, railWidth]);


  // A shrinking image set (unsent photo messages) clamps the
  // index back into range; an emptied set closes the viewer
  useEffect(() => {
    if (!visible) return;
    if (images.length === 0) {
      onClose();
      return;
    }
    if (index > images.length - 1) {
      const clamped = images.length - 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the unsend shrinking the set is the event; state and the imperative Gallery clamp together
      setIndex(clamped);
      galleryRef.current?.setIndex(clamped);
      centerThumb(clamped, false);
    }
    // Runs only when the set shrinks under the current index
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, images.length]);


  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1">

        <Gallery
          ref={galleryRef}
          data={images}
          initialIndex={initialIndex}
          keyExtractor={(item) => item.id}
          maxScale={5}
          onSwipeToClose={onClose}
          onIndexChange={(idx) => {
            setIndex(idx);
            centerThumb(idx, true);
            // Live position for screen readers — the swipe
            // itself is silent
            AccessibilityInfo.announceForAccessibility(
              t('chat.photoIndex', { index: idx + 1, total: images.length }),
            );
          }}
          renderItem={({ item, index: itemIndex, setImageDimensions }) => (
            <StageImage
              item={item}
              label={t('chat.photoIndex', { index: itemIndex + 1, total: images.length })}
              setImageDimensions={setImageDimensions}
            />
          )}
        />

        {/* Close — floats over the stage inside the top inset */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={10}
          className="absolute h-11 w-11 items-center justify-center rounded-full bg-scrim"
          style={{ top: insets.top + 10, right: 12, zIndex: 20 }}
        >
          <Ionicons name="close" size={22} color={colors.onBrand} />
        </Pressable>

        {images.length > 1 && (
          <View
            className="absolute left-0 right-0 bg-scrim py-xs"
            style={{ bottom: insets.bottom + 12, zIndex: 25 }}
            onLayout={(e) => setRailWidth(e.nativeEvent.layout.width)}
          >
            <FlatList
              ref={thumbListRef}
              data={images}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingLeft: sideInset, paddingRight: sideInset }}
              renderItem={({ item, index: idx }) => {
                const isActive = idx === index;
                return (
                  <Pressable
                    onPress={() => {
                      galleryRef.current?.setIndex(idx, true);
                      setIndex(idx);
                      centerThumb(idx, true);
                    }}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={t('chat.photoIndex', {
                      index: idx + 1,
                      total: images.length,
                    })}
                    accessibilityState={{ selected: isActive }}
                    style={{
                      width: THUMB_SIZE,
                      height: THUMB_SIZE,
                      borderRadius: 8,
                      overflow: 'hidden',
                      marginRight: THUMB_MARGIN,
                      borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? colors.onBrand : colors.scrim,
                    }}
                  >
                    <Image
                      source={{ uri: item.uri }}
                      style={{ width: '100%', height: '100%', opacity: isActive ? 1 : 0.4 }}
                      contentFit="cover"
                      recyclingKey={item.id}
                      cachePolicy="memory-disk"
                    />
                  </Pressable>
                );
              }}
            />
          </View>
        )}

      </View>
    </Modal>
  );
}
