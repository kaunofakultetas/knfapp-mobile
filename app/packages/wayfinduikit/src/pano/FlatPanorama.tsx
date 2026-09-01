// -----------------------------------------------------------
//  [*] wayfinduikit — FlatPanorama
//
//  The panorama stage that needs no GL: the photo laid out
//  five times in a horizontal strip, so panning can loop
//  forever. The middle copy is the one on screen; the outer
//  pairs are buffer, enough that even a hard fling runs out of
//  momentum before the strip's hard edge. When a gesture ends
//  off the middle tile the offset teleports back by whole
//  tiles — invisible, because every placement here is modulo
//  the tile — and only THEN, since teleporting mid-gesture
//  kills the fling.
//
//  Over the strip sit the route marker (anchored where the
//  target yaw is, clamped to the edges so it is always
//  reachable, leaning and colouring itself from the offset)
//  and the hotspots (anchored the same way, hidden once they
//  leave the view — a hotspot pinned to an edge would invite
//  a tap on nothing). The offset lives in state: each scroll
//  event re-renders the chrome, which is cheap, while the
//  tiles are memoised on stable props and never re-render
//  through a pan.
//
//  Yaw is the photo's own frame, the one the routing engine
//  authors: 0 is the photo's CENTRE column, growing to the
//  right, the two edges being ±180. The strip is seeded so the
//  view faces initialYaw (0 by default) on mount — later
//  changes to the prop are ignored, as on the sphere: once
//  mounted the view is the walker's. A photo is told from the
//  next by its KEY — the uri string, the asset number, or the
//  uri inside a { uri } object — never by the object itself,
//  which a host builds fresh on every render; only a new key
//  re-seeds the strip, drops the measured aspect and restarts
//  the hint.
//
//  Two things cross back to the host. The tile width is the
//  photo's aspect at the stage height — a bundled asset
//  answers its size at once, a remote one on decode, 2:1
//  until then — and a re-measure (or a stage laid out at a
//  new width) re-lays the strip under the yaw the view already
//  had, so a pan in progress never jumps. The view yaw goes
//  out through onYawChange, rounded to whole degrees and only
//  once it has moved three of them since the last report, so
//  a host keeping it in state re-renders a handful of times
//  per pan, not sixty.
//
//  Committed dark look in both schemes (theme stageBg /
//  stageInk): a photo stage reads wrong on a light surface.
//
//  Split into (root component last):
//
//    PanoramaTiles — the five side-by-side copies, memoised
//    HintPill      — the fading "drag to look around" hint
//    HotspotChip   — one tappable hotspot over the strip
//    FlatPanorama  — the stage itself (default export)
//
//  Used by:
//    - pano/PanoramaStage.tsx — the fallback when the GL
//      peers are absent or the surface fails
//    - the host app, through the root export
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage, type ImageLoadEventData } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  Animated,
  Image as RNImage,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { KitHotspot } from '../core/types';
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';
import DirectionMarker, { MARKER_SIZE } from './DirectionMarker';
import { clampToEdge, flatMarkerX, flatViewYaw, shortestArcDeg } from './projection';


// A stored reference (resolved through env.resolveImageUrl),
// a bundled asset, or a ready-made uri
export type PanoSource = string | number | { uri: string };

// What tells one photo from the next: the reference, the asset
// number, or the uri inside the object — by value, so a host
// writing source={{ uri }} inline is not showing a new photo
// on every render
export type PanoSourceKey = string | number;

export const panoSourceKey = (source: PanoSource): PanoSourceKey => (typeof source === 'object' ? source.uri : source);

export interface FlatPanoramaProps {
  source: PanoSource;
  // Where the route continues, in the photo's own yaw frame
  // (0 is the centre column, growing to the right); absent
  // while arrived — there is nothing left to point at
  targetYaw?: number | null;
  // The destination's name, for the marker caption and the
  // stage's accessibility label
  targetLabel?: string | null;
  hotspots?: KitHotspot[];
  onYawChange?: (yaw: number) => void;
  onPressHotspot?: (hotspot: KitHotspot) => void;
  showHint?: boolean;
  height?: number;
  // Where the view faces on mount, in the photo's frame; later
  // changes are ignored — once mounted the view is the walker's
  initialYaw?: number;
}


// The strip: the on-screen tile plus two of buffer either side
const TILE_COPIES = 5;
const MIDDLE_TILE = 2;

// The offset that puts `yaw` at the view centre, inside the
// middle tile: the tile's own middle column is yaw 0, half a
// tile in from its left edge
const offsetForYaw = (yaw: number, tileWidth: number, windowWidth: number): number =>
  tileWidth * MIDDLE_TILE + tileWidth / 2 - windowWidth / 2 + (yaw / 360) * tileWidth;

