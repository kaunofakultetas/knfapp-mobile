// -----------------------------------------------------------
//  [*] Map — PanoramaNavigator
//
//  The 360° photo stage of the indoor navigation: one bundled
//  panorama laid out five times in a horizontal ScrollView so
//  panning can loop forever — when a gesture ends off the
//  middle tile the offset teleports back by whole tile widths,
//  which the marker survives because its position math is
//  modulo the tile. Teleporting mid-gesture would kill fling
//  momentum, so it only happens in onMomentumScrollEnd /
//  onScrollEndDrag — the two tiles of buffer on either side
//  are what keep a hard fling from hitting the edge first.
//
//  The stage is deliberately quiet: the route controls, the
//  instruction and the progress live in the screen's sheet
//  below it. All the stage shows is the photo, a step counter,
//  a "pan for 360°" hint that fades after a moment, and the
//  direction marker — a badge anchored where the next waypoint
//  sits in the panorama, clamped to the edges so it is always
//  reachable, tilting towards the target and turning green
//  once the view is aligned with it.
//
//  The scroll offset lives in an Animated.Value, never in
//  React state: the marker's translateX and tilt are
//  interpolations on a natively driven animated graph (web
//  has no native driver and falls back to JS), so a 60fps pan
//  re-renders nothing. The one thing that crosses back to the
//  screen is the rounded angle to the target (onDeltaChange),
//  read off the scroll event listener and reported only when
//  it moves by a few degrees.
//
//  Committed dark look in both themes — a photo stage reads
//  wrong on a light surface — so bg-black / white overlay text
//  are deliberate here.
//
//  Split into (root component last):
//
//    deltaAngleAt      — signed angle from view center to target
//    PanoramaTiles     — the three side-by-side panorama copies
//    HintPill          — the fading "full 360°" hint
//    StepChip          — the "2 / 5" counter
//    DirectionMarker   — the anchored, tilting badge
//    PanoramaNavigator — the stage itself (default export)
// -----------------------------------------------------------

// JS-side palette colors for the marker
import { useTheme } from '@/hooks/useTheme';

// The panorama bitmap
import { Image as ExpoImage, type ImageLoadEventData } from 'expo-image';

// Stage primitives
import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Image as RNImage,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';


export interface PanoramaNavigatorProps {
  panoSource: ImageSourcePropType;
  targetAzimuth: number;      // 0–360° across the panorama width
  containerHeight: number;    // measured stage height from the screen
  step: number;               // waypoint index — re-keys the fading hint
  arrived?: boolean;          // at the destination: no marker, no deltas
  stepLabel: string;          // the counter chip text ("2 / 5")
  onDeltaChange?: (deltaDeg: number, aligned: boolean) => void;
}


// Within this many degrees of the target the marker turns green
export const ALIGNED_TOLERANCE_DEG = 12;

// Marker footprint
const MARKER_SIZE = 72;

// The screen re-renders only when the angle moves this much
const DELTA_REPORT_STEP = 3;







// -----------------------------------------------------------
// deltaAngleAt
// -----------------------------------------------------------
//
// Signed shortest rotation (degrees, positive is right) from
// whatever currently sits at the viewport center to the target
// azimuth, for a given scroll offset. Wraps at ±180° so the
// marker always points the short way round.
//
// Used by:
//   - PanoramaNavigator (below) — the reported delta
// -----------------------------------------------------------

export function deltaAngleAt(
  scrollOffset: number,
  tileWidth: number,
  windowWidth: number,
  targetAzimuth: number,
): number {

  if (tileWidth <= 0) return 0;


  const centerWithinTile = (((scrollOffset + windowWidth / 2) % tileWidth) + tileWidth) % tileWidth;
  const centerAngle = (centerWithinTile / tileWidth) * 360;


  let delta = targetAzimuth - centerAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}







// -----------------------------------------------------------
// PanoramaTiles
// -----------------------------------------------------------
//
// The same panorama five times side by side — the middle copy
// is the one on screen, the outer pairs give the seam handlers
// two full tiles of buffer in both directions, enough that
// even a hard fling runs out of momentum before the hard edge
// of the strip. All five share ONE decoded bitmap — expo-image
// keys its memory cache by source — so the extra copies cost
// views, not memory. Memoized so the screen's instruction
// re-renders never touch the bitmaps.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

const PanoramaTiles = memo(function PanoramaTiles({
  source,
  tileWidth,
  height,
  onLoad,
}: {
  source: ImageSourcePropType;
  tileWidth: number;
  height: number;
  onLoad?: (event: ImageLoadEventData) => void;
}) {

  const tile = { width: tileWidth, height };


  // onLoad on the first tile only — all five decode the same
  // asset, so one report of its real size is enough
  return (
    <View style={{ width: tileWidth * 5, height, flexDirection: 'row' }}>
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} onLoad={onLoad} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
    </View>
  );
});







