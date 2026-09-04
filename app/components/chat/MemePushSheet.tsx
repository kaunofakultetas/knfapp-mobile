// -----------------------------------------------------------
//  [*] MemePushSheet — name a meme before it joins the library
//
//  The second step of pushing: the picked picture on top, a
//  title (prefilled from the filename's stem, so "monday-face"
//  starts as "monday face") and free-form tags. The pusher's
//  own words are what the library's search folds and matches
//  later — a bare "IMG_4123" would be unfindable forever.
//  Confirm is inert while the push is in flight.
//
//  Used by:
//    - app/(main)/chat-room/index.tsx — the meme tab's "+" flow
// -----------------------------------------------------------

import { Image as ExpoImage } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input } from '@/components/ui';


export interface PendingMeme {
  uri: string;
  fileName?: string;
  mimeType?: string;
}


// "monday-face_2.gif" → "monday face 2"
function stemTitle(fileName?: string): string {
  if (!fileName) return '';
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '');
  return stem.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}


export default function MemePushSheet({
  asset,
  busy,
  onCancel,
  onConfirm,
}: {
  // Null closes the sheet
  asset: PendingMeme | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (title: string, tags: string) => void;
}) {

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');


  // A fresh pick resets the fields to that file's suggestion
  // (adjusted during render, keyed on the picked uri)
  const [seededUri, setSeededUri] = useState(asset?.uri);
  if (seededUri !== asset?.uri) {
    setSeededUri(asset?.uri);
    setTitle(stemTitle(asset?.fileName));
    setTags('');
  }


  return (
    <Modal
      visible={asset !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={busy ? undefined : onCancel}
    >
      <View className="flex-1 justify-end">

        <Pressable
          onPress={busy ? undefined : onCancel}
          accessible={false}
          importantForAccessibility="no"
          className="absolute bottom-0 left-0 right-0 top-0 bg-scrim"
        />

        <View
          className="mx-md rounded-2xl bg-surface p-md"
          style={{ marginBottom: insets.bottom + 24 }}
          accessibilityViewIsModal
          testID="meme-push-sheet"
        >

          <Text className="mb-sm font-raleway-bold text-lg text-ink" accessibilityRole="header">
            {t('chat.memePushTitle')}
          </Text>

          {asset ? (
            <ExpoImage
              source={{ uri: asset.uri }}
              style={{ width: '100%', height: 160, borderRadius: 12, marginBottom: 12 }}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}

          <Input
            label={t('chat.memeTitleLabel')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('chat.memeTitlePlaceholder')}
            maxLength={80}
            autoCapitalize="sentences"
            testID="meme-push-title"
          />
          <Input
            label={t('chat.memeTagsLabel')}
            value={tags}
            onChangeText={setTags}
            placeholder={t('chat.memeTagsPlaceholder')}
            maxLength={200}
            autoCapitalize="none"
            testID="meme-push-tags"
          />

          <View className="mt-sm flex-row" style={{ gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title={t('common.cancel')} variant="secondary" onPress={onCancel} disabled={busy} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={t('chat.addMeme')} onPress={() => onConfirm(title, tags)} loading={busy} disabled={!title.trim()} />
            </View>
          </View>

        </View>
      </View>
    </Modal>
  );
}
