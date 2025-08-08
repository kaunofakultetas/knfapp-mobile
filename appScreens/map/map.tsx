import Header from '@/components/ui/Header';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, View } from 'react-native';
import PanoramaNavigator from './components/PanoramaNavigator';

const { height } = Dimensions.get('window');

// Demo panorama steps (add more as needed)
const PANO_STEP_0 = require('@/assets/navigation/1.1.03.jpg'); // Vies rysiai
const PANO_STEP_2 = require('@/assets/navigation/1.2.01.jpg'); // 1aud
const PANO_STEP_3 = require('@/assets/navigation/1.2.05.jpg'); // Tarp.Rys
const PANO_STEP_1 = require('@/assets/navigation/1.1.00.jpg'); // 1Korp iejimas
const PANO_STEP_4 = require('@/assets/navigation/2.2.04.jpg'); // AVL2
const PANO_STEP_5 = require('@/assets/navigation/2.2.05.jpg'); // VeGa
const PANO_STEP_6 = require('@/assets/navigation/2.2.02.jpg'); // 5aud
const PANO_STEP_7 = require('@/assets/navigation/2.2.01.jpg'); // Gronsk


export default function MapTab() {
  const router = useRouter();
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(
    () => [
      {
        panoSource: PANO_STEP_0,
        targetAzimuth: 230,
        room: { name: 'Viešųjų Ryšių Skyrius', floor: '1 Korp. 1 Aukštas', distanceMeters: 37 },
      },
      {
        panoSource: PANO_STEP_1,
        targetAzimuth: 10,
        room: { name: 'Koridorius', floor: '1 Korp. 1 Aukštas', distanceMeters: 22 },
      },
      {
        panoSource: PANO_STEP_2,
        targetAzimuth: 190,
        room: { name: '1 AUD ir 2 AUD', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      },
      {
        panoSource: PANO_STEP_3,
        targetAzimuth: 225,
        room: { name: 'Tarptautiniai Ryšiai', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      },
      {
        panoSource: PANO_STEP_4,
        targetAzimuth: 210,
        room: { name: 'AVL2', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      },
      {
        panoSource: PANO_STEP_5,
        targetAzimuth: 245,
        room: { name: 'VeGa Auditorija', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      },
      {
        panoSource: PANO_STEP_6,
        targetAzimuth: 45,
        room: { name: '5 AUD', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      },
      {
        panoSource: PANO_STEP_7,
        targetAzimuth: 10,
        room: { name: 'Gronsko Auditorija', floor: '1 Korp. 2 Aukštas', distanceMeters: 10 },
      }
    ],
    []
  );

  const current = steps[stepIndex] ?? steps[0];

  // Preload all step images for instant transitions
  useEffect(() => {
    steps.forEach((s) => {
      // require sources are already bundled; accessing resolveAssetSource warms cache
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const src = s.panoSource;
        void src;
      } catch {}
    });
  }, [steps]);

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      // Stay within this screen; cycle back to start or keep last step
      setStepIndex(0);
    }
  };

  const handleBack = () => {
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      router.back();
    }
  };
  return (
    <View className="flex-1 bg-white">
      <Header title={t('navigation.title')} />
      <View className="flex-1 bg-black" style={{ overflow: 'hidden' }}>
        <PanoramaNavigator
          panoSource={current.panoSource}
          targetAzimuth={current.targetAzimuth}
          containerHeight={height - 160}
          arrowSize={96}
          room={current.room}
          showHint
          onBack={handleBack}
          onNext={handleNext}
        />
      </View>
    </View>
  );
}

