// -----------------------------------------------------------
//  [*] Map — PanoramaNavigator
//
//  The immersive 360° stage of the map tab: one bundled
//  panorama laid out three times in a horizontal ScrollView so
//  panning can loop forever — when a gesture ends near a seam
//  the offset teleports by exactly one tile width, which every
//  overlay survives because all position math is modulo the
//  tile. Teleporting mid-gesture would kill fling momentum, so
//  it only happens in onMomentumScrollEnd / onScrollEndDrag.
//
//  The scroll offset lives in an Animated.Value, never in
//  React state: the direction arrow's translateX and tilt are
//  interpolations on the animated graph, so a 60fps pan
//  re-renders nothing. Only two discrete facts cross back into
//  state — the aligned flag (root, flips at the tolerance
//  boundary) and the rounded degree readout (DirectionStatus,
//  a leaf, so the heavy image/blur siblings stay untouched).
//
//  This view keeps a committed dark look in both themes — a
//  photo stage reads wrong on a light surface — which is why
//  bg-black and white overlay text are deliberate here.
//
//  Split into (root component last):
//
//    deltaAngleAt       — signed angle from view center to target
//    PanoramaTiles      — the three side-by-side panorama copies
//    HintPill           — the "full 360°" hint at the top
//    BackPill           — previous-step pill, top right
//    DirectionStatus    — live "turn left/right X°" readout row
//    RoomCard           — frosted card: room, floor, direction
//    ArrowMarker        — the tilting SVG arrow over the target
//    NextPill           — next-step / end-of-route pill
//    PanoramaNavigator  — the stage itself (default export)
// -----------------------------------------------------------

// JS-side palette colors for the arrow and the status dot
import { useTheme } from '@/hooks/useTheme';

// Frosted overlay chrome and the panorama bitmap
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';

// Stage primitives
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Image as RNImage,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';


// What the map screen tells us about the current waypoint —
// floorLabel arrives already translated by the caller
export interface PanoRoom {
  name: string;
  floorLabel: string;
  distanceMeters?: number;
}


interface PanoramaNavigatorProps {
  panoSource: ImageSourcePropType;
  targetAzimuth: number;      // 0–360° across the panorama width
  containerHeight: number;    // measured usable height from the screen
  room: PanoRoom;
  onBack?: () => void;        // absent on the first step — hides the pill
  onNext?: () => void;
  atEnd?: boolean;            // last step: Next becomes a disabled end state
}


// Within this many degrees of the target the arrow turns green
// and the Next pill unlocks
const ALIGNED_TOLERANCE_DEG = 12;

// Arrow footprint and overlay spacing — the room card is
// measured at runtime, everything else stacks off these
const ARROW_SIZE = 96;
const CARD_BOTTOM = 16;
const PILL_HEIGHT = 44;
const OVERLAY_GAP = 12;

// Shared geometry props the readout row needs to turn a scroll
// offset back into an angle
interface AngleGeometry {
  scrollX: Animated.Value;
  tileWidth: number;
  windowWidth: number;
  targetAzimuth: number;
}







// -----------------------------------------------------------
// deltaAngleAt
// -----------------------------------------------------------
//
// Signed shortest rotation (degrees, positive is right) from
// whatever currently sits at the viewport center to the target
// azimuth, for a given scroll offset. Wraps at ±180° so the
// arrow always points the short way round.
//
// Used by:
//   - PanoramaNavigator (below) — aligned flag
//   - DirectionStatus (below) — the degree readout
// -----------------------------------------------------------

function deltaAngleAt(
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
// The same panorama three times side by side — the middle copy
// is the one on screen, the outer two give the seam handlers a
// full tile of buffer in both directions.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function PanoramaTiles({
  source,
  tileWidth,
  height,
}: {
  source: ImageSourcePropType;
  tileWidth: number;
  height: number;
}) {

  const tile = { width: tileWidth, height };


  return (
    <View style={{ width: tileWidth * 3, height, flexDirection: 'row' }}>
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
      <ExpoImage source={source} style={tile} contentFit="contain" cachePolicy="memory-disk" priority="high" transition={0} />
    </View>
  );
}