// -----------------------------------------------------------
// HintPill
// -----------------------------------------------------------
//
// "Pan — full 360°", top center. It fades out on its own after
// a moment: the first pan teaches the gesture, and the hint
// should not compete with the photo afterwards.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function HintPill() {

  const { t } = useTranslation();
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;


  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 600,
      delay: 2600,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [opacity]);


  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 14, left: 0, right: 0, alignItems: 'center', opacity }}>
      <View className="flex-row items-center rounded-full bg-black/60 px-3 py-1.5">
        <Ionicons name="swap-horizontal" size={14} color={colors.onBrand} />
        <Text className="ml-1.5 font-raleway-medium text-xs text-white">{t('navigation.scrollHint360')}</Text>
      </View>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// StepChip
// -----------------------------------------------------------
//
// The "2 / 5" counter in the top-left corner of the photo.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function StepChip({ label }: { label: string }) {

  return (
    <View pointerEvents="none" className="absolute left-md top-md rounded-full bg-black/60 px-3 py-1.5">
      <Text className="font-raleway-bold text-xs text-white">{label}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// DirectionMarker
// -----------------------------------------------------------
//
// The badge anchored where the next waypoint sits in the
// panorama: a soft halo, a solid disc with an up arrow, tilting
// towards the target while it is off to a side and turning
// green once the view is aligned. It rides the animated offset
// through the caller's interpolations, so it never re-renders
// while panning; memoized so only an alignment flip (or a new
// animated graph) touches it at all.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

const DirectionMarker = memo(function DirectionMarker({
  left,
  tilt,
  top,
  aligned,
}: {
  left: Animated.AnimatedInterpolation<number>;
  tilt: Animated.AnimatedInterpolation<string>;
  top: number;
  aligned: boolean;
}) {

  const { colors } = useTheme();


  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top, left: 0, width: MARKER_SIZE, transform: [{ translateX: left }] }}
    >
      <Animated.View
        style={{
          width: MARKER_SIZE,
          height: MARKER_SIZE,
          borderRadius: MARKER_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.22)',
          transform: [{ rotate: tilt }],
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: aligned ? colors.success : colors.brand,
            borderWidth: 3,
            borderColor: colors.onBrand,
          }}
        >
          <Ionicons name="arrow-up" size={24} color={colors.onBrand} />
        </View>
      </Animated.View>
    </Animated.View>
  );
});







// -----------------------------------------------------------
// PanoramaNavigator (default export)
// -----------------------------------------------------------
//
// Memoized: the map screen re-renders on every reported angle
// bucket while panning, but the stage's own props are stable
// through a pan — the whole photo subtree skips those renders.
//
// Used by:
//   - app/(main)/tabs/map.tsx — the route view of the map tab
// -----------------------------------------------------------

