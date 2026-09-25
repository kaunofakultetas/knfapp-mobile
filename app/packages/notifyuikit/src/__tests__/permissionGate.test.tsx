// -----------------------------------------------------------
//  [*] Tests — PermissionGate, the permission-state switch
//
//  One component, one input: the engine's permission store.
//  Deliverable shows the children bare; askable shows the
//  prompt card whose button asks the ENGINE; denied-for-good
//  shows the blocked card whose button hands off to the host;
//  unsupported is a plain note with no button; unknown renders
//  nothing at all. A store emission flips the gate live — no
//  remount, no rerender from the host.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import PermissionGate, { type PermissionGateLabels } from '../PermissionGate';
import type { NotifyEngineLike, PermissionLike, PrefsLike, StoreLike } from '../core/types';


// -----------------------------------------------------------
// Stub engine — the structural mirrors, hand-rolled
// -----------------------------------------------------------

type EmittingStore<T> = StoreLike<T> & { emit(next: T): void };

const createStore = <T,>(initial: T): EmittingStore<T> => {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    emit: (next) => { value = next; [...listeners].forEach((l) => l(next)); },
  };
};

interface StubEngine extends NotifyEngineLike {
  permission: EmittingStore<PermissionLike>;
  prefs: EmittingStore<PrefsLike>;
  calls: string[];
}

const createStubEngine = (permission: PermissionLike): StubEngine => {
  const self: StubEngine = {
    permission: createStore(permission),
    prefs: createStore<PrefsLike>({
      masterEnabled: true,
      channels: { news: true, chat: true, schedule: true, admin: true },
      chatPreview: true,
      syncState: 'fresh',
    }),
    calls: [],
    requestPermission: async () => { self.calls.push('requestPermission'); return self.permission.get(); },
    setMasterEnabled: async (on) => { self.calls.push(`setMasterEnabled:${on}`); },
    setChannelEnabled: (key, on) => { self.calls.push(`setChannelEnabled:${key}:${on}`); },
    setChatPreview: async (on) => { self.calls.push(`setChatPreview:${on}`); },
  };
  return self;
};


// -----------------------------------------------------------
// Fixtures
// -----------------------------------------------------------

const GRANTED: PermissionLike = { status: 'granted', canAskAgain: true, canDeliver: true };
const UNDETERMINED: PermissionLike = { status: 'undetermined', canAskAgain: true, canDeliver: false };
const DENIED_FOREVER: PermissionLike = { status: 'denied', canAskAgain: false, canDeliver: false };
const DENIED_ASKABLE: PermissionLike = { status: 'denied', canAskAgain: true, canDeliver: false };
const UNSUPPORTED: PermissionLike = { status: 'unsupported', canAskAgain: false, canDeliver: false };
const UNKNOWN: PermissionLike = { status: 'unknown', canAskAgain: false, canDeliver: false };

const LABELS: PermissionGateLabels = {
  promptTitle: 'Įjunkite pranešimus',
  promptBody: 'Gaukite naujienas ir tvarkaraščio pakeitimus.',
  promptButton: 'Leisti',
  blockedTitle: 'Pranešimai išjungti',
  blockedBody: 'Įjunkite juos sistemos nustatymuose.',
  blockedButton: 'Atverti nustatymus',
  unsupportedBody: 'Šiame įrenginyje pranešimai negalimi.',
};

const setup = async (permission: PermissionLike) => {
  const engine = createStubEngine(permission);
  const onOpenSettings = jest.fn();
  const view = await render(
    <PermissionGate engine={engine} labels={LABELS} onOpenSettings={onOpenSettings}>
      <Text testID="gate-child">children-content</Text>
    </PermissionGate>,
  );
  return { engine, onOpenSettings, view };
};


// -----------------------------------------------------------
// Scenarios
// -----------------------------------------------------------