// What the strip was last laid out for, and where: an offset
// only means a yaw under the tile and width it was measured
// with, so the three travel together
interface StripLayout {
  key: PanoSourceKey;
  tileWidth: number;
  stageWidth: number;
  offset: number;
}

// The photo's aspect until it is measured — equirectangular
// panoramas are twice as wide as tall
const FALLBACK_ASPECT = 2;

// The host hears the yaw only once it moved this much
const YAW_REPORT_STEP_DEG = 3;

// Breathing room between a clamped marker and the stage edge
const MARKER_EDGE_INSET = 8;

const HOTSPOT_SIZE = 36;

// A drag ending slower than this hands nothing to momentum, so
// the recentre must happen now
const STILL_VELOCITY = 0.05;

const HINT_HOLD_MS = 2600;
const HINT_FADE_MS = 600;


const HOTSPOT_GLYPH: Record<KitHotspot['kind'], ComponentProps<typeof Ionicons>['name']> = {
  route: 'navigate',
  link: 'arrow-forward-circle',
  info: 'information-circle',
};







// -----------------------------------------------------------
// PanoramaTiles
// -----------------------------------------------------------
//
// The same photo five times side by side. All copies share one
// decoded bitmap (the image cache keys on the source), so the
// extra copies cost views, not memory. Memoised so the stage's
// per-scroll renders never touch the bitmaps; onLoad rides the
// first copy only — one report of the real size is enough.
//
// Used by:
//   - FlatPanorama (below)
// -----------------------------------------------------------

const PanoramaTiles = memo(function PanoramaTiles({
  source,
  tileWidth,
  height,
  onLoad,
}: {
  source: PanoSource;
  tileWidth: number;
  height: number;
  onLoad: (event: ImageLoadEventData) => void;
}) {

  const tile = { width: tileWidth, height };


  return (
    <View style={{ width: tileWidth * TILE_COPIES, height, flexDirection: 'row' }}>
      {Array.from({ length: TILE_COPIES }, (_, index) => (
        <ExpoImage
          key={index}
          testID={index === 0 ? 'wayfinduikit-flat-tile' : undefined}
          source={source}
          style={tile}
          contentFit="cover"
          cachePolicy="memory-disk"
          priority="high"
          transition={0}
          onLoad={index === 0 ? onLoad : undefined}
        />
      ))}
    </View>
  );
});







// -----------------------------------------------------------
// HintPill
// -----------------------------------------------------------
//
// "Drag to look around", top centre. It fades on its own
// after a moment — the first pan teaches the gesture, and the
// hint must not compete with the photo afterwards. The stage
// re-keys it per photo, so a new panorama gets a fresh hint.
//
// Used by:
//   - FlatPanorama (below)
// -----------------------------------------------------------

