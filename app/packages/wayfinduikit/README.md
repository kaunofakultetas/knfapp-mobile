# wayfinduikit

A reusable indoor-wayfinding UI kit for Expo / React Native — a pinch-zoom
floor plan with the route drawn on it, a route-aware floor switcher, the
route preview card and the turn-by-turn walking sheet, the you-are-here
bar, and a 360° panorama stage (a true sphere on GL, a flat strip without
it) with a direction marker that says which way the route goes. The kit
is presentational: it draws the shapes it is handed and calls back on
every intent; routing, instruction generation, the walker's position and
the sensors stay in the host's hooks — in this repo `@knf/wayfindengine`,
whose `Route`, `Instruction` and `NavigationState` are one small mapping
away from this kit's `Kit*` shapes (see *Pairing*).

The package is standalone: nothing in `src/` imports from the host (an
ESLint rule enforces it), and everything host-specific arrives through
one provider:

```tsx
import { WayfindUiKitProvider } from '@knf/wayfinduikit';

<WayfindUiKitProvider
  scheme="light"                            // or 'dark' — picks the base theme
  theme={{ colors: { brand: '#7B003F' } }}  // deep partial, merged over the scheme's base
  locale="lt"                               // 'lt' (default) or 'en' picks the label catalog
  labels={{ start: 'Pirmyn' }}              // partial, merged over the locale's defaults
  env={{ resolveImageUrl, now }}            // the two host functions
>
  …screens that render kit components…
</WayfindUiKitProvider>
```

Every field is optional and falls back to neutral defaults (the light
faculty-burgundy theme, Lithuanian labels, an identity URL resolver, the
real clock), so tests and demos need no ceremony. A wayfinding screen is
the pieces stacked, each fed display truth and answering with an intent:

```tsx
<YouAreHereBar place={nav.currentPlace} onScanQr={openScanner} onPickLocation={openPicker} />
<FloorPlan level={level} plan={<SvgXml xml={drawing} width="100%" height="100%" />}
           route={segmentForLevel}                       // the shown floor's stretch
           start={route.start} end={route.end}          // each point names its floor —
           youAreHere={nav.position} focus={nav.position} /> // the plan keeps the shown floor's
<FloorSwitcher levels={levels} current={level.id} enabled={route.levels} onSelect={showLevel} />
<PanoramaStage source={node.pano} targetYaw={nav.panoYawToNext}  // the engine's frame, unchanged
               orientation={gyroSample} />
{walking
  ? <RouteSheet state={nav} onNext={next} onBack={back} onDone={finish} onEnd={abort} />
  : <RoutePreview roomName={room.name} summary={route} levelLabels={labelOf} onStart={begin} />}
```

`example/ExampleWayfindScreen.tsx` renders the whole kit on one screen
with no host, no engine and no server — two hand-drawn floors, a route
climbing from 114 to 214 with its six steps written out, the preview
turning into the walking sheet, the plan and the stage following the
walker upstairs to the arrival card — and is the wiring a host copies. It
uses the flat stage on purpose, so it runs without the GL peers, and it
prices nothing: its distance and ETA figures are authored data standing
in for an engine's answers.

## Layout

`src/` is split by purpose, so a reader (and a future fork) finds a
piece by what it does:

| Folder | What lives there |
| --- | --- |
| `core/` | Pure logic, no rendering: `types.ts` (the view vocabulary — `KitLevel`, `KitInstruction`, `KitRouteSegment`, `KitRouteSummary`, `KitNavigationState`, `KitHotspot`), `format.ts` (`formatDistance`, `formatEta`, `instructionText`) |
| `provider/` | The host seam: `WayfindUiKitProvider` + the `useKit*` hooks (`index.tsx`), `theme.ts`, `labels.ts` |
| `plan/` | `FloorPlan` — the pinch-zoom viewport with the kit's overlay (route, pins, dot, rooms, nodes) over the host's drawing, plus the pure `routePath` / `clampScale` / `clampTranslation` / `onShownLevel` (module-level). An editing host also gets `selectedNodeId` (drawn in the brand ink), `onPressPlan` (a bare tap on the drawing, in plan pixels through the camera — a gesture that ever held two fingers is never a tap) and `onDragNode` / `onDragNodeEnd` (a drag that begins on the selected node — its grab zone follows the zoom, matching the drawn disc — moves it instead of the camera and ALWAYS closes through `onDragNodeEnd`, even torn off by a second finger, a terminate or a level switch; every other node still pans); `FloorSwitcher` — the floor pills |
| `route/` | `RoutePreview` (the card before walking), `RouteSheet` (the walking face and the arrival card), `InstructionLine` (one step, one row, plus the pure `stepGlyph`), `YouAreHereBar` |
| `pano/` | `PanoramaStage` (the sphere, GL peers required at render time only), `FlatPanorama` (the strip, no GL; also the module-level `panoSourceKey`), `DirectionMarker`, and `projection.ts` — the pure maths both stages share (`projectToScreen`, `shortestArcDeg`, `clampToEdge`, `flatViewYaw`, `flatMarkerX`) |
| `capture/` | `CaptureHud` — the pure guided-capture overlay an admin's capture screen lays over its camera preview: the pose is the camera (`projectToScreen` at the frame's fov), pending targets are dots hidden once behind the lens or off the viewport, the current target is a ring (pinned at the edge with a lean arrow when off-view) that fills success-coloured only when the session says `aligned && stable`, plus a fixed centre reticle, the shot counter and the roll hint past ±8°; no camera, no sensors — the capture session owns the aim/shoot rule |

`index.ts` is the public surface, pinned by `src/__tests__/surface.test.ts`;
an ESLint rule keeps every file inside the package.

## What a host gets

