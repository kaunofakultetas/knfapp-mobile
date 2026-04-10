import { Ionicons } from '@expo/vector-icons';
// Fullscreen image viewer powered by a battle-tested gallery; includes a centered thumbnail rail
// and a discrete close affordance. Keeps viewer concerns isolated from the chat screen.
import React, { useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, View } from 'react-native';
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery';

export default function ImageViewerModal({
  visible,
  imageUris,
  initialIndex,
  bottomInset,
  topInset,
  onRequestClose,
}: {
  visible: boolean;
  imageUris: string[];
  initialIndex: number;
  bottomInset: number;
  topInset: number;
  onRequestClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const galleryRef = useRef<GalleryRef>(null);
  const thumbListRef = useRef<FlatList<string>>(null);
  const [thumbsContainerWidth, setThumbsContainerWidth] = useState(0);
  const THUMB_SIZE = 56;
  const THUMB_MARGIN = 8;
  const ITEM_FULL = THUMB_SIZE + THUMB_MARGIN;
  const sideInset = Math.max(0, Math.floor((thumbsContainerWidth - THUMB_SIZE) / 2));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={{ flex: 1, backgroundColor: 'black' }}>
        <Pressable
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={'Close'}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          style={{
            position: 'absolute',
            top: topInset + 10,
            right: 12,
            zIndex: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.5)'
          }}
        >
          <Ionicons name="close" size={22} color={'#fff'} />
        </Pressable>
        <Gallery
          ref={galleryRef}
          data={imageUris}
          initialIndex={initialIndex}
          onIndexChange={(idx) => {
            setIndex(idx);
            requestAnimationFrame(() => {
              if (!thumbListRef.current || thumbsContainerWidth <= 0) return;
              const target = idx * ITEM_FULL;
              thumbListRef.current.scrollToOffset({ offset: target, animated: true });
            });
          }}
          keyExtractor={(item, idx) => `${item}-${idx}`}
          maxScale={5}
          onSwipeToClose={onRequestClose}
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          )}
        />
        {imageUris.length > 1 && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: bottomInset + 12,
              zIndex: 25,
              paddingVertical: 6,
              backgroundColor: 'rgba(0,0,0,0.25)'
            }}
            onLayout={(e) => setThumbsContainerWidth(e.nativeEvent.layout.width)}
          >
            <FlatList
              ref={thumbListRef}
              data={imageUris}
              keyExtractor={(uri, idx) => `${uri}-${idx}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ paddingLeft: sideInset, paddingRight: sideInset }}
              renderItem={({ item: uri, index: idx }) => {
                const isActive = idx === index;
                return (
                  <Pressable
                    onPress={() => {
                      galleryRef.current?.setIndex(idx, true);
                      setIndex(idx);
                      requestAnimationFrame(() => {
                        if (!thumbListRef.current || thumbsContainerWidth <= 0) return;
                        const target = idx * ITEM_FULL;
                        thumbListRef.current.scrollToOffset({ offset: target, animated: true });
                      });
                    }}
                    style={{
                      width: THUMB_SIZE,
                      height: THUMB_SIZE,
                      borderRadius: 8,
                      overflow: 'hidden',
                      marginRight: THUMB_MARGIN,
                      borderWidth: isActive ? 2 : 1,
                      borderColor: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.35)'
                    }}
                  >
                    <Image
                      source={{ uri }}
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


