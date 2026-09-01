// -----------------------------------------------------------
//  [*] Tests — @knf/wayfinduikit public surface
//
//  The runtime exports, pinned. Adding is deliberate; removing
//  or renaming is a breaking change for every host. Type-only
//  exports (KitLevel, KitInstruction, KitNavigationState,
//  KitTheme, KitLabels…) are erased at runtime and do not
//  appear here; the LT/EN label parity is pinned by the
//  provider's own tests.
// -----------------------------------------------------------

import * as kit from '..';

describe('@knf/wayfinduikit surface', () => {
  it('exports exactly these runtime members', () => {
    expect(Object.keys(kit).sort()).toEqual(
      [
        'DirectionMarker', 'FlatPanorama', 'FloorPlan', 'FloorSwitcher', 'InstructionLine', 'PanoramaStage', 'RoutePreview', 'RouteSheet',
        'WayfindUiKitProvider', 'YouAreHereBar',
        'clampToEdge', 'darkTheme', 'defaultLabels', 'defaultTheme', 'flatMarkerX',
        'resolvePanoGeometry',
        'viewLimits',
        'limitYaw',
        'limitPitch', 'formatDistance', 'formatEta', 'instructionText',
        'projectToScreen', 'resolveTheme', 'shortestArcDeg',
        'useKitEnv', 'useKitLabels', 'useKitTheme',
      ].sort(),
    );
  });
});
