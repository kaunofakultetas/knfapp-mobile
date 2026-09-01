// -----------------------------------------------------------
//  [*] wayfinduikit — labels
//
//  Every string the kit shows, as one object the host supplies
//  through WayfindUiKitProvider (a partial is merged over the
//  locale's defaults, so a host overrides three strings, not
//  sixty). Count-taking keys are functions because Lithuanian
//  declines the noun three ways (1 minutė / 2 minutės /
//  10 minučių) — a template with a bare number cannot be
//  localised after the fact. Keys that take a NAME (a room,
//  a level label, a place) never decline it: Lithuanian would
//  want a case ending the kit cannot derive from a host
//  string, so every such sentence is shaped for the nominative
//  — the name sits after a colon or a dash, or is the
//  sentence's subject ("114 yra kairėje"). defaultLabels ships
//  Lithuanian first and English second; the kit is usable with
//  no catalog at all.
//
//  Distances arrive as whole metres already rounded by the
//  caller — core/format.ts for meters and continueFor, the
//  route sheet's own rounder (the same rungs) for remaining
//  and reassurance; kilometres arrive as a number with one
//  decimal, and the catalog picks the decimal separator (LT
//  writes 1,2 km).
//
//  Used by:
//    - provider/index.tsx — merges the host's partial and
//      serves the result through useKitLabels
//    - core/format.ts — formatDistance, formatEta and
//      instructionText take the catalog as an argument
//    - every component in the package, via useKitLabels
// -----------------------------------------------------------



export interface KitLabels {
  // The search face: the screen title, the prompt, the field
  title: string;
  whereTo: string;
  whereToHint: string;
  searchPlaceholder: string;
  clearSearch: string;
  noResults: string;
  allRooms: (count: number) => string;
  searchResults: (count: number) => string;
  // A level's display label wrapped as a floor name
  floor: (label: string) => string;

  // One instruction, one sentence — core/format.ts picks the
  // key from the step's type. Turns come bare or wrapped by
  // turnTowards; connectors carry the destination level label
  depart: (towards?: string | null) => string;
  continueFor: (metres: number) => string;
  turnLeft: string;
  turnRight: string;
  slightLeft: string;
  slightRight: string;
  uTurn: string;
  turnTowards: (turn: string, room: string) => string;
  throughDoor: string;
  takeStairsUp: (level: string) => string;
  takeStairsDown: (level: string) => string;
  takeElevatorUp: (level: string) => string;
  takeElevatorDown: (level: string) => string;
  takeRamp: (level: string) => string;
  arrive: (room?: string | null) => string;
  arriveSide: (room: string, side: 'left' | 'right' | 'ahead') => string;

  // Where the walker is, and how they tell the kit
  youAreIn: (place: string) => string;
  youAreHere: string;
  scanQr: string;
  pickLocation: string;

  // Buttons on the sheets
  start: string;
  next: string;
  back: string;
  done: string;
  endRoute: string;

  // Progress and measures; metres are whole, kilometres carry
  // one decimal
  stepOf: (current: number, total: number) => string;
  remaining: (metres: number) => string;
  minutes: (count: number) => string;
  lessThanMinute: string;
  meters: (metres: number) => string;
  kilometers: (km: number) => string;

  // The floor switcher
  floorSwitcherA11y: (label: string) => string;
  floorA11y: (label: string, current: boolean) => string;

  // Route options and the preview card
  avoidStairs: string;
  shortestRoute: string;
  accessibleRoute: string;
  routeTo: (room: string) => string;
  stepsShow: string;
  stepsHide: string;

  // The panorama stage and its direction marker; the marker's
  // degrees are signed, positive to the right of centre
  stageHint360: string;
  stageA11y: (target?: string | null) => string;
  markerA11y: (degrees: number) => string;
  markerAligned: string;

  // Quick destinations
  nearestWc: string;
  nearestExit: string;

  // Walking: the nudge on a long stretch, and losing the route
  reassurance: (metres: number) => string;
  offRoute: string;
  rerouting: string;

  // The plan viewer
  zoomIn: string;
  zoomOut: string;

  // Accessibility names for parts whose visible face is not text
  planA11y: (level: string) => string;
  routeOnPlanA11y: (level: string) => string;
  youAreHereA11y: (place?: string | null) => string;
  previewImageA11y: (room: string) => string;
}







// -----------------------------------------------------------
// Lithuanian plural
// -----------------------------------------------------------
//
// 1 / 2–9 (and not x1) / the rest — teens take the 'other'
// form even when their last digit says otherwise (11 minučių,
// not 11 minutė), and x1 past the teens returns to 'one'
// (21 minutė).
//
// Used by:
//   - defaultLabels.lt — every count-taking key
// -----------------------------------------------------------