// -----------------------------------------------------------
// HintPill
// -----------------------------------------------------------
//
// The "scroll — full 360°" hint, top center. The 72pt side
// margins keep it clear of the BackPill in the corner.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function HintPill() {

  const { t } = useTranslation();


  return (
    <View pointerEvents="none" className="absolute flex-row justify-center" style={{ top: 16, left: 72, right: 72 }}>
      <View className="rounded-full bg-black/70 px-md py-sm">
        <Text className="text-center font-raleway-medium text-sm text-white/90">
          {t('navigation.scrollHint360')}
        </Text>
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// BackPill
// -----------------------------------------------------------
//
// Previous-step pill in the top-right corner. The screen only
// passes onBack from step 1 onwards, so this can never pop
// router history — "Atgal" always means "one panorama back".
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function BackPill({ onPress }: { onPress: () => void }) {

  const { t } = useTranslation();


  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t('navigation.previousStep')}
      style={({ pressed }) => [{ position: 'absolute', top: 16, right: 16 }, pressed && { opacity: 0.7 }]}
    >
      <BlurView intensity={45} tint="dark" style={{ borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 9 }}>
          <Text className="font-raleway-bold text-sm text-white">{t('common.back')}</Text>
        </View>
      </BlurView>
    </Pressable>
  );
}







// -----------------------------------------------------------
// DirectionStatus
// -----------------------------------------------------------
//
// The live "On target / Turn left X°" row inside the room
// card. It keeps the rounded degree in its own state, fed by a
// listener on the shared scroll value, so panning re-renders
// only this leaf — never the panorama tiles or blur layers.
// The row is a polite live region, so screen readers get the
// same alignment feedback the dot color gives sighted users.
//
// Used by:
//   - RoomCard (below)
// -----------------------------------------------------------

function DirectionStatus({ scrollX, tileWidth, windowWidth, targetAzimuth }: AngleGeometry) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  // Starts from the centered offset the stage resets to; the
  // listener corrects it on the very first scroll event
  const [delta, setDelta] = useState(() =>
    Math.round(deltaAngleAt(tileWidth, tileWidth, windowWidth, targetAzimuth)),
  );


  // setValue on step change also notifies this listener, so the
  // readout snaps to the new panorama without an extra effect
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      const next = Math.round(deltaAngleAt(value, tileWidth, windowWidth, targetAzimuth));
      setDelta((prev) => (prev === next ? prev : next));
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, tileWidth, windowWidth, targetAzimuth]);


  const aligned = Math.abs(delta) <= ALIGNED_TOLERANCE_DEG;
  const text = aligned
    ? t('navigation.onTarget')
    : delta >= 0
      ? t('navigation.turnRight', { deg: Math.abs(delta) })
      : t('navigation.turnLeft', { deg: Math.abs(delta) });


  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      className="mt-xs flex-row items-center justify-between border-t border-white/15 pt-sm"
    >
      <Text className="font-raleway-medium text-sm text-white">{text}</Text>
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: aligned ? colors.success : colors.danger }}
      />
    </View>
  );
}







// -----------------------------------------------------------
// RoomCard
// -----------------------------------------------------------
//
// The frosted card at the bottom: room name, translated floor
// label with distance, and the DirectionStatus row. Its height
// is reported upwards through onLayout so the arrow and pill
// can stack relative to the real card, not a guess.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function RoomCard({
  room,
  onLayout,
  ...geometry
}: AngleGeometry & { room: PanoRoom; onLayout: (event: LayoutChangeEvent) => void }) {
  return (
    <BlurView
      intensity={45}
      tint="dark"
      onLayout={onLayout}
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: CARD_BOTTOM,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      }}
    >
      <View className="px-md py-md" style={{ rowGap: 5 }}>

        <Text className="font-raleway-bold text-lg text-white" numberOfLines={2}>
          {room.name}
        </Text>

        <Text className="font-raleway text-sm text-white/60" numberOfLines={1}>
          {room.floorLabel}
          {room.distanceMeters != null ? ` · ${room.distanceMeters} m` : ''}
        </Text>

        <DirectionStatus {...geometry} />
      </View>
    </BlurView>
  );
}







