// -----------------------------------------------------------
//  [*] Tests — wayfinduikit example
//
//  The showcase proven live, whole: the screen mounts with the
//  first floor up and its stretch of the route on the plan, a
//  tap on the switcher brings the other floor's stretch and
//  pin, Start swaps the preview for the walking sheet, Next
//  walks every step with the screen following the walker
//  upstairs (floor, dot, place, reassurance) to the arrival
//  card and Done hands the preview back, and Back / End route
//  work mid-walk. The plan is handed the route's ends and the
//  walker's dot unfiltered and draws only the shown floor's;
//  the stage's marker reads the walk table's yaws in the
//  photo's own frame (0 the centre column, growing right), so
//  a table authored half a turn off would show here. Against
//  the Lithuanian catalog, the provider's default. What passes
//  here is the wiring a host copies.
// -----------------------------------------------------------

import { act, fireEvent, render, within } from '@testing-library/react-native';

import ExampleWayfindScreen from '../ExampleWayfindScreen';


// The plan follows the walker with an animated focus and the
// stage's hint pill fades on a timer; fake timers keep both
// from holding real handles open after a test ends
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

type Rendered = Awaited<ReturnType<typeof render>>;

// The plan draws nothing until it knows its size — the overlay
// (route, pins, the walker's dot) exists only after a layout;
// the handler is fed the way the responder system would
const layOutPlan = async (r: Rendered) => {
  const onLayout = r.getByTestId('wayfinduikit-plan').props.onLayout as (e: unknown) => void;
  await act(async () => {
    onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 240 } } });
  });
};

const pressNext = async (r: Rendered) => fireEvent.press(r.getByTestId('wayfinduikit-sheet-next'));

const selected = (r: Rendered, levelId: string) => r.getByTestId(`wayfinduikit-floor-${levelId}`).props.accessibilityState.selected as boolean;

// The plan's name sits on the host's drawing (the one image a
// screen reader hears), which exists only once laid out
const planLabel = (r: Rendered) => r.getByTestId('wayfinduikit-plan-drawing').props.accessibilityLabel as string;

const markerLabel = (r: Rendered) => r.getByTestId('wayfinduikit-marker').props.accessibilityLabel as string;