const ltPlural = (count: number, one: string, few: string, other: string): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 9 && !(mod100 >= 11 && mod100 <= 19)) return few;
  return other;
};


// The direction marker's offset as a screen reader should hear
// it: whatever rounds to zero is 'ahead', the sign picks the
// side; a non-finite offset reads as ahead rather than 'NaN°'
const markerOffset = (degrees: number): { whole: number; side: 'ahead' | 'left' | 'right' } => {
  const whole = Number.isFinite(degrees) ? Math.round(Math.abs(degrees)) : 0;
  if (whole === 0) return { whole, side: 'ahead' };
  return { whole, side: degrees > 0 ? 'right' : 'left' };
};







// -----------------------------------------------------------
// defaultLabels
// -----------------------------------------------------------
//
// Used by:
//   - provider/index.tsx — the locale picks the base set; the
//     provider-less fallback is Lithuanian, matching the
//     provider's default locale
//   - core/format.ts tests — the catalog under test
// -----------------------------------------------------------

export const defaultLabels: { lt: KitLabels; en: KitLabels } = {
  lt: {
    title: 'Navigacija',
    whereTo: 'Kur einate?',
    whereToHint: 'Įveskite auditorijos numerį arba pavadinimą',
    searchPlaceholder: 'Ieškoti auditorijos…',
    clearSearch: 'Išvalyti paiešką',
    noResults: 'Nieko nerasta',
    allRooms: (count) => `Visos patalpos (${count})`,
    searchResults: (count) =>
      ltPlural(count, `Rastas ${count} rezultatas`, `Rasti ${count} rezultatai`, `Rasta ${count} rezultatų`),
    floor: (label) => `${label} aukštas`,

    depart: (towards) => (towards ? `Pradėkite eiti, kryptis – ${towards}` : 'Pradėkite eiti'),
    continueFor: (metres) => `Eikite tiesiai ${metres} m`,
    turnLeft: 'Sukite kairėn',
    turnRight: 'Sukite dešinėn',
    slightLeft: 'Sukite šiek tiek kairėn',
    slightRight: 'Sukite šiek tiek dešinėn',
    uTurn: 'Apsisukite',
    turnTowards: (turn, room) => `${turn}, kryptis – ${room}`,
    throughDoor: 'Eikite pro duris',
    takeStairsUp: (level) => `Lipkite laiptais aukštyn – ${level}`,
    takeStairsDown: (level) => `Lipkite laiptais žemyn – ${level}`,
    takeElevatorUp: (level) => `Kilkite liftu aukštyn – ${level}`,
    takeElevatorDown: (level) => `Leiskitės liftu žemyn – ${level}`,
    takeRamp: (level) => `Eikite pandusu – ${level}`,
    arrive: (room) => (room ? `Atvykote: ${room}` : 'Atvykote į tikslą'),
    arriveSide: (room, side) =>
      side === 'left' ? `${room} yra kairėje` : side === 'right' ? `${room} yra dešinėje` : `${room} yra tiesiai priešais`,

    youAreIn: (place) => `Esate: ${place}`,
    youAreHere: 'Jūs esate čia',
    scanQr: 'Nuskaityti QR kodą',
    pickLocation: 'Pasirinkti vietą',

    start: 'Pradėti',
    next: 'Toliau',
    back: 'Atgal',
    done: 'Atlikta',
    endRoute: 'Baigti maršrutą',

    stepOf: (current, total) => `Žingsnis ${current} iš ${total}`,
    remaining: (metres) => `Liko ${metres} m`,
    minutes: (count) => ltPlural(count, `${count} minutė`, `${count} minutės`, `${count} minučių`),
    lessThanMinute: 'Mažiau nei minutė',
    meters: (metres) => `${metres} m`,
    kilometers: (km) => `${km.toFixed(1).replace('.', ',')} km`,

    floorSwitcherA11y: (label) => `Aukštų pasirinkimas, rodomas ${label}`,
    floorA11y: (label, current) => (current ? `${label}, pasirinktas` : label),

    avoidStairs: 'Vengti laiptų',
    shortestRoute: 'Trumpiausias maršrutas',
    accessibleRoute: 'Pritaikytas maršrutas',
    routeTo: (room) => `Maršrutas: ${room}`,
    stepsShow: 'Rodyti žingsnius',
    stepsHide: 'Slėpti žingsnius',

    stageHint360: 'Braukite, kad apsižvalgytumėte',
    stageA11y: (target) => (target ? `360° vaizdas, kryptis – ${target}` : '360° vaizdas'),
    markerA11y: (degrees) => {
      const { whole, side } = markerOffset(degrees);
      if (side === 'ahead') return 'Maršrutas tiesiai priešais';
      return side === 'right' ? `Maršrutas ${whole}° dešiniau` : `Maršrutas ${whole}° kairiau`;
    },
    markerAligned: 'Žiūrite maršruto kryptimi',

    nearestWc: 'Artimiausias tualetas',
    nearestExit: 'Artimiausias išėjimas',

    reassurance: (metres) => `Eikite toliau – dar ${metres} m`,
    offRoute: 'Nukrypote nuo maršruto',
    rerouting: 'Perskaičiuojamas maršrutas…',

    zoomIn: 'Priartinti',
    zoomOut: 'Nutolinti',

    planA11y: (level) => `Aukšto planas: ${level}`,
    routeOnPlanA11y: (level) => `Maršrutas aukšto plane: ${level}`,
    youAreHereA11y: (place) => (place ? `Jūs esate čia: ${place}` : 'Jūs esate čia'),
    previewImageA11y: (room) => `Patalpos nuotrauka: ${room}`,
  },

  en: {
    title: 'Navigation',
    whereTo: 'Where to?',
    whereToHint: 'Enter a room number or name',
    searchPlaceholder: 'Search rooms…',
    clearSearch: 'Clear search',
    noResults: 'No results',
    allRooms: (count) => `All rooms (${count})`,
    searchResults: (count) => (count === 1 ? '1 result' : `${count} results`),
    floor: (label) => `Floor ${label}`,

    depart: (towards) => (towards ? `Head towards ${towards}` : 'Start walking'),
    continueFor: (metres) => `Continue straight for ${metres} m`,
    turnLeft: 'Turn left',
    turnRight: 'Turn right',
    slightLeft: 'Bear left',
    slightRight: 'Bear right',
    uTurn: 'Make a U-turn',
    turnTowards: (turn, room) => `${turn} towards ${room}`,
    throughDoor: 'Go through the door',
    takeStairsUp: (level) => `Take the stairs up to ${level}`,
    takeStairsDown: (level) => `Take the stairs down to ${level}`,
    takeElevatorUp: (level) => `Take the elevator up to ${level}`,
    takeElevatorDown: (level) => `Take the elevator down to ${level}`,
    takeRamp: (level) => `Take the ramp to ${level}`,
    arrive: (room) => (room ? `You have arrived at ${room}` : 'You have arrived'),
    arriveSide: (room, side) =>
      side === 'left' ? `${room} is on your left` : side === 'right' ? `${room} is on your right` : `${room} is straight ahead`,

    youAreIn: (place) => `You are in ${place}`,
    youAreHere: 'You are here',
    scanQr: 'Scan QR code',
    pickLocation: 'Pick a location',

    start: 'Start',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    endRoute: 'End route',

    stepOf: (current, total) => `Step ${current} of ${total}`,
    remaining: (metres) => `${metres} m left`,
    minutes: (count) => (count === 1 ? '1 minute' : `${count} minutes`),
    lessThanMinute: 'Less than a minute',
    meters: (metres) => `${metres} m`,
    kilometers: (km) => `${km.toFixed(1)} km`,

    floorSwitcherA11y: (label) => `Floor switcher, showing ${label}`,
    floorA11y: (label, current) => (current ? `${label}, selected` : label),

    avoidStairs: 'Avoid stairs',
    shortestRoute: 'Shortest route',
    accessibleRoute: 'Accessible route',
    routeTo: (room) => `Route to ${room}`,
    stepsShow: 'Show steps',
    stepsHide: 'Hide steps',

    stageHint360: 'Drag to look around',
    stageA11y: (target) => (target ? `360° view, heading towards ${target}` : '360° view'),
    markerA11y: (degrees) => {
      const { whole, side } = markerOffset(degrees);
      if (side === 'ahead') return 'Route straight ahead';
      return side === 'right' ? `Route ${whole}° to the right` : `Route ${whole}° to the left`;
    },
    markerAligned: 'Facing the route',

    nearestWc: 'Nearest toilet',
    nearestExit: 'Nearest exit',

    reassurance: (metres) => `Keep going – ${metres} m more`,
    offRoute: 'Off route',
    rerouting: 'Rerouting…',

    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',

    planA11y: (level) => `Floor plan: ${level}`,
    routeOnPlanA11y: (level) => `Route on the floor plan: ${level}`,
    youAreHereA11y: (place) => (place ? `You are here: ${place}` : 'You are here'),
    previewImageA11y: (room) => `Photo of ${room}`,
  },
};