function HintPill({ text }: { text: string }) {

  const { colors, fonts, radii } = useKitTheme();
  const opacity = useRef(new Animated.Value(1)).current;


  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: HINT_FADE_MS,
      delay: HINT_HOLD_MS,
      useNativeDriver: Platform.OS !== 'web',
    });
    fade.start();
    return () => fade.stop();
  }, [opacity]);


  return (
    <Animated.View
      testID="wayfinduikit-flat-hint"
      pointerEvents="none"
      style={{ position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center', opacity }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.overlay }}>
        <Ionicons name="swap-horizontal" size={14} color={colors.overlayInk} />
        <Text style={{ marginLeft: 6, fontSize: 12, fontFamily: fonts.medium, color: colors.overlayInk }}>{text}</Text>
      </View>
    </Animated.View>
  );
}







// -----------------------------------------------------------
// HotspotChip
// -----------------------------------------------------------
//
// One hotspot: a round glyph for its kind, with the label
// beside it when there is one. Centred on the anchor the
// stage computed, so `left` / `top` are the anchor minus half
// the footprint. Inert without onPress — a stage used as a
// plain viewer still shows what is there.
//
// Used by:
//   - FlatPanorama (below)
// -----------------------------------------------------------

function HotspotChip({ hotspot, x, y, onPress }: { hotspot: KitHotspot; x: number; y: number; onPress?: () => void }) {

  const { colors, fonts, radii } = useKitTheme();


  return (
    <Pressable
      testID={`wayfinduikit-hotspot-${hotspot.id}`}
      accessibilityRole="button"
      accessibilityLabel={hotspot.label ?? undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{
        position: 'absolute',
        left: x - HOTSPOT_SIZE / 2,
        top: y - HOTSPOT_SIZE / 2,
        height: HOTSPOT_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 4,
        paddingRight: hotspot.label ? 12 : 4,
        borderRadius: radii.pill,
        backgroundColor: colors.overlay,
      }}
    >
      <Ionicons name={HOTSPOT_GLYPH[hotspot.kind]} size={HOTSPOT_SIZE - 8} color={hotspot.kind === 'route' ? colors.brand : colors.overlayInk} />
      {hotspot.label ? (
        <Text numberOfLines={1} style={{ marginLeft: 6, maxWidth: 140, fontSize: 12, fontFamily: fonts.medium, color: colors.overlayInk }}>
          {hotspot.label}
        </Text>
      ) : null}
    </Pressable>
  );
}







// -----------------------------------------------------------
// FlatPanorama (default export)
// -----------------------------------------------------------
//
//   <FlatPanorama source={step.panorama} targetYaw={step.yaw}
//                 hotspots={step.hotspots}
//                 initialYaw={step.yaw ?? 0}
//                 onYawChange={setHeading}
//                 onPressHotspot={(h) => goTo(h.id)} />
//
// Used by:
//   - pano/PanoramaStage.tsx — the fallback without GL
//   - the host app, through the root export
// -----------------------------------------------------------

export default function FlatPanorama({
  source,
  targetYaw,
  targetLabel,
  hotspots,
  onYawChange,
  onPressHotspot,
  showHint = true,
  height = 260,
  initialYaw = 0,
}: FlatPanoramaProps) {

  const { colors } = useKitTheme();
  const labels = useKitLabels();
  const env = useKitEnv();
  const { width: windowWidth } = useWindowDimensions();


  // The stage's own width once it has laid out; the window is
  // the first-frame guess so nothing waits on the layout pass
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const stageWidth = measuredWidth ?? windowWidth;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) setMeasuredWidth(width);
  }, []);


  // Everything downstream keys on the photo's value, so the
  // tiles, the strip and the hint hold still while a host
  // re-renders with a fresh { uri } object of the same uri
  const sourceKey = panoSourceKey(source);
  const isReference = typeof source === 'string';
  const resolvedSource = useMemo<PanoSource>(() => {
    if (typeof sourceKey === 'number') return sourceKey;
    return isReference ? env.resolveImageUrl(sourceKey) : { uri: sourceKey };
  }, [sourceKey, isReference, env]);


  // A bundled asset answers its pixel size synchronously, so
  // the tile is right on the very first frame; anything else
  // starts from the 2:1 guess until the decode reports
  const bundledAspect = useMemo(() => {
    if (typeof sourceKey !== 'number') return FALLBACK_ASPECT;
    try {
      const resolved = RNImage.resolveAssetSource(sourceKey) as { width?: number; height?: number } | null | undefined;
      return resolved?.width && resolved.height ? resolved.width / resolved.height : FALLBACK_ASPECT;
    } catch {
      return FALLBACK_ASPECT;
    }
  }, [sourceKey]);

  const [measuredAspect, setMeasuredAspect] = useState<number | null>(null);
  const [hintEpoch, setHintEpoch] = useState(0);

  // Stable — only the setter is captured — so the tiles' memo
  // actually holds across the per-scroll renders
  const onImageLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height: imageHeight } = event.source;
    if (width > 0 && imageHeight > 0) setMeasuredAspect(width / imageHeight);
  }, []);

  // The width at which the whole photo fits the stage height
  const tileWidth = Math.max(1, height * (measuredAspect ?? bundledAspect));


  const scrollRef = useRef<ScrollView | null>(null);

  // Mount-time only, as on the sphere: read through a ref so a
  // host changing the prop later moves nothing
  const initialYawRef = useRef(initialYaw);

  // The strip is laid out DURING render, so no commit ever pairs
  // an offset with a tile or width it was not measured under —
  // one such commit would be one wrong yaw report. A new photo
  // faces initialYaw and sheds the old photo's measured aspect
  // and hint (an effect would let one frame of the new photo
  // wear them); a new tile (the aspect measured) or a new stage
  // width (the window guess replaced by the layout, a rotation)
  // keeps the yaw the view had under the old geometry
  const [laid, setLaid] = useState<StripLayout>(() => ({ key: sourceKey, tileWidth, stageWidth, offset: offsetForYaw(initialYawRef.current, tileWidth, stageWidth) }));
  const [offset, setOffset] = useState(laid.offset);
  const newPhoto = laid.key !== sourceKey;
  if (newPhoto || laid.tileWidth !== tileWidth || laid.stageWidth !== stageWidth) {
    if (newPhoto) {
      setMeasuredAspect(null);
      setHintEpoch((epoch) => epoch + 1);
    }
    const yaw = newPhoto ? initialYawRef.current : flatViewYaw(offset, laid.tileWidth, laid.stageWidth);
    const x = offsetForYaw(yaw, tileWidth, stageWidth);
    setLaid({ key: sourceKey, tileWidth, stageWidth, offset: x });
    setOffset(x);
  }

  // The first frame's offset, for the native contentOffset prop;
  // it never changes, so the prop never fights a scroll of its
  // own. The effect scrolls once per lay-out — it covers web,
  // where the contentOffset prop is not implemented, and every
  // re-lay after the first frame; a scroll event never re-lays,
  // so a pan is never scrolled back
  const firstOffset = useRef(laid.offset).current;
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: laid.offset, animated: false });
  }, [laid]);


  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffset(event.nativeEvent.contentOffset.x);
  }, []);

  // Folding into the middle tile in one move also covers a
  // fling that crossed more than one seam; the offset state is
  // set alongside, since not every platform echoes a
  // programmatic scroll back as an event
  const recentre = useCallback(
    (x: number) => {
      const centred = x - tileWidth * Math.round(x / tileWidth - MIDDLE_TILE);
      if (centred === x) return;
      scrollRef.current?.scrollTo({ x: centred, animated: false });
      setOffset(centred);
    },
    [tileWidth],
  );

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => recentre(event.nativeEvent.contentOffset.x),
    [recentre],
  );

  // A drag can hand over to momentum — recentre now only when
  // the finger lifted with no fling to interrupt
  const onDragEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, velocity } = event.nativeEvent;
      if (Math.abs(velocity?.x ?? 0) < STILL_VELOCITY) recentre(contentOffset.x);
    },
    [recentre],
  );


  // The one bridge back to the host: the view yaw, whole
  // degrees, reported once it moved three of them (the short
  // way round, so 359 → 1 is a move of two, not 358). The
  // callback is read through a ref so a host passing a fresh
  // closure each render never re-fires the report
  const onYawRef = useRef(onYawChange);
  onYawRef.current = onYawChange;
  const lastReportedYaw = useRef<number | null>(null);
  useEffect(() => {
    const yaw = Math.round(flatViewYaw(offset, tileWidth, stageWidth)) % 360;
    const last = lastReportedYaw.current;
    if (last !== null && Math.abs(shortestArcDeg(last, yaw)) < YAW_REPORT_STEP_DEG) return;
    lastReportedYaw.current = yaw;
    onYawRef.current?.(yaw);
  }, [offset, tileWidth, stageWidth]);


  // The marker anchors mid-height on the target's column,
  // pulled inside the stage by its own half plus a little air
  const marker = targetYaw != null ? flatMarkerX(offset, tileWidth, stageWidth, targetYaw) : null;
  const markerAnchor = marker
    ? clampToEdge({ x: marker.x, y: height / 2 }, { width: stageWidth, height }, MARKER_SIZE / 2 + MARKER_EDGE_INSET)
    : null;


  // Hotspots keep their true column and their pitch — the
  // photo's height spans the horizon ±90° — and simply vanish
  // once their footprint has fully left the stage
  const placedHotspots = useMemo(
    () =>
      (hotspots ?? []).flatMap((hotspot) => {
        const { x } = flatMarkerX(offset, tileWidth, stageWidth, hotspot.yaw);
        if (x < -HOTSPOT_SIZE / 2 || x > stageWidth + HOTSPOT_SIZE / 2) return [];
        const raw = height / 2 - ((hotspot.pitch ?? 0) / 180) * height;
        const y = Math.min(Math.max(raw, HOTSPOT_SIZE / 2), height - HOTSPOT_SIZE / 2);
        return [{ hotspot, x, y }];
      }),
    [hotspots, offset, tileWidth, stageWidth, height],
  );


  return (
    <View testID="wayfinduikit-flat-stage" onLayout={onLayout} style={{ height, overflow: 'hidden', backgroundColor: colors.stageBg }}>

      <ScrollView
        ref={scrollRef}
        testID="wayfinduikit-flat-stage-scroll"
        accessibilityLabel={labels.stageA11y(targetLabel)}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        contentOffset={{ x: firstOffset, y: 0 }}
        onScroll={onScroll}
        onScrollEndDrag={onDragEnd}
        onMomentumScrollEnd={onMomentumEnd}
      >
        <PanoramaTiles source={resolvedSource} tileWidth={tileWidth} height={height} onLoad={onImageLoad} />
      </ScrollView>

      {placedHotspots.map(({ hotspot, x, y }) => (
        <HotspotChip
          key={hotspot.id}
          hotspot={hotspot}
          x={x}
          y={y}
          onPress={onPressHotspot ? () => onPressHotspot(hotspot) : undefined}
        />
      ))}

      {marker && markerAnchor ? (
        <View
          testID="wayfinduikit-flat-marker"
          pointerEvents="none"
          style={{ position: 'absolute', left: markerAnchor.x - MARKER_SIZE / 2, top: markerAnchor.y - MARKER_SIZE / 2 }}
        >
          <DirectionMarker deltaDeg={marker.deltaDeg} label={targetLabel} clamped={markerAnchor.clamped} />
        </View>
      ) : null}

      {showHint ? <HintPill key={hintEpoch} text={labels.stageHint360} /> : null}

    </View>
  );
}
