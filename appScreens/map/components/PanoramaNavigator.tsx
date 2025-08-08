import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Image as RNImage, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

type RoomInfo = {
  name: string;
  floor?: string;
  distanceMeters?: number;
};

type PanoramaNavigatorProps = {
  panoSource: any; // ImageSourcePropType
  targetAzimuth: number; // 0-360
  containerHeight?: number;
  arrowSize?: number;
  showHint?: boolean;
  room?: RoomInfo;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function PanoramaNavigator({
  panoSource,
  targetAzimuth,
  containerHeight,
  arrowSize = 96,
  showHint = true,
  room,
  onNext,
  onBack,
  nextLabel = 'Toliau',
}: PanoramaNavigatorProps) {
  const panoHeight = containerHeight ?? screenHeight - 160;
  const { t } = useTranslation();

  // Resolve real aspect ratio (w/h) synchronously from local asset to avoid flicker on swap.
  const aspect = useMemo(() => {
    try {
      const { width: iw, height: ih } = RNImage.resolveAssetSource(panoSource) || {};
      return iw && ih ? iw / ih : 2;
    } catch {
      return 2;
    }
  }, [panoSource]);

  // WIDTH that shows the entire panorama without cropping
  const tileWidth = panoHeight * aspect;

  const scrollRef = useRef<ScrollView | null>(null);
  const [scrollX, setScrollX] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: tileWidth, animated: false });
      setScrollX(tileWidth);
    }, 0);
    return () => clearTimeout(id);
  }, [tileWidth]);

  const handleScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    if (x <= 0) {
      scrollRef.current?.scrollTo({ x: x + tileWidth, animated: false });
    } else if (x >= tileWidth * 2) {
      scrollRef.current?.scrollTo({ x: x - tileWidth, animated: false });
    }
    setScrollX(x);
  };

  // Compute arrow pin position in viewport
  const wrap = (v: number, m: number) => ((v % m) + m) % m;
  const centerXWithinTile = tileWidth > 0 ? wrap(scrollX + screenWidth / 2, tileWidth) : 0;
  const centerAngle = tileWidth > 0 ? (centerXWithinTile / tileWidth) * 360 : 0;
  let deltaAngle = targetAzimuth - centerAngle; // +right, -left relative to current view
  if (deltaAngle > 180) deltaAngle -= 360;
  if (deltaAngle < -180) deltaAngle += 360;
  const targetXInViewport = screenWidth / 2 + (deltaAngle / 360) * tileWidth;
  const clampedLeft = Math.max(0, Math.min(screenWidth - arrowSize, targetXInViewport - arrowSize / 2));

  // Visual cue: tilt and color based on how much and which way to rotate
  const absDelta = Math.abs(deltaAngle);
  const hintFactor = Math.min(absDelta, 45) / 45; // 0..1 up to 45°
  const aligned = absDelta <= 12; // within 12° is considered aligned
  const turnTilt = aligned ? 0 : (deltaAngle >= 0 ? 1 : -1) * (10 + 18 * hintFactor); // degrees left/right

  const directionText = useMemo(() => {
    if (aligned) return t('navigation.onTarget');
    const deg = Math.round(absDelta);
    return deltaAngle >= 0 ? t('navigation.turnRight', { deg }) : t('navigation.turnLeft', { deg });
  }, [aligned, deltaAngle, absDelta, t]);

  return (
    <View style={{ height: panoHeight }} className="bg-black" >
      {/* Panorama */}
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: tileWidth, y: 0 }}
        onScroll={handleScroll}
      >
        <View style={{ width: tileWidth * 3, height: panoHeight, flexDirection: 'row' }}>
          <ExpoImage
            source={panoSource}
            style={{ width: tileWidth, height: panoHeight }}
            contentFit="contain"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
          />
          <ExpoImage
            source={panoSource}
            style={{ width: tileWidth, height: panoHeight }}
            contentFit="contain"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
          />
          <ExpoImage
            source={panoSource}
            style={{ width: tileWidth, height: panoHeight }}
            contentFit="contain"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
          />
        </View>
      </ScrollView>

      {/* Back button - top right */}
      {onBack && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onBack}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 30 }}
        >
          <BlurView intensity={45} tint="dark" style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 }}>
            <Text className="text-white" style={{ fontSize: 14, fontWeight: '600' }}>{t('common.back')}</Text>
          </BlurView>
        </TouchableOpacity>
      )}

      {/* Hint */}
      {showHint && (
        <View className="absolute top-[20px] left-5 bg-black/70 px-3 py-1.5 rounded-full">
          <Text className="text-white">{t('navigation.scrollHint360')}</Text>
        </View>
      )}

      {/* Room / Direction Card */}
      <BlurView
        intensity={40}
        tint="dark"
        style={{ position: 'absolute', left: 16, right: 16, bottom: 48, borderRadius: 16, overflow: 'hidden' }}
      >
        <View className="px-4 py-3" style={{ rowGap: 4 }}>
          {room?.name ? (
            <Text className="text-white" style={{ fontSize: 18, fontWeight: '700' }}>
              {room.name}
            </Text>
          ) : null}
          {(room?.floor || room?.distanceMeters != null) ? (
            <Text className="text-white/80" style={{ fontSize: 13 }}>
              {room?.floor ? `${room.floor}` : ''}
              {room?.floor && room?.distanceMeters != null ? ' • ' : ''}
              {room?.distanceMeters != null ? `${room.distanceMeters} m` : ''}
            </Text>
          ) : null}
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-white" style={{ fontSize: 15 }}>
              {directionText}
            </Text>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: aligned ? '#10B981' : '#EF4444' }} />
          </View>
        </View>
      </BlurView>

      {/* Arrow marker pinned to panorama horizontally at target azimuth */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: panoHeight * 0.3,
          left: clampedLeft,
          width: arrowSize,
          height: arrowSize,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
      >
        <View
          style={{
            width: arrowSize,
            height: arrowSize,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ perspective: 900 }, { rotateX: '32deg' }, { rotateZ: `${turnTilt}deg` }],
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Svg width={arrowSize} height={arrowSize} viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="arrowGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={aligned ? '#34D399' : '#F43F5E'} />
                <Stop offset="1" stopColor={aligned ? '#10B981' : '#EF4444'} />
              </LinearGradient>
              <LinearGradient id="ringGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="rgba(255,255,255,0.9)" />
                <Stop offset="1" stopColor="rgba(255,255,255,0.6)" />
              </LinearGradient>
            </Defs>
            {/* Base disc with soft glow */}
            <Circle cx="50" cy="54" r="42" fill="rgba(0,0,0,0.45)" />
            <Circle cx="50" cy="54" r="38" stroke="url(#ringGrad)" strokeWidth="2" fill="none" />
            {/* Arrow body */}
            <Path
              d="M50 12 L70 66 L50 56 L30 66 Z"
              fill="url(#arrowGrad)"
              stroke="white"
              strokeOpacity="0.7"
              strokeWidth="1.8"
            />
          </Svg>
        </View>
      </View>

      {/* Next button below the arrow when aligned */}
      {onNext && (
        <View
          style={{
            position: 'absolute',
            bottom: Math.max(8, panoHeight * 0.35 - (arrowSize + 12)),
            left: clampedLeft,
            width: arrowSize,
            zIndex: 25,
          }}
        >
          <TouchableOpacity
            disabled={!aligned}
            activeOpacity={0.9}
            onPress={onNext}
            style={{ opacity: aligned ? 1 : 0.5 }}
          >
            <BlurView
              intensity={aligned ? 55 : 35}
              tint="dark"
              style={{ borderRadius: 999, overflow: 'hidden' }}
            >
              <View style={{ paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Text className="text-white" style={{ fontSize: 14, fontWeight: '700' }}>{nextLabel || t('common.next')}</Text>
              </View>
            </BlurView>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