describe('ExampleWayfindScreen', () => {

  it('mounts with the first floor up, its stretch of the route drawn, the preview card and the stage', async () => {
    const r = await render(<ExampleWayfindScreen />);

    // The switcher stacks the top floor first and marks the
    // walker's floor
    expect(r.getAllByRole('tab').map((pill) => pill.props.testID)).toEqual(['wayfinduikit-floor-l2', 'wayfinduikit-floor-l1']);
    expect(selected(r, 'l1')).toBe(true);
    expect(r.getByTestId('wayfinduikit-floor-switcher').props.accessibilityLabel).toBe('Aukštų pasirinkimas, rodomas 1');
    expect(r.queryByTestId('wayfinduikit-plan-drawing')).toBeNull();


    // Laid out, the plan is named for the route on it and
    // carries the first floor's stretch, the start ring and the
    // walker's dot — the pin is upstairs, handed over all the
    // same
    await layOutPlan(r);
    expect(planLabel(r)).toBe('Maršrutas aukšto plane: 1');
    expect(r.getByTestId('wayfinduikit-plan-drawing').props.accessibilityRole).toBe('image');
    expect(r.getByTestId('wayfinduikit-plan').props.accessibilityLabel).toBeUndefined();
    expect(r.getByTestId('wayfinduikit-plan-route').props.d).toBe('M80 110 L80 120 L360 120');
    expect(r.getByTestId('wayfinduikit-plan-start')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-plan-here')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-plan-end')).toBeNull();


    // The preview: ETA first, both floors in walking order, the
    // six steps behind the fold, Start; no sheet yet
    expect(r.getByText('Maršrutas: 214')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-preview-summary').props.children).toBe('2 minutės · 130 m');
    expect(r.getByTestId('wayfinduikit-preview-levels').props.accessibilityLabel).toBe('1 aukštas → 2 aukštas');
    expect(r.getByTestId('wayfinduikit-preview-start')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-sheet')).toBeNull();

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-steps'));
    const rows = within(r.getByTestId('wayfinduikit-preview-step-list')).getAllByTestId('wayfinduikit-instruction');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Pradėkite eiti, kryptis – 214',
      'Sukite dešinėn',
      'Lipkite laiptais aukštyn – 2 aukštas',
      'Eikite tiesiai 60 m',
      'Sukite kairėn, kryptis – 214',
      '214 yra kairėje',
    ]);


    // The bar names the start room; the stage is the flat one,
    // its marker captioned with the destination and aligned:
    // the first photo's centre column looks down the route, so
    // its yaw is 0 in the frame the stage mounts facing
    expect(r.getByText('Esate: 114')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-flat-stage')).toBeTruthy();
    expect(within(r.getByTestId('wayfinduikit-marker')).getByText('214')).toBeTruthy();
    expect(markerLabel(r)).toBe('Žiūrite maršruto kryptimi');
  });


  it("switches the floor from the switcher and draws that floor's stretch of the route", async () => {
    const r = await render(<ExampleWayfindScreen />);
    await layOutPlan(r);

    await fireEvent.press(r.getByTestId('wayfinduikit-floor-l2'));
    expect(selected(r, 'l2')).toBe(true);
    expect(selected(r, 'l1')).toBe(false);
    expect(r.getByTestId('wayfinduikit-floor-switcher').props.accessibilityLabel).toBe('Aukštų pasirinkimas, rodomas 2');
    expect(planLabel(r)).toBe('Maršrutas aukšto plane: 2');


    // Upstairs: the second stretch and the destination pin; the
    // walker (dot, ring, bar) is still downstairs — the plan
    // was handed the same points and kept the ones on this floor
    expect(r.getByTestId('wayfinduikit-plan-route').props.d).toBe('M360 120 L120 120 L120 150');
    expect(r.getByTestId('wayfinduikit-plan-end')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-plan-here')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-plan-start')).toBeNull();
    expect(r.getByText('Esate: 114')).toBeTruthy();


    await fireEvent.press(r.getByTestId('wayfinduikit-floor-l1'));
    expect(selected(r, 'l1')).toBe(true);
    expect(planLabel(r)).toBe('Maršrutas aukšto plane: 1');
    expect(r.getByTestId('wayfinduikit-plan-here')).toBeTruthy();
  });


  it('starts the route and walks it to arrival, the screen following the walker upstairs', async () => {
    const r = await render(<ExampleWayfindScreen />);
    await layOutPlan(r);

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
    expect(r.queryByTestId('wayfinduikit-preview')).toBeNull();
    expect(r.getByTestId('wayfinduikit-sheet')).toBeTruthy();
    expect(r.getByText('Žingsnis 1 iš 6')).toBeTruthy();
    expect(r.getByText('Pradėkite eiti, kryptis – 214')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-sheet-remaining').props.children).toBe('Liko 130 m · 2 minutės');
    expect(r.getByTestId('wayfinduikit-sheet-back').props.accessibilityState.disabled).toBe(true);


    // Into the corridor: the turn with its landmark; the bar and
    // the sheet both move with the walker, and the marker leans
    // the short way round to the corridor photo's yaw 270 — a
    // quarter turn to the left of the centre column the stage
    // faces, never 90° to the right
    await pressNext(r);
    expect(r.getByText('Žingsnis 2 iš 6')).toBeTruthy();
    expect(r.getByText('Sukite dešinėn')).toBeTruthy();
    expect(r.getByText('ties biblioteka')).toBeTruthy();
    expect(markerLabel(r)).toBe('Maršrutas 90° kairiau');
    expect(r.getByTestId('wayfinduikit-here-place').props.children).toBe('Esate: 1 aukšto koridorius');
    expect(r.getByTestId('wayfinduikit-sheet-place').props.children).toBe('Esate: 1 aukšto koridorius');
    expect(r.getByTestId('wayfinduikit-sheet-back').props.accessibilityState.disabled).toBe(false);
    expect(planLabel(r)).toBe('Maršrutas aukšto plane: 1');


    // The stairs are still on the first floor; the stairwell
    // photo looks away from the route, so the marker is pinned
    // behind — on the left, as a half-turn is read
    await pressNext(r);
    expect(r.getByText('Lipkite laiptais aukštyn – 2 aukštas')).toBeTruthy();
    expect(selected(r, 'l1')).toBe(true);
    expect(r.queryByTestId('wayfinduikit-sheet-reassurance')).toBeNull();
    expect(markerLabel(r)).toBe('Maršrutas 180° kairiau');


    // … and the long corridor is upstairs: the floor flips, the
    // dot and the pin are on it, the reassurance line shows
    await pressNext(r);
    expect(r.getByText('Eikite tiesiai 60 m')).toBeTruthy();
    expect(selected(r, 'l2')).toBe(true);
    expect(planLabel(r)).toBe('Maršrutas aukšto plane: 2');
    expect(r.getByTestId('wayfinduikit-plan-here')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-plan-end')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-plan-start')).toBeNull();
    expect(r.getByTestId('wayfinduikit-sheet-reassurance').props.children).toBe('Eikite toliau – dar 60 m');
    expect(r.getByTestId('wayfinduikit-sheet-remaining').props.children).toBe('Liko 65 m · Mažiau nei minutė');


    await pressNext(r);
    expect(r.getByText('Sukite kairėn, kryptis – 214')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-sheet-reassurance')).toBeNull();


    // Arrival: the card with the side, nothing left to point at
    await pressNext(r);
    expect(r.getByTestId('wayfinduikit-sheet-arrival')).toBeTruthy();
    expect(r.getByText('Atvykote: 214')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-sheet-arrival-side').props.children).toBe('214 yra kairėje');
    expect(r.getByTestId('wayfinduikit-here-place').props.children).toBe('Esate: 214');
    expect(r.queryByTestId('wayfinduikit-sheet-next')).toBeNull();
    expect(r.queryByTestId('wayfinduikit-marker')).toBeNull();


    // Done hands the screen back to the preview, the walker at
    // the start and the marker up again
    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-done'));
    expect(r.getByTestId('wayfinduikit-preview')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-sheet')).toBeNull();
    expect(selected(r, 'l1')).toBe(true);
    expect(r.getByText('Esate: 114')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-marker')).toBeTruthy();
  });


  it('steps back down the list and ends the route early from the sheet', async () => {
    const r = await render(<ExampleWayfindScreen />);

    await fireEvent.press(r.getByTestId('wayfinduikit-preview-start'));
    await pressNext(r);
    await pressNext(r);
    expect(r.getByText('Žingsnis 3 iš 6')).toBeTruthy();


    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-back'));
    expect(r.getByText('Žingsnis 2 iš 6')).toBeTruthy();
    expect(r.getByTestId('wayfinduikit-here-place').props.children).toBe('Esate: 1 aukšto koridorius');


    await fireEvent.press(r.getByTestId('wayfinduikit-sheet-end'));
    expect(r.getByTestId('wayfinduikit-preview')).toBeTruthy();
    expect(r.queryByTestId('wayfinduikit-sheet')).toBeNull();
    expect(r.getByTestId('wayfinduikit-here-place').props.children).toBe('Esate: 114');
  });
});