export default memo(function PanoramaNavigator({
  panoSource,
  targetAzimuth,
  containerHeight,
  step,
  arrived = false,
  stepLabel,
  onDeltaChange,
}: PanoramaNavigatorProps) {

  const { width: windowWidth } = useWindowDimensions();


  // Bundled assets resolve their pixel size synchronously, so
  // the tile is sized right on the very first frame; web lacks
  // resolveAssetSource and starts from a 2:1 guess
  const bundledAspect = useMemo(() => {
    try {
      const resolved = RNImage.resolveAssetSource(panoSource) as
        | { width?: number; height?: number }
        | undefined;
      return resolved?.width && resolved.height ? resolved.width / resolved.height : 2;
    } catch {
      return 2;
    }
  }, [panoSource]);

  // The decoded image is the final authority — without it the
  // 2:1 guess letterboxes the stage with black bands on web
  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  useEffect(() => {
    setMeasuredAspect(null);
  }, [panoSource]);
  // Stable — only the setter is captured — so the PanoramaTiles
  // memo actually holds across re-renders
  const onImageLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setMeasuredAspect(width / height);
  }, []);
  const aspect = measuredAspect ?? bundledAspect;

  // The width at which the whole panorama fits the height
  const tileWidth = Math.max(1, containerHeight * aspect);


  // A 4096-wide panorama decodes to ~20 MB; without eviction
  // every step of a walked route stays pinned in expo-image's
  // memory cache. Evicted when the source changes (and on
  // unmount) — the mounted tiles hold their own reference, so
  // the visible photo never blinks, and the disk cache keeps a
  // revisited step fast
  useEffect(() => {
    return () => {
      void ExpoImage.clearMemoryCache();
    };
  }, [panoSource]);


  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(tileWidth * 2)).current;
  const [aligned, setAligned] = useState(false);


  // Bound by the report effect below; the scroll handler reads
  // through the ref so its memo never has to rebuild
  const reportRef = useRef<(offset: number) => void>(() => {});


  // The scroll offset feeds the Animated graph on the UI
  // thread — no setState, so panning never re-renders the
  // stage. Web has no native driver and falls back to JS. The
  // listener hands the offset to the delta report at scroll-
  // event cadence instead of a per-frame value listener
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: Platform.OS !== 'web',
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
          reportRef.current(event.nativeEvent.contentOffset.x),
      }),
    [scrollX],
  );


  // Marker geometry as pure Animated math: modulo folds the
  // offset into one tile, the outer interpolation clamps the
  // marker on-screen, and the tilt leans towards the target
  // (flat inside the tolerance, up to 26° at ±45° and beyond)
  const { markerLeft, markerTilt } = useMemo(() => {
    const targetX = (targetAzimuth / 360) * tileWidth;
    const wrapped = Animated.modulo(
      Animated.subtract(new Animated.Value(targetX - windowWidth / 2 + tileWidth / 2), scrollX),
      tileWidth,
    );

    const trackWidth = Math.max(1, windowWidth - MARKER_SIZE);
    const left = Animated.add(
      wrapped,
      new Animated.Value(windowWidth / 2 - MARKER_SIZE / 2 - tileWidth / 2),
    ).interpolate({
      inputRange: [0, trackWidth],
      outputRange: [0, trackWidth],
      extrapolate: 'clamp',
    });

    const at = (deg: number) => tileWidth / 2 + (deg / 360) * tileWidth;
    const tilt = wrapped.interpolate({
      inputRange: [at(-180), at(-45), at(-ALIGNED_TOLERANCE_DEG), at(ALIGNED_TOLERANCE_DEG), at(45), at(180)],
      outputRange: ['-26deg', '-26deg', '0deg', '0deg', '26deg', '26deg'],
      extrapolate: 'clamp',
    });

    return { markerLeft: left, markerTilt: tilt };
  }, [scrollX, tileWidth, targetAzimuth, windowWidth]);


  // The one bridge back to React: the rounded angle plus the
  // EXACT aligned flag, reported together whenever either
  // moves — the caller's sheet uses the flag as-is, so it can
  // never disagree with the marker at the tolerance boundary.
  // Silent while arrived: there is nothing left to point at.
  const lastReported = useRef<{ rounded: number; aligned: boolean } | null>(null);
  const onDeltaRef = useRef(onDeltaChange);
  useEffect(() => {
    onDeltaRef.current = onDeltaChange;
  }, [onDeltaChange]);
  useEffect(() => {
    if (arrived) {
      reportRef.current = () => {};
      return;
    }
    const report = (offset: number) => {
      const delta = deltaAngleAt(offset, tileWidth, windowWidth, targetAzimuth);
      const nowAligned = Math.abs(delta) <= ALIGNED_TOLERANCE_DEG;
      setAligned((prev) => (prev === nowAligned ? prev : nowAligned));

      const rounded = Math.round(delta / DELTA_REPORT_STEP) * DELTA_REPORT_STEP;
      if (rounded !== lastReported.current?.rounded || nowAligned !== lastReported.current?.aligned) {
        lastReported.current = { rounded, aligned: nowAligned };
        onDeltaRef.current?.(rounded, nowAligned);
      }
    };
    reportRef.current = report;
    report(tileWidth * 2);
  }, [tileWidth, windowWidth, targetAzimuth, arrived]);


  // contentOffset centers the very first frame; this effect
  // re-centers on every step or size change (and covers web,
  // where the contentOffset prop is not implemented)
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: tileWidth * 2, animated: false });
    scrollX.setValue(tileWidth * 2);
  }, [panoSource, tileWidth, scrollX]);


  // Teleporting by whole tile widths is invisible — the marker
  // position is modulo the tile — but doing it mid-gesture
  // kills fling momentum, so it waits for the end. Folding
  // into the middle tile in one move also covers a fling that
  // crossed more than one seam
  const recenter = (x: number) => {
    const centered = x - tileWidth * Math.round(x / tileWidth - 2);
    if (centered !== x) scrollRef.current?.scrollTo({ x: centered, animated: false });
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    recenter(event.nativeEvent.contentOffset.x);
  };

  // A drag can hand over to momentum — recenter now only when
  // the finger lifted with no fling to interrupt
  const handleDragEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, velocity } = event.nativeEvent;
    if (Math.abs(velocity?.x ?? 0) < 0.05) recenter(contentOffset.x);
  };


  return (
    <View className="bg-black" style={{ height: containerHeight, overflow: 'hidden' }}>

      {/* The looping panorama strip. Animated.ScrollView, not the
          plain one: a native-driven Animated.event is a class
          instance, not a callable, and only the animated wrapper
          knows to attach it natively instead of invoking it */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: tileWidth * 2, y: 0 }}
        onScroll={onScroll}
        onScrollEndDrag={handleDragEnd}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        <PanoramaTiles source={panoSource} tileWidth={tileWidth} height={containerHeight} onLoad={onImageLoad} />
      </Animated.ScrollView>

      {/* At the destination the marker would keep pointing past
          it — the arrival card below the stage takes over */}
      {!arrived ? (
        <DirectionMarker
          left={markerLeft}
          tilt={markerTilt}
          top={Math.max(0, containerHeight * 0.5 - MARKER_SIZE / 2)}
          aligned={aligned}
        />
      ) : null}
      <StepChip label={stepLabel} />
      {/* Keyed by the waypoint index — String(panoSource) is
          '[object Object]' on web, which never re-keys */}
      <HintPill key={step} />

    </View>
  );
});
