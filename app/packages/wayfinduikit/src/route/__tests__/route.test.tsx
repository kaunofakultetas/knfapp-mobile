// -----------------------------------------------------------
//  [*] Tests — wayfinduikit route surfaces
//
//  The four route faces against the Lithuanian catalog (the
//  provider's default, spelled out here so a locale change
//  elsewhere cannot silently move these). InstructionLine: one
//  real glyph and one sentence per step type, the margins the
//  sentence leaves out, the emphasised size. RoutePreview: the
//  ETA-first summary line, chips in walking order, the switch
//  reporting the NEXT value only when wired, the one-way fold
//  per destination, Start and Close. RouteSheet: the counter,
//  Back locked at the first step, Next / Done / End firing,
//  the arrival face off the final step, the place and
//  reassurance lines. YouAreHereBar: its faces and buttons.
// -----------------------------------------------------------

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { fireEvent, render, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import type { KitInstruction, KitNavigationState, KitRouteSummary } from '../../core/types';
import { WayfindUiKitProvider } from '../../provider';
import { defaultTheme } from '../../provider/theme';
import InstructionLine, { stepGlyph, type StepGlyph } from '../InstructionLine';
import RoutePreview from '../RoutePreview';
import RouteSheet from '../RouteSheet';
import YouAreHereBar from '../YouAreHereBar';


const wrap = (ui: ReactElement) => render(<WayfindUiKitProvider locale="lt">{ui}</WayfindUiKitProvider>);

const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style) as Record<string, unknown>;


const depart: KitInstruction = { type: 'depart', distanceM: 40, towardsRoom: '114' };
const turnLeft: KitInstruction = { type: 'turn', direction: 'left', distanceM: 25, towardsRoom: '114' };
const stairsUp: KitInstruction = { type: 'connector', via: 'stairs', toLevelLabel: '2 aukštas', direction: 'up', distanceM: 12 };
const arriveLeft: KitInstruction = { type: 'arrive', roomName: '114', side: 'left' };

const summary: KitRouteSummary = {
  distanceM: 47,
  etaSeconds: 40,
  levels: ['l1', 'l2'],
  steps: [depart, turnLeft, stairsUp, arriveLeft],
};

const levelLabels = (id: string) => ({ l1: '1 aukštas', l2: '2 aukštas' })[id] ?? id;

const buildState = (over: Partial<KitNavigationState> = {}): KitNavigationState => ({
  stepIndex: 1,
  stepCount: 5,
  step: turnLeft,
  currentLevel: 'l1',
  nextLevel: 'l2',
  remainingM: 47,
  remainingSeconds: 61,
  arrived: false,
  ...over,
});




