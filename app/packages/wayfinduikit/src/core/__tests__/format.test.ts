// -----------------------------------------------------------
//  [*] Tests — wayfinduikit formatters
//
//  The boundary tables: every rung of formatDistance (exact →
//  nearest 5 → one-decimal kilometres), formatEta's minute
//  ceiling, and every instruction type through instructionText
//  in both catalogs.
// -----------------------------------------------------------

import { defaultLabels } from '../../provider/labels';
import { formatDistance, formatEta, instructionText } from '../format';
import type { KitInstruction } from '../types';


const { lt, en } = defaultLabels;




describe('formatDistance', () => {

  it.each<[number, string]>([
    [0, '0 m'],
    [0.4, '0 m'],
    [1, '1 m'],
    [3.6, '4 m'],
    [7, '7 m'],
    [9.4, '9 m'],
    // 9.6 rounds up onto the 5-m rung's first value either way
    [9.6, '10 m'],
    [10, '10 m'],
    [12, '10 m'],
    [12.5, '15 m'],
    [13, '15 m'],
    [47, '45 m'],
    [48, '50 m'],
    [102, '100 m'],
    [997, '995 m'],
    // Still metres below the kilometre line, even when rounding lands on 1000
    [998, '1000 m'],
    [999.9, '1000 m'],
  ])('formats %s m as %s', (metres, expected) => {
    expect(formatDistance(metres, en)).toBe(expected);
    expect(formatDistance(metres, lt)).toBe(expected);
  });


  it.each<[number, string, string]>([
    [1000, '1.0 km', '1,0 km'],
    [1049, '1.0 km', '1,0 km'],
    [1050, '1.1 km', '1,1 km'],
    [1234, '1.2 km', '1,2 km'],
    [1250, '1.3 km', '1,3 km'],
    [2500, '2.5 km', '2,5 km'],
    [12345, '12.3 km', '12,3 km'],
  ])('formats %s m as %s / %s', (metres, expectedEn, expectedLt) => {
    expect(formatDistance(metres, en)).toBe(expectedEn);
    expect(formatDistance(metres, lt)).toBe(expectedLt);
  });


  it('never shows a negative or non-finite distance', () => {
    expect(formatDistance(-5, en)).toBe('0 m');
    expect(formatDistance(Number.NaN, en)).toBe('0 m');
    expect(formatDistance(Number.POSITIVE_INFINITY, en)).toBe('0 m');
  });
});




describe('formatEta', () => {

  it.each<[number, string, string]>([
    [0, 'Less than a minute', 'Mažiau nei minutė'],
    [1, 'Less than a minute', 'Mažiau nei minutė'],
    [59, 'Less than a minute', 'Mažiau nei minutė'],
    [59.9, 'Less than a minute', 'Mažiau nei minutė'],
    [60, '1 minute', '1 minutė'],
    // Ceiled: an ETA may run early, never late
    [61, '2 minutes', '2 minutės'],
    [120, '2 minutes', '2 minutės'],
    [121, '3 minutes', '3 minutės'],
    [600, '10 minutes', '10 minučių'],
    [601, '11 minutes', '11 minučių'],
    [1260, '21 minutes', '21 minutė'],
  ])('formats %s s as %s / %s', (seconds, expectedEn, expectedLt) => {
    expect(formatEta(seconds, en)).toBe(expectedEn);
    expect(formatEta(seconds, lt)).toBe(expectedLt);
  });


  it('reads junk as under a minute', () => {
    expect(formatEta(-30, en)).toBe('Less than a minute');
    expect(formatEta(Number.NaN, lt)).toBe('Mažiau nei minutė');
  });
});