| Area | Kit |
| --- | --- |
| Plan viewer rules | the host's drawing and the kit's overlay travel in **one transformed layer**, so a finger moves both; the level's `viewBox` **is** the coordinate system (route points and room polygons need no conversion, the host never learns the screen size); the drawing is fit to the viewport's width at scale 1 and the viewport takes the plan's aspect unless styled otherwise; the camera is three numbers in a ref mirrored into animated values — a gesture writes them directly, **no render per frame** over a plan full of paths; one finger pans, two fingers pinch **about their midpoint** (the plan point under the fingers stays under them) and pan with it, and a change of finger count re-bases so lifting one finger of a pinch carries on as a pan without a jump; scale clamped to `minScale`–`maxScale` (1–4 by default), translation clamped so the drawing **never leaves the viewport**; taps belong to the shapes (the viewport claims a move only past a 6 px slop, or the moment a second finger lands); `focus` glides a plan point to the middle at no less than 2×, a finger landing mid-flight stops it where it is; the glide runs once the viewport is first measured and again when `focus` or the level changes — a later resize (a rotation, a sheet resizing the plan) **never replays it**, it only re-clamps the camera where it stands; a new level starts at rest **and drops any gesture in progress**, so a finger still down re-bases from rest on its next move and the old floor's zoom never lands on the new drawing |
| The overlay | bottom to top: room polygons (a faint brand wash, tappable, named), the route as a **glow under a line**, corridor nodes with a hit disc well beyond the visible dot, the start ring, the destination **pin**, the walker's dot (brand disc in a white ring over a soft halo); marker weights are given in screen pixels and turned into plan units, so a drawing of any resolution shows the same weight of line; a segment from **another level draws nothing**, and the points carry their floor too — `start`, `end`, `youAreHere` and `focus` are `{ x, y, level? }`, a point naming another level is **neither drawn nor glided to** (a focus on another floor does not zoom) and one naming no level is taken as on the shown floor — so the host hands the plan whatever it holds, the walker's position and the route's ends included |
| Floor switcher | pills stacked top floor first (ordinal descending, whatever order the host keeps), the shown floor in the brand; `enabled` — the levels the route touches — dims and **inerts every other pill**, and with no list every floor is open; a tap only **asks**, the host answers by changing `current`; tabs to a screen reader, the group announcing which floor is showing |
| Route preview | one line, **ETA first** (a walker asks "how long" before "how far"); the floors crossed as chips **in walking order** (1 → 2 → 1 shows three); the avoid-stairs switch only when `onToggleAccessible` is wired, reporting the **next** value — the host answers with a new summary; the steps folded behind one link, the fold closing when the **destination** changes (keyed on the room name, not the summary object); Start; an optional close named *Back*; the host's image slot wrapped as one labelled image |
| Route sheet | **one step at a time**, big enough to read mid-stride; the counter from one; what is left as metres then ETA; Back locked at the first step, Next stays Next to the end — **arrival is the host's verdict** (`state.arrived`), not the last index; arrived, the sheet becomes the arrival card (the room off the final step, its side when known, Done); *End route* only when wired; "You are in …" when the host knows; the reassurance line only when handed metres for the stretch; the step is a polite live region |
| Instruction line | one glyph family for every step (a walker, the arrows, the stairs and elevator either way, the step-free ramp, the door, the flag); the sentence from `instructionText`; a turn's landmark under it exactly as the host names it; the walk to the next step in the margin **except** where the sentence already says it (a continue, and a `turn` with `direction: 'straight'`, which the formatter words as a continue) or nothing is walked (arrive); the row is one accessibility element whose label **is** the sentence |
| You-are-here bar | the place when known, the plain "you are here" when the host only has a dot; scan and pick buttons **only when wired**; off route is a second line in the danger ink **under** the place, never instead of it — the position is still a fact, the route is what was lost |
| The two stages | **`PanoramaStage`** wraps the photo around the inside of a sphere seen through a pinhole camera on a GL surface — straight lines stay straight, the ceiling is overhead, the seam is nowhere; the three GL peers are **optional and required at render time, never at import time**; `renderer` is `'auto'` (try the sphere, fall back to the flat stage when the context, the texture or the render fails — remembered per photo, the next one tries again), `'sphere'` (insist; a crash reaches the host's boundary) or `'flat'` (never touch GL). **`FlatPanorama`** is the photo five times in a horizontal strip, panning forever and teleporting back by whole tiles only once a gesture has ended; the tile is the photo's aspect at the stage height (2:1 until measured). The sphere is what a device with the peers gets; the flat stage is the web, a host without the peers, a failed surface, or a host that asks for it (the example). **Yaw is the photo's own frame on both stages: 0 is the photo's centre column, growing to the right, the edges ±180** — the frame the engine authors `panoYawToNext` in, so it passes through as `targetYaw` unchanged; hotspot yaws, `initialYaw` and the yaw report are all in it. Both take `geometry` — what the photo covers: horizontal and vertical degrees, the centre column's yaw, the centre row's pitch (`KitPanoGeometry`, the engine's `panoGeometry` twin); absent, the coverage is read off the photo (2:1 is the whole sphere, a phone sweep at 3.4:1 a full turn with a ~106° vertical band), the sphere is wrapped on exactly that band and the view is held inside it (a partial turn stops where the photo ends, a coverage narrower than the view locks on its centre), while the strip draws one tile that never teleports. Both share props — `source`, `targetYaw`, `targetLabel`, `hotspots`, `onYawChange`, `onPressHotspot`, `showHint`, `height` and `initialYaw` (where the view faces on mount, **on the strip as on the sphere**, 0 by default; later changes are ignored, once mounted the view is the walker's, and the first yaw report is that value) — while `orientation`, `fovDeg` and `renderer` are the sphere stage's own; they share the projection maths, the hotspot rules (hidden once off the viewport — a pinned hotspot invites a tap on nothing), the fading hint pill, and the yaw report: **whole degrees, once moved 3° the short way round**, so a host keeping the heading in state re-renders a handful of times per pan. A photo is told from the next by its **key** — the uri string, the asset number, or the `uri` inside a `{ uri }` object — never by object identity, so `source={{ uri }}` written inline is not a new photo on every render; only a new key re-seeds the strip, drops the measured aspect, restarts the hint, reloads the texture, and counts as the next photo for the `'auto'` failure memory. A measured tile aspect or a stage laid out at a new width re-lays the strip **under the yaw the view already had** (no jump, no report). A drag turns the sphere at `fov / width` degrees per pixel with a short inertia; `orientation` (the device's alpha/beta/gamma) drives it with the **first sample recording an offset** so switching the gyro on never jumps the picture, and a drag under gyro control shifts the offset instead of fighting the sensor; a GL context handed over after the stage has gone is released on the spot and starts no frame loop |
| The marker contract | `DirectionMarker` takes a **signed offset** (`deltaDeg`, positive to the right), an optional caption and `clamped`; it knows nothing about **where** it sits — the stage computes the anchor through the projection and wraps it in a positioned view. The chevron leans by the offset while it is small and pins at **±60°** once the target is off to a side or behind, so it never points at the floor; inside **12°** the disc turns success green and the chevron stands straight; `clamped` drops the halo so a badge pinned at an edge reads as a pointer, an anchored one as a pin; a target exactly behind the camera has no side of its own and takes the **left** on both stages (a half-turn is read as -180: pinned at the left inset, chevron -60°, "Route 180° to the left"); pointer events pass through so it never eats the pan; `targetYaw` null (arrived) draws no marker at all |
| Accessibility | every part carries a `wayfinduikit-*` testID; on the plan the **host's drawing** (`wayfinduikit-plan-drawing`, there once the viewport is measured) is the one image element, named per level and renamed to "route on the floor plan" while a route is drawn — the viewport (`wayfinduikit-plan`) carries no role or label of its own, so the overlay's rooms and nodes (named label, else id), the route group and the walker's dot stay **reachable as their own elements** instead of being swallowed into it; pills are tabs, one selected; the instruction row speaks its sentence and nothing else; the bar's text column is one element (the place, then the off-route notice), its buttons their own stops; the stages are named after the target ("360° view, heading towards 114"), the marker reads the aligned string or the offset as a side ("Route 42° to the right"), never a signed number |
| Theming | 20 colour tokens, 3 font slots, 3 radii; light and dark bases with `resolveTheme` deep-merging a host partial — overriding one colour never costs the rest, and an entry whose value is an explicit `undefined` at any depth (`scheme`, `colors`, or a token inside `colors` / `fonts` / `radii`) is **ignored**, so a palette built from optional config keeps the base token, the same rule `labels` and `env` follow; the route defaults to the brand **by convention, not binding**, so a host may colour it alone; the plan paper sits a shade above the dark card so walls read on both; the stage is **near-black in both schemes** — a photo sphere sits on black whatever the app around it does |
| Labels — LT first | every string flows through the catalog (66 keys, both catalogs pinned to the same key list and shapes); **count-taking keys are functions** because Lithuanian declines the noun three ways (1 minutė / 2 minutės / 10 minučių — teens take the third form); **name-taking keys never decline the host's string** — every such sentence is shaped for the nominative ("Atvykote: 114", "114 yra kairėje", "Lipkite laiptais aukštyn – 2 aukštas"); kilometres take the locale's decimal separator (1,2 km); `defaultLabels` ships `lt` and `en`, a partial merges over the chosen locale |
| Formatters | `formatDistance` reads like a sign — exact under 10 m, the nearest 5 m up to a kilometre, one decimal of kilometres from there (the route sheet rounds its own metre lines by the same rungs); `formatEta` is a phrase under a minute and **ceiled** minutes from there (an ETA may run early, never late); `instructionText` is one step, one sentence — a U-turn stays bare, a straight turn is a continue, arrival names the side only with a room; all three take the catalog as an argument, so they run outside React too |
| Hardening | non-finite or negative metres read as 0, never NaN in the UI; a scale that is not a number answers the minimum; a non-finite marker offset reads as aligned; a degenerate viewBox or an unmeasured viewport draws nothing; the fov is pulled inside (0, 180) before it becomes a focal length; textures wider than 4096 px are still handed to the renderer with a one-time development warning, and a rejection is the flat fallback's cue |

