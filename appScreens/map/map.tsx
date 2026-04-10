import Header from '@/components/ui/Header';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import PanoramaNavigator from './components/PanoramaNavigator';

const { height, width: screenWidth } = Dimensions.get('window');

// Demo panorama steps (add more as needed)
const PANO_STEP_0 = require('@/assets/navigation/1.1.03.jpg'); // Vies rysiai
const PANO_STEP_2 = require('@/assets/navigation/1.2.01.jpg'); // 1aud
const PANO_STEP_3 = require('@/assets/navigation/1.2.05.jpg'); // Tarp.Rys
const PANO_STEP_1 = require('@/assets/navigation/1.1.00.jpg'); // 1Korp iejimas
const PANO_STEP_4 = require('@/assets/navigation/2.2.04.jpg'); // AVL2
const PANO_STEP_5 = require('@/assets/navigation/2.2.05.jpg'); // VeGa
const PANO_STEP_6 = require('@/assets/navigation/2.2.02.jpg'); // 5aud
const PANO_STEP_7 = require('@/assets/navigation/2.2.01.jpg'); // Gronsk

export type MapStep = {
  panoSource: any;
  targetAzimuth: number;
  room: { name: string; floor?: string; distanceMeters?: number };
  /** Search keywords (lowercase). Built automatically from room name + floor. */
  _keywords: string;
};

export default function MapTab() {
  const router = useRouter();
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const steps: MapStep[] = useMemo(
    () => [
      {
        panoSource: PANO_STEP_0,
        targetAzimuth: 230,
        room: { name: 'Vie\u0161\u0173j\u0173 Ry\u0161i\u0173 Skyrius', floor: '1 Korp. 1 Auk\u0161tas', distanceMeters: 37 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_1,
        targetAzimuth: 10,
        room: { name: 'Koridorius', floor: '1 Korp. 1 Auk\u0161tas', distanceMeters: 22 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_2,
        targetAzimuth: 190,
        room: { name: '1 AUD ir 2 AUD', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_3,
        targetAzimuth: 225,
        room: { name: 'Tarptautiniai Ry\u0161iai', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_4,
        targetAzimuth: 210,
        room: { name: 'AVL2', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_5,
        targetAzimuth: 245,
        room: { name: 'VeGa Auditorija', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_6,
        targetAzimuth: 45,
        room: { name: '5 AUD', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
      {
        panoSource: PANO_STEP_7,
        targetAzimuth: 10,
        room: { name: 'Gronsko Auditorija', floor: '1 Korp. 2 Auk\u0161tas', distanceMeters: 10 },
        _keywords: '',
      },
    ].map((s) => ({
      ...s,
      _keywords: `${s.room.name} ${s.room.floor || ''}`.toLowerCase(),
    })),
    [],
  );

  // Filtered results based on search query
  const filteredSteps = useMemo(() => {
    if (!searchQuery.trim()) return steps.map((s, i) => ({ step: s, originalIndex: i }));
    const q = searchQuery.toLowerCase().trim();
    return steps
      .map((s, i) => ({ step: s, originalIndex: i }))
      .filter(({ step }) => step._keywords.includes(q));
  }, [steps, searchQuery]);

  const current = steps[stepIndex] ?? steps[0];

  // Preload all step images for instant transitions
  useEffect(() => {
    steps.forEach((s) => {
      try {
        const src = s.panoSource;
        void src;
      } catch {}
    });
  }, [steps]);

  const handleNext = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
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

  const handleSelectRoom = useCallback(
    (originalIndex: number) => {
      setStepIndex(originalIndex);
      setSearchOpen(false);
      setSearchQuery('');
      Keyboard.dismiss();
    },
    [],
  );

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (!prev) {
        // Opening -- focus input on next tick
        setTimeout(() => inputRef.current?.focus(), 100);
      } else {
        setSearchQuery('');
        Keyboard.dismiss();
      }
      return !prev;
    });
  }, []);

  const renderSearchResult = useCallback(
    ({ item }: { item: { step: MapStep; originalIndex: number } }) => {
      const isActive = item.originalIndex === stepIndex;
      return (
        <Pressable
          onPress={() => handleSelectRoom(item.originalIndex)}
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
              backgroundColor: pressed
                ? 'rgba(123,0,63,0.25)'
                : isActive
                  ? 'rgba(123,0,63,0.15)'
                  : 'transparent',
            },
          ]}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isActive ? '#7B003F' : 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons
              name={isActive ? 'location' : 'location-outline'}
              size={18}
              color={isActive ? '#FFF' : 'rgba(255,255,255,0.7)'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: '#FFF',
                fontSize: 15,
                fontFamily: 'Raleway-SemiBold',
              }}
              numberOfLines={1}
            >
              {item.step.room.name}
            </Text>
            {item.step.room.floor ? (
              <Text
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  fontFamily: 'Raleway-Regular',
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {item.step.room.floor}
                {item.step.room.distanceMeters != null
                  ? ` \u00B7 ${item.step.room.distanceMeters} m`
                  : ''}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
        </Pressable>
      );
    },
    [stepIndex, handleSelectRoom],
  );

  // Search button in header
  const searchButton = (
    <Pressable
      onPress={toggleSearch}
      hitSlop={12}
      style={({ pressed }) => [
        {
          width: 40,
          height: 40,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={searchOpen ? 'close' : 'search'} size={22} color="#FFF" />
    </Pressable>
  );

  return (
    <View className="flex-1 bg-black">
      <Header title={t('navigation.title')} right={searchButton} />

      {/* Search overlay */}
      {searchOpen && (
        <View
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 100 : 80,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0,0,0,0.92)',
          }}
        >
          {/* Search input */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginHorizontal: 16,
              marginTop: 8,
              marginBottom: 4,
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: 12,
              paddingHorizontal: 12,
            }}
          >
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
            <TextInput
              ref={inputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('navigation.searchPlaceholder')}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={{
                flex: 1,
                color: '#FFF',
                fontSize: 15,
                fontFamily: 'Raleway-Regular',
                paddingVertical: 12,
                marginLeft: 8,
              }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
              </Pressable>
            )}
          </View>

          {/* Results count */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 6 }}>
            <Text
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 12,
                fontFamily: 'Raleway-Medium',
              }}
            >
              {filteredSteps.length === steps.length
                ? t('navigation.allRooms', { count: steps.length })
                : t('navigation.searchResults', { count: filteredSteps.length })}
            </Text>
          </View>

          {/* Results list */}
          <FlatList
            data={filteredSteps}
            keyExtractor={(item) => String(item.originalIndex)}
            renderItem={renderSearchResult}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 48 }}>
                <Ionicons name="search-outline" size={40} color="rgba(255,255,255,0.2)" />
                <Text
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 14,
                    fontFamily: 'Raleway-Medium',
                    marginTop: 12,
                  }}
                >
                  {t('navigation.noResults')}
                </Text>
              </View>
            }
          />
        </View>
      )}

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

