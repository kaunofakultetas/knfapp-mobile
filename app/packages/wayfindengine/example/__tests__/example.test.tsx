// -----------------------------------------------------------
//  [*] Tests — the example screen end to end
//
//  ExampleWayfindScreen over the sample building: the browse
//  list comes up, 'wc' narrows it to the two toilets, a pick
//  routes from the entrance and the walker reports the level
//  and the metres left, Next walks the route to arrival and
//  Back steps off it again; then the "avoid stairs" switch
//  re-routes a second-floor room over the elevator and starts
//  the walk over. Every metre asserted is read off the sample
//  plan by hand (20 px is one metre).
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';

import ExampleWayfindScreen from '../ExampleWayfindScreen';


// The hooks settle synchronously, but the provider's validation
// effect and the store subscription land after mount — drain them
const flush = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });


describe('ExampleWayfindScreen', () => {
  it('mounts on the browse list with nothing picked', async () => {
    const screen = await render(<ExampleWayfindScreen />);
    await flush();

    expect(screen.getByTestId('count').props.children).toBe('10 rooms');
    expect(screen.getByTestId('route-reason').props.children).toBe('Pick a room');
    expect(screen.queryByTestId('level')).toBeNull();
  });

  it("search 'wc' finds the two toilets, a pick routes from the entrance, Next walks to arrival", async () => {
    const screen = await render(<ExampleWayfindScreen />);
    await flush();

    await fireEvent.changeText(screen.getByTestId('search'), 'wc');
    expect(screen.getByTestId('count').props.children).toBe('2 rooms');
    expect(screen.getByTestId('room-r-wc1')).toBeTruthy();
    expect(screen.getByTestId('room-r-wc2')).toBeTruthy();
    expect(screen.queryByTestId('room-r-cafe')).toBeNull();

    // entrance → lobby → c1 → c2 → the toilet door: 6 + 10 + 10 + 2 m
    await fireEvent.press(screen.getByTestId('room-r-wc1'));
    expect(screen.queryByTestId('route-reason')).toBeNull();
    expect(screen.getByTestId('level').props.children).toBe('1 aukštas');
    expect(screen.getByText(/^28 m left/)).toBeTruthy();
    expect(screen.getByTestId('step-0').props.children).toBe('depart atNodeId=n-entrance distanceM=6 towardsRoomId=r-wc1');
    expect(screen.getByTestId('step-1').props.children).toBe('turn atNodeId=n-lobby direction=right distanceM=20 landmark=reception desk');
    expect(screen.getByTestId('step-2').props.children).toBe('turn atNodeId=n-c2 direction=right distanceM=2 towardsRoomId=r-wc1');
    expect(screen.getByTestId('step-3').props.children).toBe('arrive atNodeId=n-dwc1 roomId=r-wc1 side=ahead');
    expect(screen.queryByTestId('arrived')).toBeNull();

    // Four points ahead of the entrance
    for (let i = 0; i < 4; i++) await fireEvent.press(screen.getByTestId('next'));
    expect(screen.getByTestId('arrived')).toBeTruthy();
    expect(screen.getByText(/^0 m left/)).toBeTruthy();
    expect(screen.getByTestId('position').props.children).toBe('at n-dwc1 (in r-wc1) · step 4 / 4');

    await fireEvent.press(screen.getByTestId('back'));
    expect(screen.queryByTestId('arrived')).toBeNull();
    expect(screen.getByText(/^2 m left/)).toBeTruthy();
  });

  it('"avoid stairs" re-routes a second-floor room over the elevator and restarts the walk', async () => {
    const screen = await render(<ExampleWayfindScreen />);
    await flush();

    await fireEvent.changeText(screen.getByTestId('search'), 'wc');
    await fireEvent.press(screen.getByTestId('room-r-wc2'));
    // Up the stairs: 26 m to c2, 2 m to the landing, 8 m of
    // stairs, 2 m off them, 2 m to the door
    expect(screen.getByText(/^40 m left/)).toBeTruthy();
    expect(screen.getByText(/via=stairs fromLevel=L1 toLevel=L2 direction=up distanceM=8/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('next'));
    expect(screen.getByTestId('position').props.children).toMatch(/^at n-lobby/);

    // The elevator costs a wait but is the only accessible way
    // up that is not the 30 m ramp: 26 + 10 + 2 + 4 + 2 + 10 + 2 m
    await fireEvent(screen.getByTestId('avoid-stairs'), 'valueChange', true);
    expect(screen.queryByText(/via=stairs/)).toBeNull();
    expect(screen.getByText(/via=elevator fromLevel=L1 toLevel=L2 direction=up distanceM=4/)).toBeTruthy();
    expect(screen.getByText(/^56 m left/)).toBeTruthy();
    // A new Route object is a new walk from its first point
    expect(screen.getByTestId('position').props.children).toMatch(/^at n-entrance/);
    expect(screen.getByTestId('level').props.children).toBe('1 aukštas');

    // Walking the whole way ends on the second floor
    for (let i = 0; i < 12; i++) await fireEvent.press(screen.getByTestId('next'));
    expect(screen.getByTestId('arrived')).toBeTruthy();
    expect(screen.getByTestId('level').props.children).toBe('2 aukštas');
  });
});