describe('PermissionGate', () => {
  it('deliverable ⇒ the children, bare — no card, no button', async () => {
    const { view } = await setup(GRANTED);
    expect(view.getByTestId('gate-child').props.children).toBe('children-content');
    expect(view.queryByTestId('notifyuikit-prompt')).toBeNull();
    expect(view.queryByTestId('notifyuikit-blocked')).toBeNull();
    expect(view.queryByTestId('notifyuikit-unsupported')).toBeNull();
    expect(view.queryByTestId('notifyuikit-gate-action')).toBeNull();
  });

  it('undetermined ⇒ the prompt card in the prompt voice, children held back', async () => {
    const { view } = await setup(UNDETERMINED);
    expect(view.getByTestId('notifyuikit-prompt')).toBeTruthy();
    expect(view.getByText(LABELS.promptTitle)).toBeTruthy();
    expect(view.getByText(LABELS.promptBody)).toBeTruthy();
    expect(view.getByText(LABELS.promptButton)).toBeTruthy();
    expect(view.queryByText(LABELS.blockedTitle)).toBeNull();
    expect(view.queryByTestId('gate-child')).toBeNull();
  });

  it('the prompt button asks the ENGINE — requestPermission exactly once, no host handoff', async () => {
    const { view, engine, onOpenSettings } = await setup(UNDETERMINED);
    await fireEvent.press(view.getByTestId('notifyuikit-gate-action'));
    expect(engine.calls).toEqual(['requestPermission']);
    expect(onOpenSettings).toHaveBeenCalledTimes(0);
  });

  it('denied-but-askable is still the prompt path, not the blocked one', async () => {
    const { view, engine } = await setup(DENIED_ASKABLE);
    expect(view.getByTestId('notifyuikit-prompt')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-blocked')).toBeNull();
    await fireEvent.press(view.getByTestId('notifyuikit-gate-action'));
    expect(engine.calls).toEqual(['requestPermission']);
  });

  it('denied-for-good ⇒ the blocked card, and the button hands off to the HOST only', async () => {
    const { view, engine, onOpenSettings } = await setup(DENIED_FOREVER);
    expect(view.getByTestId('notifyuikit-blocked')).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-prompt')).toBeNull();
    expect(view.getByText(LABELS.blockedTitle)).toBeTruthy();
    expect(view.getByText(LABELS.blockedBody)).toBeTruthy();
    expect(view.getByText(LABELS.blockedButton)).toBeTruthy();
    await fireEvent.press(view.getByTestId('notifyuikit-gate-action'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(engine.calls).toEqual([]);
  });

  it('unsupported ⇒ the plain note, with no button to press', async () => {
    const { view } = await setup(UNSUPPORTED);
    expect(view.getByTestId('notifyuikit-unsupported')).toBeTruthy();
    expect(view.getByText(LABELS.unsupportedBody)).toBeTruthy();
    expect(view.queryByTestId('notifyuikit-gate-action')).toBeNull();
    expect(view.queryByTestId('gate-child')).toBeNull();
  });

  it('unknown ⇒ nothing at all — no card, no note, no children', async () => {
    const { view } = await setup(UNKNOWN);
    expect(view.toJSON()).toBeNull();
    expect(view.queryByTestId('notifyuikit-prompt')).toBeNull();
    expect(view.queryByTestId('notifyuikit-blocked')).toBeNull();
    expect(view.queryByTestId('notifyuikit-unsupported')).toBeNull();
    expect(view.queryByTestId('notifyuikit-gate-action')).toBeNull();
    expect(view.queryByTestId('gate-child')).toBeNull();
  });

  it('the button label sets in onBrand — never the surface color, which misses AA on a dark brand fill', async () => {
    const engine = createStubEngine(UNDETERMINED);
    // The dark scheme's lifted pink with its dark surface — the
    // pair the old label color put at 3.6:1
    const dark = { ink: '#F3EEF0', inkSoft: '#A99FA4', line: '#352E32', brand: '#C2447C', surface: '#201B1E', onBrand: '#FFFFFF' };
    const view = await render(
      <PermissionGate engine={engine} labels={LABELS} onOpenSettings={jest.fn()} colors={dark}>
        <Text>unused</Text>
      </PermissionGate>,
    );
    const label = view.getByText(LABELS.promptButton);
    expect(Object.assign({}, ...[label.props.style].flat()).color).toBe('#FFFFFF');
  });

  it('a palette without onBrand still paints the label white', async () => {
    const engine = createStubEngine(DENIED_FOREVER);
    const view = await render(
      <PermissionGate
        engine={engine}
        labels={LABELS}
        onOpenSettings={jest.fn()}
        colors={{ ink: '#111', inkSoft: '#444', line: '#ddd', brand: '#7B003F', surface: '#FAFAFA' }}
      >
        <Text>unused</Text>
      </PermissionGate>,
    );
    expect(Object.assign({}, ...[view.getByText(LABELS.blockedButton).props.style].flat()).color).toBe('#FFFFFF');
  });

  it('the action is a full 44pt touch target', async () => {
    const { view } = await setup(UNDETERMINED);
    const action = view.getByTestId('notifyuikit-gate-action');
    const style = Object.assign({}, ...[action.props.style].flat(Infinity).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it("the host's fonts reach every text — family instead of weight — and absent fonts keep the platform face", async () => {
    const fonts = { regular: 'Raleway-Regular', medium: 'Raleway-Medium', bold: 'Raleway-Bold' };
    const styleOf = (node: { props: Record<string, unknown> }) =>
      Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));

    const prompt = await render(
      <PermissionGate engine={createStubEngine(UNDETERMINED)} labels={LABELS} onOpenSettings={jest.fn()} fonts={fonts}>
        <Text>unused</Text>
      </PermissionGate>,
    );
    expect(styleOf(prompt.getByText(LABELS.promptTitle))).toMatchObject({ fontFamily: 'Raleway-Bold' });
    expect(styleOf(prompt.getByText(LABELS.promptTitle)).fontWeight).toBeUndefined();
    expect(styleOf(prompt.getByText(LABELS.promptBody))).toMatchObject({ fontFamily: 'Raleway-Regular' });
    expect(styleOf(prompt.getByText(LABELS.promptButton))).toMatchObject({ fontFamily: 'Raleway-Bold' });

    // The note a runtime without push shows — the line that set
    // in the system font next to Raleway everywhere else
    const note = await render(
      <PermissionGate engine={createStubEngine(UNSUPPORTED)} labels={LABELS} onOpenSettings={jest.fn()} fonts={fonts}>
        <Text>unused</Text>
      </PermissionGate>,
    );
    expect(styleOf(note.getByText(LABELS.unsupportedBody))).toMatchObject({ fontFamily: 'Raleway-Regular' });

    const bare = await setup(UNDETERMINED);
    expect(styleOf(bare.view.getByText(LABELS.promptTitle))).toMatchObject({ fontWeight: '600' });
    expect(styleOf(bare.view.getByText(LABELS.promptTitle)).fontFamily).toBeUndefined();
  });

  it('a store emission flips prompt → children live, without a remount', async () => {
    const { view, engine } = await setup(UNDETERMINED);
    expect(view.getByTestId('notifyuikit-prompt')).toBeTruthy();
    expect(view.queryByTestId('gate-child')).toBeNull();

    await act(async () => { engine.permission.emit(GRANTED); });

    expect(view.getByTestId('gate-child').props.children).toBe('children-content');
    expect(view.queryByTestId('notifyuikit-prompt')).toBeNull();
    expect(view.queryByTestId('notifyuikit-gate-action')).toBeNull();
  });
});