describe('instructionText', () => {

  it('departs towards a room, or just departs', () => {
    const towards: KitInstruction = { type: 'depart', distanceM: 12, towardsRoom: '114' };
    const bare: KitInstruction = { type: 'depart', distanceM: 12 };
    const nulled: KitInstruction = { type: 'depart', distanceM: 12, towardsRoom: null };

    expect(instructionText(towards, en)).toBe('Head towards 114');
    expect(instructionText(towards, lt)).toBe('Pradėkite eiti, kryptis – 114');
    expect(instructionText(bare, en)).toBe('Start walking');
    expect(instructionText(bare, lt)).toBe('Pradėkite eiti');
    expect(instructionText(nulled, lt)).toBe('Pradėkite eiti');
  });


  it('continues for a rounded distance', () => {
    expect(instructionText({ type: 'continue', distanceM: 47.2 }, en)).toBe('Continue straight for 45 m');
    expect(instructionText({ type: 'continue', distanceM: 47.2 }, lt)).toBe('Eikite tiesiai 45 m');
    expect(instructionText({ type: 'continue', distanceM: 7.4, towardsRoom: 'Biblioteka' }, en)).toBe('Continue straight for 7 m');
  });


  it('turns bare, or wrapped towards a room', () => {
    expect(instructionText({ type: 'turn', direction: 'left', distanceM: 5 }, en)).toBe('Turn left');
    expect(instructionText({ type: 'turn', direction: 'left', distanceM: 5 }, lt)).toBe('Sukite kairėn');
    expect(instructionText({ type: 'turn', direction: 'right', distanceM: 5, towardsRoom: null }, en)).toBe('Turn right');
    expect(instructionText({ type: 'turn', direction: 'right', distanceM: 5 }, lt)).toBe('Sukite dešinėn');

    expect(instructionText({ type: 'turn', direction: 'left', distanceM: 5, towardsRoom: 'Biblioteka' }, en)).toBe('Turn left towards Biblioteka');
    expect(instructionText({ type: 'turn', direction: 'left', distanceM: 5, towardsRoom: 'Biblioteka' }, lt)).toBe('Sukite kairėn, kryptis – Biblioteka');
    expect(instructionText({ type: 'turn', direction: 'right', distanceM: 5, towardsRoom: '203' }, en)).toBe('Turn right towards 203');
    expect(instructionText({ type: 'turn', direction: 'right', distanceM: 5, towardsRoom: '203' }, lt)).toBe('Sukite dešinėn, kryptis – 203');
  });


  it('bears slightly, with and without a room', () => {
    expect(instructionText({ type: 'turn', direction: 'slight-left', distanceM: 5 }, en)).toBe('Bear left');
    expect(instructionText({ type: 'turn', direction: 'slight-left', distanceM: 5 }, lt)).toBe('Sukite šiek tiek kairėn');
    expect(instructionText({ type: 'turn', direction: 'slight-right', distanceM: 5, towardsRoom: '105' }, en)).toBe('Bear right towards 105');
    expect(instructionText({ type: 'turn', direction: 'slight-right', distanceM: 5, towardsRoom: '105' }, lt)).toBe('Sukite šiek tiek dešinėn, kryptis – 105');
  });


  it('reads a U-turn bare even when the step names a room', () => {
    expect(instructionText({ type: 'turn', direction: 'u-turn', distanceM: 5, towardsRoom: '105' }, en)).toBe('Make a U-turn');
    expect(instructionText({ type: 'turn', direction: 'u-turn', distanceM: 5, towardsRoom: '105' }, lt)).toBe('Apsisukite');
    expect(instructionText({ type: 'turn', direction: 'u-turn', distanceM: 5 }, lt)).toBe('Apsisukite');
  });


  it("reads a 'straight' turn as a continue", () => {
    expect(instructionText({ type: 'turn', direction: 'straight', distanceM: 22, towardsRoom: '105' }, en)).toBe('Continue straight for 20 m');
    expect(instructionText({ type: 'turn', direction: 'straight', distanceM: 22 }, lt)).toBe('Eikite tiesiai 20 m');
  });


  it('goes through the door', () => {
    expect(instructionText({ type: 'door', distanceM: 2 }, en)).toBe('Go through the door');
    expect(instructionText({ type: 'door', distanceM: 2, towardsRoom: '105' }, lt)).toBe('Eikite pro duris');
  });


  it('picks the connector phrase from via and direction', () => {
    const step = (via: 'stairs' | 'elevator' | 'ramp', direction: 'up' | 'down'): KitInstruction => ({
      type: 'connector',
      via,
      direction,
      toLevelLabel: 'L2',
      distanceM: 8,
    });

    expect(instructionText(step('stairs', 'up'), en)).toBe('Take the stairs up to L2');
    expect(instructionText(step('stairs', 'up'), lt)).toBe('Lipkite laiptais aukštyn – L2');
    expect(instructionText(step('stairs', 'down'), en)).toBe('Take the stairs down to L2');
    expect(instructionText(step('stairs', 'down'), lt)).toBe('Lipkite laiptais žemyn – L2');
    expect(instructionText(step('elevator', 'up'), en)).toBe('Take the elevator up to L2');
    expect(instructionText(step('elevator', 'up'), lt)).toBe('Kilkite liftu aukštyn – L2');
    expect(instructionText(step('elevator', 'down'), en)).toBe('Take the elevator down to L2');
    expect(instructionText(step('elevator', 'down'), lt)).toBe('Leiskitės liftu žemyn – L2');
    // A ramp has no up/down wording
    expect(instructionText(step('ramp', 'up'), en)).toBe('Take the ramp to L2');
    expect(instructionText(step('ramp', 'down'), en)).toBe('Take the ramp to L2');
    expect(instructionText(step('ramp', 'up'), lt)).toBe('Eikite pandusu – L2');
  });


  it('arrives on a side when it knows the room, plainly otherwise', () => {
    expect(instructionText({ type: 'arrive', roomName: '114', side: 'left' }, en)).toBe('114 is on your left');
    expect(instructionText({ type: 'arrive', roomName: '114', side: 'right' }, lt)).toBe('114 yra dešinėje');
    expect(instructionText({ type: 'arrive', roomName: '114', side: 'ahead' }, en)).toBe('114 is straight ahead');
    expect(instructionText({ type: 'arrive', roomName: '114', side: 'ahead' }, lt)).toBe('114 yra tiesiai priešais');

    expect(instructionText({ type: 'arrive', roomName: '114' }, en)).toBe('You have arrived at 114');
    expect(instructionText({ type: 'arrive', roomName: '114', side: null }, lt)).toBe('Atvykote: 114');
    expect(instructionText({ type: 'arrive' }, en)).toBe('You have arrived');
    expect(instructionText({ type: 'arrive', roomName: null }, lt)).toBe('Atvykote į tikslą');
    // A side with no room is not a sentence — the plain arrival wins
    expect(instructionText({ type: 'arrive', side: 'left' }, en)).toBe('You have arrived');
    expect(instructionText({ type: 'arrive', roomName: '', side: 'left' }, lt)).toBe('Atvykote į tikslą');
  });
});