// -----------------------------------------------------------
// ArrowMarker
// -----------------------------------------------------------
//
// The perspective-tilted SVG arrow. Horizontal position comes
// from the parent's animated translateX; the lean (rotateZ) is
// an animated interpolation too, so only the green/red flip of
// the aligned flag ever re-renders this tree.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function ArrowMarker({ aligned, tilt }: { aligned: boolean; tilt: Animated.AnimatedInterpolation<string> }) {

  const { colors } = useTheme();


  const tone = aligned ? colors.success : colors.danger;


  return (
    <Animated.View
      style={{
        width: ARROW_SIZE,
        height: ARROW_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ perspective: 900 }, { rotateX: '32deg' }, { rotateZ: tilt }],
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <Svg width={ARROW_SIZE} height={ARROW_SIZE} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id="panoArrowFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tone} stopOpacity="0.8" />
            <Stop offset="1" stopColor={tone} />
          </LinearGradient>
          <LinearGradient id="panoArrowRing" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.onBrand} stopOpacity="0.9" />
            <Stop offset="1" stopColor={colors.onBrand} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>
        {/* Scrim disc grounds the arrow against busy photos */}
        <Circle cx="50" cy="54" r="42" fill={colors.scrim} />
        <Circle cx="50" cy="54" r="38" stroke="url(#panoArrowRing)" strokeWidth="2" fill="none" />
        <Path
          d="M50 12 L70 66 L50 56 L30 66 Z"
          fill="url(#panoArrowFill)"
          stroke={colors.onBrand}
          strokeOpacity="0.7"
          strokeWidth="1.8"
        />
      </Svg>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// NextPill
// -----------------------------------------------------------
//
// The advance control. While walking it unlocks only when the
// view is aligned with the target; on the last step it becomes
// a permanently disabled end-of-route state instead of the old
// silent wrap back to step 0.
//
// Used by:
//   - PanoramaNavigator (below)
// -----------------------------------------------------------

function NextPill({ aligned, atEnd, onPress }: { aligned: boolean; atEnd: boolean; onPress?: () => void }) {

  const { t } = useTranslation();


  const disabled = atEnd || !aligned;
  const label = atEnd ? t('navigation.endOfRoute') : t('common.next');


  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={atEnd ? t('navigation.endOfRoute') : t('navigation.nextStep')}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [{ opacity: disabled ? 0.55 : pressed ? 0.85 : 1 }]}
    >
      <BlurView intensity={disabled ? 35 : 55} tint="dark" style={{ borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ minHeight: PILL_HEIGHT, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Text className="font-raleway-bold text-sm text-white" numberOfLines={1}>
            {label}
          </Text>
        </View>
      </BlurView>
    </Pressable>
  );
}







// -----------------------------------------------------------
// PanoramaNavigator (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/map.tsx — the map tab screen
// -----------------------------------------------------------

