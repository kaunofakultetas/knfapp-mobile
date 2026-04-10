/**
 * QR Code scanner modal for scanning invitation codes.
 * Uses expo-camera's CameraView with barcode scanning.
 */

import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

interface QrScannerProps {
  visible: boolean;
  onClose: () => void;
  onCodeScanned: (code: string) => void;
}

/**
 * Extract invitation code from scanned data.
 * Supports:
 *  - Raw code string (e.g. "6D5BD329AC6A")
 *  - URL format (e.g. "knfapp://register?code=6D5BD329AC6A")
 *  - HTTPS URL format (e.g. "https://knf.vu.lt/app/register?code=6D5BD329AC6A")
 */
function extractCode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try URL formats
  try {
    if (trimmed.includes('?')) {
      const url = new URL(trimmed);
      const code = url.searchParams.get('code');
      if (code) return code;
    }
  } catch {
    // Not a URL — treat as raw code
  }

  // Raw alphanumeric code (8-20 chars, uppercase + digits + dashes)
  if (/^[A-Z0-9-]{6,30}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export default function QrScanner({ visible, onClose, onCodeScanned }: QrScannerProps) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned) return;
      const code = extractCode(data);
      if (code) {
        setScanned(true);
        onCodeScanned(code);
        onClose();
        // Reset scanned after close animation
        setTimeout(() => setScanned(false), 500);
      }
    },
    [scanned, onCodeScanned, onClose],
  );

  const handleClose = useCallback(() => {
    setScanned(false);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View className="flex-1 bg-black">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-14 pb-4 bg-black/80 z-10">
          <Pressable onPress={handleClose} hitSlop={16}>
            <Ionicons name="close" size={28} color="white" />
          </Pressable>
          <Text className="text-white text-lg font-raleway-bold">{t('register.scanQr')}</Text>
          <View style={{ width: 28 }} />
        </View>

        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="camera-outline" size={64} color="#999" />
            <Text className="text-white text-center text-base mt-4 mb-6">
              {t('register.cameraPermission')}
            </Text>
            <Pressable
              className="bg-primary px-8 py-3 rounded-full"
              onPress={requestPermission}
            >
              <Text className="text-white font-raleway-bold text-base">
                {t('register.cameraPermissionButton')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Viewfinder overlay */}
            <View
              className="absolute inset-0 items-center justify-center"
              pointerEvents="none"
            >
              <View className="w-64 h-64 border-2 border-white/60 rounded-2xl" />
              <Text className="text-white/80 text-sm mt-4">
                {t('register.scanQrHint')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
