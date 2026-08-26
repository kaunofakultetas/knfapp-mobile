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
//  RN's Modal keeps children mounted across visible=false, so
//  both the local index and the Gallery's mount-only
//  initialIndex freeze at the first open — the resync effect
//  on [visible, initialIndex] is what makes every reopen land
//  on the tapped image instead of the previously viewed one.
//
//  The Gallery paints its own black stage; the chrome (close
//  button, rail backdrop) uses the scrim token, and safe-area
//  insets are read here rather than passed in.
//
//  Split into (root component last):
//
//    ViewerImage      — one gallery entry (message id + uri)
//    ImageViewerModal — the modal itself (default export)
// -----------------------------------------------------------

// Theme-side chrome colors
import { useTheme } from '@/hooks/useTheme';

// Primitives and the gallery engine
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Image, Modal, Pressable, View } from 'react-native';
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


  // Modal children stay mounted while hidden — resync both the
  // local index and the Gallery every time the viewer opens on
  // a (possibly different) image
  useEffect(() => {
    if (!visible) return;

    setIndex(initialIndex);
    galleryRef.current?.setIndex(initialIndex);
    centerThumb(initialIndex, false);
    // centerThumb identity is render-scoped on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);


  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
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
          }}
          renderItem={({ item, setImageDimensions }) => (
            <Image
              source={{ uri: item.uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
              onLoad={(e) => {
                // Real dimensions give the gallery correct
                // pinch-zoom bounds for each image
                const source = e.nativeEvent?.source;
                if (source?.width && source?.height) {
                  setImageDimensions({ width: source.width, height: source.height });
                }
              }}
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
                    accessibilityLabel={t('chat.photoMessage')}
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
                      resizeMode="cover"
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