export default function PanoramaNavigator({
  panoSource,
  targetAzimuth,
  containerHeight,
  room,
  onBack,
  onNext,
  atEnd = false,
}: PanoramaNavigatorProps) {

  const { width: windowWidth } = useWindowDimensions();


  // Bundled assets resolve their pixel size synchronously, so
  // the tile is sized right on the very first frame; web lacks
  // resolveAssetSource and falls back to a 2:1 guess
  const aspect = useMemo(() => {
    try {
      const resolved = RNImage.resolveAssetSource(panoSource) as
        | { width?: number; height?: number }
        | undefined;
      return resolved?.width && resolved.height ? resolved.width / resolved.height : 2;
    } catch {
      return 2;
    }
  }, [panoSource]);

  // The width at which the whole panorama fits the height
  const tileWidth = Math.max(1, containerHeight * aspect);


  const scrollRef = useRef<ScrollView | null>(null);
  const scrollX = useRef(new Animated.Value(tileWidth)).current;
  const [aligned, setAligned] = useState(
    () => Math.abs(deltaAngleAt(tileWidth, tileWidth, windowWidth, targetAzimuth)) <= ALIGNED_TOLERANCE_DEG,
  );
  const [cardHeight, setCardHeight] = useState(104);


  // The scroll offset feeds the Animated graph directly — no
  // setState, so panning never re-renders the stage
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false }),
    [scrollX],
  );


  // Arrow geometry as pure Animated math: modulo folds the
  // offset into one tile, the outer interpolation clamps the
  // arrow on-screen, and the tilt curve reproduces the old JS
  // formula (flat inside the tolerance, then leaning towards
  // 28° at ±45° and beyond)
  const { arrowLeft, arrowTilt } = useMemo(() => {
    const targetX = (targetAzimuth / 360) * tileWidth;
    const wrapped = Animated.modulo(
      Animated.subtract(new Animated.Value(targetX - windowWidth / 2 + tileWidth / 2), scrollX),
      tileWidth,
    );

    const trackWidth = Math.max(1, windowWidth - ARROW_SIZE);
    const left = Animated.add(
      wrapped,
      new Animated.Value(windowWidth / 2 - ARROW_SIZE / 2 - tileWidth / 2),
    ).interpolate({
      inputRange: [0, trackWidth],
      outputRange: [0, trackWidth],
      extrapolate: 'clamp',
    });

    // Degrees → wrapped-pixels for the tilt breakpoints; the
    // 0.01° step fakes the jump at the tolerance boundary
    const at = (deg: number) => tileWidth / 2 + (deg / 360) * tileWidth;
    const lean = 10 + (18 * ALIGNED_TOLERANCE_DEG) / 45;
    const tilt = wrapped.interpolate({
      inputRange: [
        at(-180),
        at(-45),
        at(-ALIGNED_TOLERANCE_DEG - 0.01),
        at(-ALIGNED_TOLERANCE_DEG),
        at(ALIGNED_TOLERANCE_DEG),
        at(ALIGNED_TOLERANCE_DEG + 0.01),
        at(45),
        at(180),
      ],
      outputRange: ['-28deg', '-28deg', `-${lean}deg`, '0deg', '0deg', `${lean}deg`, '28deg', '28deg'],
      extrapolate: 'clamp',
    });

    return { arrowLeft: left, arrowTilt: tilt };
  }, [scrollX, tileWidth, targetAzimuth, windowWidth]);


  // Only the aligned flag crosses back into React state, and
  // only when it actually flips at the tolerance boundary
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      const nowAligned =
        Math.abs(deltaAngleAt(value, tileWidth, windowWidth, targetAzimuth)) <= ALIGNED_TOLERANCE_DEG;
      setAligned((prev) => (prev === nowAligned ? prev : nowAligned));
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, tileWidth, windowWidth, targetAzimuth]);


  // contentOffset centers the very first frame; this effect
  // re-centers on every step or size change (and covers web,
  // where the contentOffset prop is not implemented). setValue
  // also nudges the listeners, so the overlays snap along.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: tileWidth, animated: false });
    scrollX.setValue(tileWidth);
  }, [panoSource, tileWidth, scrollX]);


  // Teleporting by exactly one tile width is invisible — every
  // overlay position is modulo the tile — but doing it mid-
  // gesture kills fling momentum, so it waits for the end
  const recenter = (x: number) => {
    if (x < tileWidth * 0.5) {
      scrollRef.current?.scrollTo({ x: x + tileWidth, animated: false });
    } else if (x > tileWidth * 1.5) {
      scrollRef.current?.scrollTo({ x: x - tileWidth, animated: false });
    }
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


  const handleCardLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.height);
    setCardHeight((prev) => (prev === measured ? prev : measured));
  };


  // One overlay stack measured off the real card: pill row
  // directly above it, arrow above the pill — nothing collides
  const pillBottom = CARD_BOTTOM + cardHeight + OVERLAY_GAP;
  const arrowBottom = pillBottom + PILL_HEIGHT + OVERLAY_GAP;


  return (
    <View className="bg-black" style={{ height: containerHeight, overflow: 'hidden' }}>

      {/* The looping panorama strip */}
      <ScrollView
        ref={scrollRef}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: tileWidth, y: 0 }}
        onScroll={onScroll}
        onScrollEndDrag={handleDragEnd}
        onMomentumScrollEnd={handleMomentumEnd}
      >
        <PanoramaTiles source={panoSource} tileWidth={tileWidth} height={containerHeight} />
      </ScrollView>

      <HintPill />
      {onBack ? <BackPill onPress={onBack} /> : null}

      {/* The arrow rides the animated offset; the pill follows
          it while walking and parks centered at route's end */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          bottom: arrowBottom,
          width: ARROW_SIZE,
          transform: [{ translateX: arrowLeft }],
        }}
      >
        <ArrowMarker aligned={aligned} tilt={arrowTilt} />
      </Animated.View>

      {onNext && !atEnd ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            bottom: pillBottom,
            width: ARROW_SIZE,
            alignItems: 'center',
            transform: [{ translateX: arrowLeft }],
          }}
        >
          <NextPill aligned={aligned} atEnd={false} onPress={onNext} />
        </Animated.View>
      ) : null}

      {atEnd ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: pillBottom, alignItems: 'center' }}
        >
          <NextPill aligned={aligned} atEnd />
        </View>
      ) : null}

      <RoomCard
        room={room}
        scrollX={scrollX}
        tileWidth={tileWidth}
        windowWidth={windowWidth}
        targetAzimuth={targetAzimuth}
        onLayout={handleCardLayout}
      />
    </View>
  );
}