## Tests

`npm test` in this folder runs `src/**/__tests__/` plus the example's
own spec (jest-expo + the package's babel config, `TZ=UTC` pinned)
without the host app: the formatters and the projection maths, the
provider merge rules and LT/EN catalog parity, the plan driven through
its responder with hand-built touch histories (pinch about the fingers,
edge clamps, focus), the four route faces against the Lithuanian
catalog, the flat stage (marker, hotspots, yaw report, seam teleport,
measured aspect), the sphere stage with stand-in GL peers (context,
texture, drag and sensor through the projection, every fallback, the
release on unmount), the public surface, and the example screen proven
live. `__tests__` is excluded from the published `files`.

## What the host must supply

- **The drawing per level**, through `FloorPlan`'s `plan` slot: anything
  that fills its box (an SVG string rendered at `width="100%"
  height="100%"`, a raster stretched to the same, an inline `<Svg>` as
  the example). The kit sizes the box from `level.viewBox` and never
  loads a reference itself — the engine's `Level.plan` is a name the
  host resolves and bundles.
- **The engine's route and navigation, mapped 1:1** — one small function
  per shape, because the engine hands over ids and the kit reads display
  truth:
  - `Level` → `KitLevel`: as is (extra fields are fine). The engine's
    `label` is already the display label ("2 aukštas"); the switcher's
    pills and the preview's chips (`levelLabels={(id) =>
    index.levels.get(id)?.label ?? id}`) render it as is.
  - `route.floors[i]` → `KitRouteSegment`: as is; hand the plan the one
    for the shown level (a segment from another level draws nothing).
  - `Route` → `KitRouteSummary`: `distanceM`, `etaSeconds`, `levels` as
    is; `steps` mapped; `start` / `end` from the first and last of
    `route.points`, level included — they are the plan's own point
    shape, so `start` / `end` go to `FloorPlan` unfiltered and the plan
    keeps the ones on the shown floor.
  - `Instruction` → `KitInstruction`: `towardsRoomId` → `towardsRoom`
    (the room's display name), `roomId` → `roomName`, `toLevel` →
    `toLevelLabel` as the level's label as is
    (`index.levels.get(step.toLevel)?.label ?? step.toLevel`) —
    `labels.floor()` wraps a **bare numeral** only, so over an engine
    label it would read "2 aukštas aukštas"; type, direction, via,
    side, landmark and `distanceM` carry over.
  - `NavigationState` → `KitNavigationState`: `stepIndex`, `step`
    (mapped), `currentLevel`, `nextLevel`, `remainingM`,
    `remainingSeconds`, `arrived` as is; `stepCount` is
    `route.steps.length`; `currentPlace` from `currentRoomId`;
    `position` from `route.points[state.index]` with its level, handed
    to the plan's `youAreHere` and `focus` as it is; `panoYawToNext` is
    the stage's `targetYaw` **unchanged** — both are the photo's frame,
    0 at the centre column growing right — and the node's panorama
    reference its `source`.
  - Intents back: Start begins the walk; Next / Back are `nav.next()` /
    `nav.back()`; Done and End reset; the bar's scan is `parseAnchor` +
    `nav.snapTo`; a floor tap changes the shown level; a hotspot tap
    is the host's.
- **Orientation from the host's sensors**: the sphere stage's
  `orientation` prop takes the device's alpha/beta/gamma triple from
  whatever sensor package the host uses — the kit subscribes to nothing;
  `null` switches the gyro off, and the first sample after it re-bases.
- **`env`** on the provider: `resolveImageUrl` (a stored plan raster,
  panorama or room photo → a loadable URL) and `now` (the clock behind
  anything time-bound — inject a frozen one in tests).
- **Callbacks** per intent: floor taps, room and node taps on the plan,
  Start / Next / Back / Done / End, the avoid-stairs switch, scan and
  pick, hotspot taps, the yaw report.
- **Theme and labels**: a deep theme partial mapping the host palette
  and fonts, and a label catalog (or a few overridden keys).
- **Everything that navigates**: the search screen, QR scanning, the
  location picker, re-routing when the host raises `offRoute`, the
  route recomputation behind the avoid-stairs switch. The kit hands
  back intents; the host decides where they lead.

Resolution: the app aliases `@knf/wayfinduikit` to
`packages/wayfinduikit/src` in `tsconfig.json` (paths) and
`babel.config.js` (module-resolver), which covers Metro, tsc and jest
alike; `package.json` carries the peer dependencies — `expo-image`
among the required ones, since the flat stage imports it at module
load; the three GL ones optional — for the day it is published or
moved to a workspace.

## Pairing with @knf/wayfindengine

The kit and the engine are independent packages that meet only in the
host — neither imports the other:

- **`@knf/wayfindengine`** is the headless half: one building as a
  graph of levels, rooms, nodes and typed edges; A* routing costed in
  walking seconds with accessibility modes (`useRoute` → `Route`, its
  `steps` already built with landmarks and collapsed stairwells); a
  navigation cursor a screen walks with taps, a pedometer or a scanned
  code (`useNavigation` → `NavigationState`, with the metres left, the
  next level and the yaw inside the current node's panorama); QR
  anchors and a diacritic-folded room search.
- **This kit** draws exactly those answers: the route's floor segments
  on the plan, the steps in the preview and the sheet, the navigation
  state as the walking face, `panoYawToNext` as the marker on the
  stage — passed through as `targetYaw` unchanged, because both
  packages measure a panorama yaw from the photo's centre column,
  growing to the right.

Because the two vocabularies differ only in ids versus names, the host's
glue is the mapping listed above and prop-plumbing: engine answers into
the components, kit intents into engine actions.
`example/ExampleWayfindScreen.tsx` shows the same loop with a
hand-written step list and a `useState` cursor standing in for the
engine.
