// -----------------------------------------------------------
//  [*] wayfinduikit — view types
//
//  The kit's own vocabulary: display twins of the engine's
//  route / instruction / navigation shapes. Levels and floor
//  segments are the same shape; steps and the walking state
//  carry NAMES where the engine carries ids (towardsRoom for
//  towardsRoomId, toLevelLabel for toLevel, currentPlace for
//  currentRoomId), so a host running @knf/wayfindengine maps
//  each with one small function (the README shows them) — and
//  the packages stay independent, meeting only in the host.
//  Everything is display truth: the kit never routes, never
//  measures, never decides where the walker is.
//
//  Plan coordinates are the drawing's pixels (the level's
//  viewBox); the kit's plan viewer scales them to the screen.
//  A plan point that names its level (the route's ends, the
//  walker's position) is the plan viewer's own point shape, so
//  a host hands them over as they are and the plan draws the
//  ones on the floor it shows. Panorama yaws are the photo's
//  own frame — 0 the centre column, growing to the right —
//  which is the frame the engine authors, so they pass through
//  unchanged too.
//
//  Used by:
//    - every component in the package
// -----------------------------------------------------------

export interface KitLevel {
  id: string;
  // The display label as the host shows it ("2 aukštas"); the
  // switcher's pills and the preview's chips render it as is
  label: string;
  viewBox: [number, number, number, number];
  ordinal: number;
}

export type KitTurnDirection = 'straight' | 'slight-left' | 'slight-right' | 'left' | 'right' | 'u-turn';

export type KitInstruction =
  | { type: 'depart'; distanceM: number; towardsRoom?: string | null }
  | { type: 'continue'; distanceM: number; towardsRoom?: string | null }
  | { type: 'turn'; direction: KitTurnDirection; distanceM: number; towardsRoom?: string | null; landmark?: string | null }
  | { type: 'door'; distanceM: number; towardsRoom?: string | null }
  // toLevelLabel is the level's display label as is — the
  // catalog's floor() is for a host whose labels are bare numerals
  | { type: 'connector'; via: 'stairs' | 'elevator' | 'ramp'; toLevelLabel: string; direction: 'up' | 'down'; distanceM: number }
  | { type: 'arrive'; roomName?: string | null; side?: 'left' | 'right' | 'ahead' | null };

// One level's stretch of the route, in plan pixels
export interface KitRouteSegment {
  level: string;
  points: [number, number][];
}

export interface KitRouteSummary {
  distanceM: number;
  etaSeconds: number;
  levels: string[];
  steps: KitInstruction[];
  // Where the walker starts / ends, in plan pixels, each on its
  // own level — the plan takes them as they are
  start?: { level: string; x: number; y: number } | null;
  end?: { level: string; x: number; y: number } | null;
}

export interface KitNavigationState {
  stepIndex: number;
  stepCount: number;
  step: KitInstruction | null;
  currentLevel: string;
  nextLevel: string | null;
  remainingM: number;
  remainingSeconds: number;
  arrived: boolean;
  // The walker's current room / corridor for "You are in …"
  currentPlace?: string | null;
  // Plan-space position for the "you are here" dot, on its
  // level — the plan's youAreHere / focus take it as it is
  position?: { level: string; x: number; y: number } | null;
}

// A hotspot on the panorama: where it sits in the sphere (yaw
// in the photo's frame — 0 the centre column, growing right;
// pitch above the horizon) and what tapping it does
export interface KitHotspot {
  id: string;
  yaw: number;
  pitch?: number;
  kind: 'route' | 'link' | 'info';
  label?: string | null;
}