describe('InstructionLine', () => {

  it.each<[string, KitInstruction, StepGlyph]>([
    ['depart', depart, 'walk'],
    ['continue', { type: 'continue', distanceM: 47 }, 'arrow-up'],
    ['turn left', turnLeft, 'arrow-left-top'],
    ['turn right', { type: 'turn', direction: 'right', distanceM: 0 }, 'arrow-right-top'],
    ['slight left', { type: 'turn', direction: 'slight-left', distanceM: 5 }, 'arrow-top-left'],
    ['slight right', { type: 'turn', direction: 'slight-right', distanceM: 5 }, 'arrow-top-right'],
    ['u-turn', { type: 'turn', direction: 'u-turn', distanceM: 5, towardsRoom: '114' }, 'arrow-u-left-top'],
    ['straight', { type: 'turn', direction: 'straight', distanceM: 25 }, 'arrow-up'],
    ['door', { type: 'door', distanceM: 12 }, 'door-open'],
    ['stairs up', stairsUp, 'stairs-up'],
    ['stairs down', { type: 'connector', via: 'stairs', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 12 }, 'stairs-down'],
    ['elevator up', { type: 'connector', via: 'elevator', toLevelLabel: '3 aukštas', direction: 'up', distanceM: 0 }, 'elevator-up'],
    ['elevator down', { type: 'connector', via: 'elevator', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 0 }, 'elevator-down'],
    ['ramp', { type: 'connector', via: 'ramp', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 8 }, 'wheelchair-accessibility'],
    ['arrive', arriveLeft, 'flag'],
  ])('picks a real glyph for %s', (_name, step, glyph) => {
    expect(stepGlyph(step)).toBe(glyph);
    // The answer must exist in the family, or the row draws '?'
    expect(glyph in MaterialCommunityIcons.glyphMap).toBe(true);
  });


  it.each<[string, KitInstruction, string]>([
    ['depart', depart, 'Pradėkite eiti, kryptis – 114'],
    ['depart bare', { type: 'depart', distanceM: 0 }, 'Pradėkite eiti'],
    ['continue', { type: 'continue', distanceM: 47 }, 'Eikite tiesiai 45 m'],
    ['turn left towards', turnLeft, 'Sukite kairėn, kryptis – 114'],
    ['turn right bare', { type: 'turn', direction: 'right', distanceM: 0 }, 'Sukite dešinėn'],
    ['slight left', { type: 'turn', direction: 'slight-left', distanceM: 5 }, 'Sukite šiek tiek kairėn'],
    ['slight right', { type: 'turn', direction: 'slight-right', distanceM: 5 }, 'Sukite šiek tiek dešinėn'],
    ['u-turn stays bare', { type: 'turn', direction: 'u-turn', distanceM: 5, towardsRoom: '114' }, 'Apsisukite'],
    ['straight reads as continue', { type: 'turn', direction: 'straight', distanceM: 25 }, 'Eikite tiesiai 25 m'],
    ['door', { type: 'door', distanceM: 12 }, 'Eikite pro duris'],
    ['stairs up', stairsUp, 'Lipkite laiptais aukštyn – 2 aukštas'],
    ['stairs down', { type: 'connector', via: 'stairs', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 12 }, 'Lipkite laiptais žemyn – 1 aukštas'],
    ['elevator up', { type: 'connector', via: 'elevator', toLevelLabel: '3 aukštas', direction: 'up', distanceM: 0 }, 'Kilkite liftu aukštyn – 3 aukštas'],
    ['elevator down', { type: 'connector', via: 'elevator', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 0 }, 'Leiskitės liftu žemyn – 1 aukštas'],
    ['ramp', { type: 'connector', via: 'ramp', toLevelLabel: '1 aukštas', direction: 'down', distanceM: 8 }, 'Eikite pandusu – 1 aukštas'],
    ['arrive with side', arriveLeft, '114 yra kairėje'],
    ['arrive plain', { type: 'arrive', roomName: '114' }, 'Atvykote: 114'],
    ['arrive nameless', { type: 'arrive' }, 'Atvykote į tikslą'],
  ])('reads %s in Lithuanian and speaks exactly that sentence', async (_name, step, expected) => {
    const r = await wrap(<InstructionLine step={step} />);

    expect(r.getByText(expected)).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-instruction').props.accessibilityLabel).toBe(expected);
    expect(r.getByTestId('wayfinduikit-instruction-glyph')).toBeTruthy();
  });


  it('shows the walk to the next step in the margin, except where the sentence already says it', async () => {
    const turn = await wrap(<InstructionLine step={turnLeft} />);
    expect(turn.getByTestId('wayfinduikit-instruction-distance').props.children).toBe('25 m');

    const cont = await wrap(<InstructionLine step={{ type: 'continue', distanceM: 47 }} />);
    expect(cont.queryByTestId('wayfinduikit-instruction-distance')).toBeNull();

    // A 'straight' turn is worded as a continue, so its metres
    // are already in the sentence — the margin stays empty too
    const straight = await wrap(<InstructionLine step={{ type: 'turn', direction: 'straight', distanceM: 25 }} />);
    expect(straight.getByText('Eikite tiesiai 25 m')).toBeTruthy();
    expect(straight.queryByTestId('wayfinduikit-instruction-distance')).toBeNull();

    const arrive = await wrap(<InstructionLine step={arriveLeft} />);
    expect(arrive.queryByTestId('wayfinduikit-instruction-distance')).toBeNull();

    // A zero-length leg has nothing to say either
    const bare = await wrap(<InstructionLine step={{ type: 'turn', direction: 'right', distanceM: 0 }} />);
    expect(bare.queryByTestId('wayfinduikit-instruction-distance')).toBeNull();
  });


  it("hangs a turn's landmark under the sentence, as the host names it", async () => {
    const r = await wrap(<InstructionLine step={{ type: 'turn', direction: 'right', distanceM: 10, landmark: 'prie bibliotekos' }} />);
    expect(r.getByTestId('wayfinduikit-instruction-landmark').props.children).toBe('prie bibliotekos');
    // The reader still hears the sentence alone
    expect(r.getByTestId('wayfinduikit-instruction').props.accessibilityLabel).toBe('Sukite dešinėn');

    const plain = await wrap(<InstructionLine step={turnLeft} />);
    expect(plain.queryByTestId('wayfinduikit-instruction-landmark')).toBeNull();
  });


  it('sets the current step larger and on the brand wash under emphasis', async () => {
    const quiet = await wrap(<InstructionLine step={turnLeft} />);
    expect(flat(quiet.getByTestId('wayfinduikit-instruction-text')).fontSize).toBe(15);

    const loud = await wrap(<InstructionLine step={turnLeft} emphasis />);
    expect(flat(loud.getByTestId('wayfinduikit-instruction-text')).fontSize).toBe(18);
    expect(flat(loud.getByTestId('wayfinduikit-instruction-glyph')).color).toBe(defaultTheme.colors.brand);
  });
});




