// -----------------------------------------------------------
//  [*] wayfinduikit — formatters
//
//  The pure helpers every route surface shares: a distance
//  the way a walker reads it, an ETA in whole minutes, and one
//  instruction turned into one sentence. All three take the
//  label catalog as an argument instead of reading the
//  provider — they run outside React too (a host's
//  notification text, a test's expected string) and they
//  never pick a locale themselves.
//
//  Split into:
//
//    roundMetres     — the sign-style rounding both share
//    formatDistance  — metres or one-decimal kilometres
//    formatEta       — a phrase under a minute, ceiled minutes
//    turnLabel       — the bare phrase per turn direction
//    instructionText — one step, one sentence
//
//  Used by:
//    - route/InstructionLine.tsx — the step's sentence and the
//      margin distance
//    - route/RoutePreview.tsx — the summary line (ETA, then
//      the route's length)
//    - route/RouteSheet.tsx — the ETA only; its metre lines go
//      straight to the catalog through the sheet's own rounder
//    - src/index.ts — the public surface
// -----------------------------------------------------------

import type { KitLabels } from '../provider/labels';
import type { KitInstruction, KitTurnDirection } from './types';


// Whole metres the way a sign would print them: exact under
// 10 m (a walker CAN tell 3 m from 7 m), to the nearest 5 m
// from there (nobody paces 47 m; 45 reads calmer and is just
// as true). Non-finite and negative input reads as 0 — a
// defensive face, never NaN in the UI
const roundMetres = (metres: number): number => {
  const safe = Number.isFinite(metres) && metres > 0 ? metres : 0;
  if (safe < 10) return Math.round(safe);
  return Math.round(safe / 5) * 5;
};







// -----------------------------------------------------------
// formatDistance
// -----------------------------------------------------------
//
// The rung is picked on the INPUT: under 10 m exact, under
// 1000 m to the nearest 5 (so 998 reads '1000 m', not a
// kilometre), from 1000 m one decimal of kilometres. The
// catalog owns the unit and the decimal separator.
//
// Used by:
//   - route/InstructionLine.tsx — the walk to the next step,
//     in the margin
//   - route/RoutePreview.tsx — the route's length in the
//     summary line
// -----------------------------------------------------------

export function formatDistance(metres: number, labels: KitLabels): string {

  const safe = Number.isFinite(metres) && metres > 0 ? metres : 0;
  if (safe < 1000) return labels.meters(roundMetres(safe));


  // round(m / 100) / 10 keeps exactly one decimal as a number;
  // the catalog's toFixed(1) restores a trailing .0
  return labels.kilometers(Math.round(safe / 100) / 10);
}







// -----------------------------------------------------------
// formatEta
// -----------------------------------------------------------
//
// Under a minute is a phrase, not a number; from 60 s the
// minutes are CEILED — an ETA may run early, never late
// (61 s is '2 minutes'). Junk input reads as the phrase.
//
// Used by:
//   - route/RouteSheet.tsx, route/RoutePreview.tsx — the ETA
// -----------------------------------------------------------

export function formatEta(seconds: number, labels: KitLabels): string {

  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  if (safe < 60) return labels.lessThanMinute;


  return labels.minutes(Math.ceil(safe / 60));
}







// -----------------------------------------------------------
// turnLabel
// -----------------------------------------------------------
//
// The bare turn phrase per direction. 'straight' is excluded
// by type — instructionText reads it as a continue before it
// could get here.
//
// Used by:
//   - instructionText (below)
// -----------------------------------------------------------

function turnLabel(direction: Exclude<KitTurnDirection, 'straight'>, labels: KitLabels): string {
  switch (direction) {
    case 'left':
      return labels.turnLeft;
    case 'right':
      return labels.turnRight;
    case 'slight-left':
      return labels.slightLeft;
    case 'slight-right':
      return labels.slightRight;
    case 'u-turn':
      return labels.uTurn;
  }
}







// -----------------------------------------------------------
// instructionText
// -----------------------------------------------------------
//
// One step, one sentence. A turn is wrapped by turnTowards
// when the step names a room — except a U-turn, which reads
// bare (turning around 'towards' something is nonsense) — and
// a 'straight' turn is just a continue. A connector picks its
// key from via + direction (a ramp has no up/down wording).
// Arrival names the side only when it also knows the room —
// '… is on your left' with nothing before it is not a
// sentence — and falls back to the plain arrival otherwise.
// The turn's landmark has no key in the catalog and is left
// to the components.
//
// Used by:
//   - route/InstructionLine.tsx — every rendered step; the
//     preview's list and the sheet's current step reach it
//     through that row
// -----------------------------------------------------------

export function instructionText(step: KitInstruction, labels: KitLabels): string {
  switch (step.type) {
    case 'depart':
      return labels.depart(step.towardsRoom ?? null);

    case 'continue':
      return labels.continueFor(roundMetres(step.distanceM));

    case 'turn': {
      if (step.direction === 'straight') return labels.continueFor(roundMetres(step.distanceM));
      const turn = turnLabel(step.direction, labels);
      if (step.direction === 'u-turn' || !step.towardsRoom) return turn;
      return labels.turnTowards(turn, step.towardsRoom);
    }

    case 'door':
      return labels.throughDoor;

    case 'connector':
      if (step.via === 'ramp') return labels.takeRamp(step.toLevelLabel);
      if (step.via === 'elevator') {
        return step.direction === 'up' ? labels.takeElevatorUp(step.toLevelLabel) : labels.takeElevatorDown(step.toLevelLabel);
      }
      return step.direction === 'up' ? labels.takeStairsUp(step.toLevelLabel) : labels.takeStairsDown(step.toLevelLabel);

    case 'arrive':
      if (step.side && step.roomName) return labels.arriveSide(step.roomName, step.side);
      return labels.arrive(step.roomName ?? null);
  }
}
