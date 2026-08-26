// -----------------------------------------------------------
//  [*] QrScanner — fullscreen invitation-code scanner
//
//  A modal camera view that hunts for invitation QR codes on
//  the register screen. Accepts raw codes and app/https URLs
//  carrying ?code=; every candidate is uppercased and
//  validated against the code alphabet before it is reported,
//  so a random QR in the wild never reaches the form.
//
//  The duplicate-scan guard is a ref, not state: expo-camera
//  fires onBarcodeScanned many times per second and every
//  event delivered before a re-render commits would still see
//  stale state — the ref flips synchronously so exactly one
//  scan wins. It re-arms when the modal reopens (visible
//  effect; no timers that could fire after unmount).
//
//  Permission flow: while the system dialog can still appear
//  the button requests permission; after a permanent denial
//  (canAskAgain === false) the same button opens the system
//  settings instead — requesting again would silently no-op.
//
//  Split into (root component last):
//
//    extractCode — code extraction + validation
//    QrScanner   — the modal scanner (default export)
// -----------------------------------------------------------

// UI kit and theming
import { Button } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

// Camera and system settings
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';

// Rendering
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// register.tsx owns the visibility flag
interface QrScannerProps {
  visible: boolean;
  onClose: () => void;
  onCodeScanned: (code: string) => void;
}







// -----------------------------------------------------------
// extractCode
// -----------------------------------------------------------
//
// Pulls an invitation code out of scanned QR data. Accepted
// shapes:
//   - raw code       "6D5BD329AC6A"
//   - app deep link  "knfapp://register?code=6D5BD329AC6A"
//   - https link     "https://knf.vu.lt/...?code=6D5BD329AC6A"
//
// Backend codes are uppercase, so the candidate is uppercased
// before validation — both the URL and the raw path go
// through the same 6-30 char [A-Z0-9-] check.
//
// Used by:
//   - QrScanner (below)
// -----------------------------------------------------------

function extractCode(raw: string): string | null {

  const trimmed = raw.trim();
  if (!trimmed) return null;


  // URL forms carry the code as a ?code= query param
  let candidate = trimmed;
  if (trimmed.includes('?')) {
    try {
      const fromUrl = new URL(trimmed).searchParams.get('code');
      if (fromUrl) candidate = fromUrl;
    } catch {
      // not a URL — validate as a raw code below
    }
  }


  const normalized = candidate.trim().toUpperCase();
  return /^[A-Z0-9-]{6,30}$/.test(normalized) ? normalized : null;
}







// -----------------------------------------------------------
// QrScanner (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/register.tsx — invitation-code scanning
// -----------------------------------------------------------

export default function QrScanner({ visible, onClose, onCodeScanned }: QrScannerProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();


  // Synchronous duplicate-scan guard — see the file header
  const scannedRef = useRef(false);


  // Re-arm the guard on every open
  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
    }
  }, [visible]);


  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    const code = extractCode(data);
    if (!code) return;
    scannedRef.current = true;
    onCodeScanned(code);
    onClose();
  };


  // After a permanent denial the system dialog can no longer
  // appear — route to settings instead of a silent no-op
  const handlePermission = () => {
    if (permission && !permission.canAskAgain) {
      Linking.openSettings().catch(() => {});
      return;
    }
    requestPermission();
  };


  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-canvas">

        {/* Header — inset padding keeps the close button clear of the notch */}
        <View
          className="flex-row items-center justify-between px-5 pb-4 bg-brand-header z-10"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={28} color={colors.onBrand} />
          </Pressable>
          <Text className="text-on-brand text-lg font-raleway-bold">{t('register.scanQr')}</Text>
          {/* Spacer mirroring the close icon so the title stays centered */}
          <View className="w-7" />
        </View>

        {!permission?.granted ? (
          <View className="flex-1 items-center justify-center px-10">
            <Ionicons name="camera-outline" size={64} color={colors.inkFaint} />
            <Text className="text-ink font-raleway text-center text-base mt-4 mb-6">
              {t('register.cameraPermission')}
            </Text>
            <Button title={t('register.cameraPermissionButton')} onPress={handlePermission} />
          </View>
        ) : (
          <View className="flex-1">
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Viewfinder — pointer-transparent so the camera keeps focus taps */}
            <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
              <View className="w-64 h-64 border-2 border-on-brand opacity-60 rounded-2xl" />
              <Text className="text-on-brand opacity-80 font-raleway text-sm mt-4">
                {t('register.scanQrHint')}
              </Text>
            </View>
          </View>
        )}

      </View>
    </Modal>
  );
}