describe('RoutePreview', () => {

  const base = { roomName: '114', summary, levelLabels, onStart: () => {} };


  it('titles the card with the route and sums it up ETA first', async () => {
    const r = await wrap(<RoutePreview {...base} />);

    expect(r.getByTestId('wayfinduikit-preview')).toBeTruthy();
    expect(r.getByText('Maršrutas: 114')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-preview-summary').props.children).toBe('Mažiau nei minutė · 45 m');

    const longer = await wrap(<RoutePreview {...base} summary={{ ...summary, etaSeconds: 61, distanceM: 130 }} />);
    expect(longer.getByTestId('wayfinduikit-preview-summary').props.children).toBe('2 minutės · 130 m');
  });


  it('lays the level chips out in walking order and reads them as a chain', async () => {
    const r = await wrap(<RoutePreview {...base} summary={{ ...summary, levels: ['l2', 'l1', 'l2'] }} />);

    expect(within(r.getByTestId('wayfinduikit-preview-level-0')).getByText('2 aukštas')).toBeTruthy();
    expect(within(r.getByTestId('wayfinduikit-preview-level-1')).getByText('1 aukštas')).toBeTruthy();
    expect(within(r.getByTestId('wayfinduikit-preview-level-2')).getByText('2 aukštas')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-preview-level-3')).toBeNull();
    expect(r.getByTestId('wayfinduikit-preview-levels').props.accessibilityLabel).toBe('2 aukštas → 1 aukštas → 2 aukštas');
  });


  it('offers the avoid-stairs switch only when wired, reporting the next value', async () => {
    const onToggleAccessible = jest.fn();
    const r = await wrap(<RoutePreview {...base} onToggleAccessible={onToggleAccessible} />);

    expect(r.getByText('Vengti laiptų')).toBeTruthy();
    expect(r.getByText('Trumpiausias maršrutas')).toBeTruthy();
    const toggle = r.getByTestId('wayfinduikit-preview-accessible');
    expect(toggle.props.value).toBe(false);

    await fireEvent(toggle, 'valueChange', true);
    expect(onToggleAccessible).toHaveBeenCalledTimes(1);
    expect(onToggleAccessible).toHaveBeenCalledWith(true);


    // The host answers with the prop — the switch never flips itself
    expect(r.getByTestId('wayfinduikit-preview-accessible').props.value).toBe(false);
    await r.rerender(
      <WayfindUiKitProvider locale="lt">
        <RoutePreview {...base} accessible onToggleAccessible={onToggleAccessible} />
      </WayfindUiKitProvider>,
    );
    expect(r.getByTestId('wayfinduikit-preview-accessible').props.value).toBe(true);
    expect(r.getByText('Pritaikytas maršrutas')).toBeTruthy();

    const silent = await wrap(<RoutePreview {...base} accessible />);
    expect(silent.queryByTestId('wayfinduikit-preview-accessible')).toBeNull();
    expect(silent.queryByText('Vengti laiptų')).toBeNull();
  });


  it('folds the steps behind one link and unfolds them in route order', async () => {
    const r = await wrap(<RoutePreview {...base} />);

    expect(r.queryByTestId('wayfinduikit-preview-step-list')).toBeNull();
    expect(r.getByText('Rodyti žingsnius')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-preview-steps').props.accessibilityState.expanded).toBe(false);

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-steps'));

    const rows = within(r.getByTestId('wayfinduikit-preview-step-list')).getAllByTestId('wayfinduikit-instruction');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Pradėkite eiti, kryptis – 114',
      'Sukite kairėn, kryptis – 114',
      'Lipkite laiptais aukštyn – 2 aukštas',
      '114 yra kairėje',
    ]);
    expect(r.getByText('Slėpti žingsnius')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-preview-steps').props.accessibilityState.expanded).toBe(true);

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-steps'));
    expect(r.queryByTestId('wayfinduikit-preview-step-list')).toBeNull();
    expect(r.getByText('Rodyti žingsnius')).toBeTruthy();
  });


  it('closes the fold when the destination changes, and hides it with no steps', async () => {
    const r = await wrap(<RoutePreview {...base} />);
    await fireEvent.press(r.getByTestId('wayfinduikit-preview-steps'));
    expect(r.getByTestId('wayfinduikit-preview-step-list')).toBeTruthy();

    await r.rerender(
      <WayfindUiKitProvider locale="lt">
        <RoutePreview {...base} roomName="115" />
      </WayfindUiKitProvider>,
    );
    expect(r.getByText('Maršrutas: 115')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-preview-step-list')).toBeNull();

    const empty = await wrap(<RoutePreview {...base} summary={{ ...summary, steps: [] }} />);
    expect(empty.queryByTestId('wayfinduikit-preview-steps')).toBeNull();
  });


  it('fires onStart from the primary button and onClose from the dismiss glyph', async () => {
    const onStart = jest.fn();
    const onClose = jest.fn();
    const r = await wrap(<RoutePreview {...base} onStart={onStart} onClose={onClose} />);

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(within(r.getByTestId('wayfinduikit-preview-start')).getByText('Pradėti')).toBeTruthy();

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    const noClose = await wrap(<RoutePreview {...base} />);
    expect(noClose.queryByTestId('wayfinduikit-preview-close')).toBeNull();
  });


  it("wraps the host's image slot as one labelled image, and draws nothing without one", async () => {
    const r = await wrap(<RoutePreview {...base} imageSlot={<View testID="host-photo" />} />);

    const slot = r.getByTestId('wayfinduikit-preview-image');
    expect(slot.props.accessibilityRole).toBe('image');
    expect(slot.props.accessibilityLabel).toBe('Patalpos nuotrauka: 114');
    expect(within(slot).getByTestId('host-photo')).toBeTruthy();

    const bare = await wrap(<RoutePreview {...base} />);
    expect(bare.queryByTestId('wayfinduikit-preview-image')).toBeNull();
  });
});




describe('RouteSheet', () => {

  const base = { onNext: () => {}, onBack: () => {}, onDone: () => {} };


  it('counts the step from one, shows what is left, and emphasises the current instruction', async () => {
    const r = await wrap(<RouteSheet {...base} state={buildState()} />);

    expect(r.getByTestId('wayfinduikit-sheet')).toBeTruthy();
    expect(r.getByText('Žingsnis 2 iš 5')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-sheet-remaining').props.children).toBe('Liko 45 m · 2 minutės');
    expect(r.getByText('Sukite kairėn, kryptis – 114')).toBeTruthy();
    expect(flat(r.getByTestId('wayfinduikit-instruction-text')).fontSize).toBe(18);
    expect(r.queryByTestId('wayfinduikit-sheet-done')).toBeNull();
  });


  it('locks Back at the first step and lets Next through', async () => {
    const onBack = jest.fn();
    const onNext = jest.fn();
    const r = await wrap(<RouteSheet {...base} onBack={onBack} onNext={onNext} state={buildState({ stepIndex: 0, step: depart })} />);

    expect(r.getByTestId('wayfinduikit-sheet-back').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-back'));
    expect(onBack).not.toHaveBeenCalled();

    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });


  it('fires onBack past the first step and onEnd only when wired', async () => {
    const onBack = jest.fn();
    const onEnd = jest.fn();
    const r = await wrap(<RouteSheet {...base} onBack={onBack} onEnd={onEnd} state={buildState()} />);

    expect(r.getByTestId('wayfinduikit-sheet-back').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-back'));
    expect(onBack).toHaveBeenCalledTimes(1);

    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-end'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(r.getByText('Baigti maršrutą')).toBeTruthy();

    const silent = await wrap(<RouteSheet {...base} state={buildState()} />);
    expect(silent.queryByTestId('wayfinduikit-sheet-end')).toBeNull();
  });


  it('says where the walker is when the host knows, and stays quiet otherwise', async () => {
    const known = await wrap(<RouteSheet {...base} state={buildState({ currentPlace: 'koridorius B' })} />);
    expect(known.getByTestId('wayfinduikit-sheet-place').props.children).toBe('Esate: koridorius B');

    const unknown = await wrap(<RouteSheet {...base} state={buildState({ currentPlace: null })} />);
    expect(unknown.queryByTestId('wayfinduikit-sheet-place')).toBeNull();
  });


  it('adds the reassurance line only when handed metres, rounded like a sign', async () => {
    const nudged = await wrap(<RouteSheet {...base} state={buildState()} reassuranceM={47} />);
    expect(nudged.getByTestId('wayfinduikit-sheet-reassurance').props.children).toBe('Eikite toliau – dar 45 m');

    const close = await wrap(<RouteSheet {...base} state={buildState()} reassuranceM={7.4} />);
    expect(close.getByTestId('wayfinduikit-sheet-reassurance').props.children).toBe('Eikite toliau – dar 7 m');

    const none = await wrap(<RouteSheet {...base} state={buildState()} reassuranceM={null} />);
    expect(none.queryByTestId('wayfinduikit-sheet-reassurance')).toBeNull();

    const omitted = await wrap(<RouteSheet {...base} state={buildState()} />);
    expect(omitted.queryByTestId('wayfinduikit-sheet-reassurance')).toBeNull();
  });


  it('turns into the arrival card off the final step, with Done and nothing else', async () => {
    const onDone = jest.fn();
    const onEnd = jest.fn();
    const arrived = buildState({ stepIndex: 4, step: arriveLeft, remainingM: 0, remainingSeconds: 0, arrived: true });
    const r = await wrap(<RouteSheet {...base} onDone={onDone} onEnd={onEnd} state={arrived} />);

    expect(r.getByTestId('wayfinduikit-sheet-arrival')).toBeTruthy();
    expect(r.getByText('Atvykote: 114')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-sheet-arrival-side').props.children).toBe('114 yra kairėje');
    expect(r.queryByTestId('wayfinduikit-sheet-next')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-sheet-back')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-sheet-end')).toBeNull();
    expect(r.queryByText('Žingsnis 5 iš 5')).toBeNull();

    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });


  it('falls back to the plain arrival when the final step names no room', async () => {
    const nameless = await wrap(<RouteSheet {...base} state={buildState({ step: { type: 'arrive' }, arrived: true })} />);
    expect(nameless.getByText('Atvykote į tikslą')).toBeTruthy();
    expect(nameless.queryByTestId('wayfinduikit-sheet-arrival-side')).toBeNull();

    // A side without a room is not a sentence — the plain line wins
    const noStep = await wrap(<RouteSheet {...base} state={buildState({ step: null, arrived: true })} />);
    expect(noStep.getByText('Atvykote į tikslą')).toBeTruthy();
    expect(noStep.getByText('Atlikta')).toBeTruthy();
  });
});




describe('YouAreHereBar', () => {

  it('reads the plain face with no place and no buttons', async () => {
    const r = await wrap(<YouAreHereBar />);

    expect(r.getByTestId('wayfinduikit-here')).toBeTruthy();
    expect(r.getByText('Jūs esate čia')).toBeTruthy();
    expect(r.getByLabelText('Jūs esate čia')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-here-scan')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-here-pick')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-here-offroute')).toBeNull();
  });


  it('names the place when the host knows it', async () => {
    const r = await wrap(<YouAreHereBar place="114" />);

    expect(r.getByText('Esate: 114')).toBeTruthy();
    expect(r.getByLabelText('Jūs esate čia: 114')).toBeTruthy();
    expect(flat(r.getByTestId('wayfinduikit-here-glyph')).color).toBe(defaultTheme.colors.brand);
  });


  it('adds the off-route notice in the danger ink under the place, and speaks both', async () => {
    const r = await wrap(<YouAreHereBar place="114" offRoute />);

    expect(r.getByText('Esate: 114')).toBeTruthy();
    const notice = r.getByTestId('wayfinduikit-here-offroute');
    expect(notice.props.children).toBe('Nukrypote nuo maršruto');
    expect(flat(notice).color).toBe(defaultTheme.colors.danger);
    expect(flat(r.getByTestId('wayfinduikit-here-glyph')).color).toBe(defaultTheme.colors.danger);
    expect(r.getByLabelText('Jūs esate čia: 114. Nukrypote nuo maršruto')).toBeTruthy();
  });


  it('offers scan and pick as named buttons only when wired, and fires them', async () => {
    const onScanQr = jest.fn();
    const onPickLocation = jest.fn();
    const r = await wrap(<YouAreHereBar onScanQr={onScanQr} onPickLocation={onPickLocation} />);

    await fireEvent.press(r.getByRole('button', { name: 'Nuskaityti QR kodą' }));
    expect(onScanQr).toHaveBeenCalledTimes(1);
    expect(onPickLocation).not.toHaveBeenCalled();

    await fireEvent.press(r.getByTestId('wayfinduikit-here-pick'));
    expect(onPickLocation).toHaveBeenCalledTimes(1);
    expect(r.getByLabelText('Pasirinkti vietą')).toBeTruthy();

    const scanOnly = await wrap(<YouAreHereBar onScanQr={onScanQr} />);
    expect(scanOnly.getByTestId('wayfinduikit-here-scan')).toBeTruthy();
    expect(scanOnly.queryByTestId('wayfinduikit-here-pick')).toBeNull();
  });
});
