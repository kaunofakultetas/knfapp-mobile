// -----------------------------------------------------------
//  [*] @knf/wayfinduikit — public surface
//
//  Everything a host may import, in one place. The runtime
//  export list is pinned by src/__tests__/surface.test.ts —
//  adding here is deliberate; removing or renaming is a
//  breaking change for every host.
// -----------------------------------------------------------

// View types
export type {
  KitLevel,
  KitTurnDirection,
  KitInstruction,
  KitRouteSegment,
  KitRouteSummary,
  KitNavigationState,
  KitHotspot,
  KitPanoGeometry,
} from './core/types';

// Provider — theme, labels, env
export { WayfindUiKitProvider, useKitTheme, useKitLabels, useKitEnv } from './provider';
export { defaultTheme, darkTheme, resolveTheme, type KitTheme } from './provider/theme';
export { defaultLabels, type KitLabels } from './provider/labels';

// Formatting helpers, pure
export { formatDistance, formatEta, instructionText } from './core/format';

// The floor plan and its controls
export { default as FloorPlan, type PlanPoint, type PlanNode, type PlanRoom } from './plan/FloorPlan';
export { default as FloorSwitcher } from './plan/FloorSwitcher';

// Route surfaces
export { default as RoutePreview } from './route/RoutePreview';
export { default as RouteSheet } from './route/RouteSheet';
export { default as InstructionLine } from './route/InstructionLine';
export { default as YouAreHereBar } from './route/YouAreHereBar';

// The guided-capture overlay — pure, laid over the host's
// camera preview by the admin capture screen
export { default as CaptureHud, type CaptureHudProps, type CaptureHudTarget, type CaptureHudPose } from './capture/CaptureHud';

// The panorama stage — the true sphere and the flat fallback
// share props and the pure projection math
export { default as PanoramaStage } from './pano/PanoramaStage';
export { default as FlatPanorama } from './pano/FlatPanorama';
export { default as DirectionMarker } from './pano/DirectionMarker';
export {
  projectToScreen,
  shortestArcDeg,
  clampToEdge,
  flatMarkerX,
  resolvePanoGeometry,
  viewLimits,
  limitYaw,
  limitPitch,
  type ResolvedPanoGeometry,
  type ViewLimits,
} from './pano/projection';
