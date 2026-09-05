// -----------------------------------------------------------
//  [*] Tests — NotifySettingsPanel, every flip an engine call
//
//  A hand-rolled store + engine stub drives the panel. Rows
//  render from labels alone; channel rows gate on the master;
//  and the panel's one piece of judgment — master-ON failures
//  snapping the switch back off — is pinned reason by reason:
//  permission/unsupported retract and report through
//  onBlocked, network and unauthenticated keep the recorded
//  intent, turning OFF never snaps. Call payloads are asserted
//  exactly. The 1.1
//  host props are pinned against the host tree: hidden rows
//  and hairlines absent, locked rows disabled + dimmed, hints
//  under their own label, glyphs inside their own row in a
//  gutter every row reserves — and no gutter at all without.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Text } from 'react-native';

import NotifySettingsPanel, { type NotifySettingsLabels } from '../NotifySettingsPanel';
import type {
  NotifyChannelKey,
  NotifyEngineLike,
  PermissionLike,
  PrefsLike,
  RegisterResultLike,
  StoreLike,
} from '../core/types';

const LABELS: NotifySettingsLabels = {
  master: 'Pranešimai',
  masterHint: 'Leisti programai pranešti',
  channels: { news: 'Naujienos', chat: 'Pokalbiai', schedule: 'Tvarkaraštis', admin: 'Administracija' },
  chatPreview: 'Rodyti žinutės tekstą',
  chatPreviewHint: 'Išjungus — tik siuntėjas',
};

const CHANNEL_IDS = [
  'notifyuikit-channel-news',
  'notifyuikit-channel-chat',
  'notifyuikit-channel-schedule',
  'notifyuikit-channel-admin',
] as const;

// The five-line store stub — get, subscribe, and a test-side emit
interface StubStore<T> extends StoreLike<T> {
  emit(next: T): void;
}

function makeStore<T>(initial: T): StubStore<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    emit: (next) => ((value = next), listeners.forEach((l) => l(next))),
  };
}

const basePrefs = (over: Partial<PrefsLike> = {}): PrefsLike => ({
  masterEnabled: true,
  channels: { news: true, chat: true, schedule: true, admin: true },
  chatPreview: true,
  syncState: 'fresh',
  ...over,
});

// The engine stub records every call; the master result is scripted per test
interface EngineBits {
  engine: NotifyEngineLike;
  prefs: StubStore<PrefsLike>;
  masterCalls: boolean[];
  channelCalls: [NotifyChannelKey, boolean][];
  previewCalls: boolean[];
}

function makeEngine(prefsOver: Partial<PrefsLike> = {}, masterResult?: RegisterResultLike): EngineBits {
  const prefs = makeStore<PrefsLike>(basePrefs(prefsOver));
  const permission = makeStore<PermissionLike>({ status: 'granted', canAskAgain: true, canDeliver: true });
  const masterCalls: boolean[] = [];
  const channelCalls: [NotifyChannelKey, boolean][] = [];
  const previewCalls: boolean[] = [];
  const engine: NotifyEngineLike = {
    permission,
    prefs,
    requestPermission: async () => permission.get(),
    setMasterEnabled: async (on) => {
      masterCalls.push(on);
      return masterResult;
    },
    setChannelEnabled: (key, on) => {
      channelCalls.push([key, on]);
    },
    setChatPreview: async (on) => {
      previewCalls.push(on);
    },
  };
  return { engine, prefs, masterCalls, channelCalls, previewCalls };
}

// Everything but the two required props — the host-side knobs
type PanelExtras = Omit<ComponentProps<typeof NotifySettingsPanel>, 'engine' | 'labels'>;

const renderPanel = (bits: EngineBits, extra: PanelExtras = {}) =>
  render(<NotifySettingsPanel engine={bits.engine} labels={LABELS} {...extra} />);

type PanelView = Awaited<ReturnType<typeof render>>;

// Drain the toggleMaster microtask chain (two awaits deep)
const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

// Host-tree walkers: the row wrapper carries the dim opacity but
// no testID, so it is found as the direct host parent of a switch
type HostNode = { type: string; props: Record<string, unknown>; children: (HostNode | string)[] | null };

const roots = (view: PanelView): HostNode[] => {
  const json = view.toJSON();
  if (!json) return [];
  return (Array.isArray(json) ? json : [json]) as unknown as HostNode[];
};

const rowHosting = (view: PanelView, testID: string): HostNode => {
  const walk = (node: HostNode): HostNode | null => {
    for (const child of node.children ?? []) {
      if (typeof child === 'string') continue;
      if (child.props?.testID === testID) return node;
      const hit = walk(child);
      if (hit) return hit;
    }
    return null;
  };
  for (const root of roots(view)) {
    const hit = walk(root);
    if (hit) return hit;
  }
  throw new Error(`no host wraps ${testID}`);
};

const collectTestIDs = (view: PanelView): string[] => {
  const out: string[] = [];
  const walk = (node: HostNode | string) => {
    if (typeof node === 'string') return;
    const id = node.props?.testID;
    if (typeof id === 'string' && id.startsWith('notifyuikit-')) out.push(id);
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of roots(view)) walk(root);
  return out;
};

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

// Depth-first, document order — the strings are the rendered texts
const descendants = (node: HostNode | string): (HostNode | string)[] => {
  if (typeof node === 'string') return [node];
  return (node.children ?? []).flatMap((child) => [child, ...(typeof child === 'string' ? [] : descendants(child))]);
};

const rowTexts = (row: HostNode): string[] => descendants(row).filter((n): n is string => typeof n === 'string');

const hostsIn = (node: HostNode): HostNode[] => descendants(node).filter((n): n is HostNode => typeof n !== 'string');

// The icon gutter has no testID either — it is the one 24-wide box in a row
const guttersIn = (row: HostNode): HostNode[] => hostsIn(row).filter((n) => flat(n.props.style).width === 24);

// Hairlines are the 1px-tall hosts between the sections
const hairlineCount = (view: PanelView): number =>
  roots(view).flatMap(hostsIn).filter((n) => flat(n.props.style).height === 1).length;

describe('rendering', () => {
  it('renders the master, the four channels IN ORDER, and the chat preview — labels verbatim', async () => {
    const view = await renderPanel(makeEngine());
    expect(collectTestIDs(view)).toEqual([
      'notifyuikit-settings',
      'notifyuikit-master',
      'notifyuikit-channel-news',
      'notifyuikit-channel-chat',
      'notifyuikit-channel-schedule',
      'notifyuikit-channel-admin',
      'notifyuikit-chat-preview',
    ]);
    for (const label of ['Pranešimai', 'Naujienos', 'Pokalbiai', 'Tvarkaraštis', 'Administracija', 'Rodyti žinutės tekstą']) {
      expect(view.getByText(label)).toBeTruthy();
    }
    expect(view.getByText('Leisti programai pranešti')).toBeTruthy();
    expect(view.getByText('Išjungus — tik siuntėjas')).toBeTruthy();
    expect(view.getByTestId('notifyuikit-master').props.accessibilityLabel).toBe('Pranešimai');
  });
});

describe('master gating', () => {
  it('channel + preview switches disable and dim while the master is off', async () => {
    const view = await renderPanel(makeEngine({ masterEnabled: false }));
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
      expect(view.getByTestId(id).props.disabled).toBe(true);
      expect(flat(rowHosting(view, id).props.style).opacity).toBe(0.4);
    }
    // The master itself never locks — it is the way back in
    expect(view.getByTestId('notifyuikit-master')).toBeEnabled();
    expect(view.getByTestId('notifyuikit-master').props.value).toBe(false);
    expect(flat(rowHosting(view, 'notifyuikit-master').props.style).opacity).toBe(1);
  });

  it('everything enables at full opacity when the master is on', async () => {
    const view = await renderPanel(makeEngine());
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
      expect(view.getByTestId(id)).toBeEnabled();
      expect(flat(rowHosting(view, id).props.style).opacity).toBe(1);
    }
    expect(view.getByTestId('notifyuikit-master').props.value).toBe(true);
  });
});

describe('flips', () => {
  it('flipping a channel switch is exactly one engine call, keyed', async () => {
    const bits = makeEngine();
    const view = await renderPanel(bits);
    await fireEvent(view.getByTestId('notifyuikit-channel-news'), 'valueChange', false);
    await flush();
    expect(bits.channelCalls).toEqual([['news', false]]);
    expect(bits.masterCalls).toEqual([]);
    expect(bits.previewCalls).toEqual([]);
  });

  it('flipping the chat preview calls setChatPreview with the new value', async () => {
    const bits = makeEngine();
    const view = await renderPanel(bits);
    await fireEvent(view.getByTestId('notifyuikit-chat-preview'), 'valueChange', false);
    await flush();
    expect(bits.previewCalls).toEqual([false]);
    expect(bits.channelCalls).toEqual([]);
    expect(bits.masterCalls).toEqual([]);
  });
});

describe('master snap-back', () => {
  it('permission failure: ON is retracted with a second setMasterEnabled(false), onBlocked hears why', async () => {
    const bits = makeEngine({ masterEnabled: false }, { ok: false, reason: 'permission' });
    const onBlocked = jest.fn();
    const view = await renderPanel(bits, { onBlocked });
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();
    expect(bits.masterCalls).toEqual([true, false]);
    expect(onBlocked.mock.calls).toEqual([['permission']]);
  });

  it('unsupported failure retracts and reports the same way', async () => {
    const bits = makeEngine({ masterEnabled: false }, { ok: false, reason: 'unsupported' });
    const onBlocked = jest.fn();
    const view = await renderPanel(bits, { onBlocked });
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();
    expect(bits.masterCalls).toEqual([true, false]);
    expect(onBlocked.mock.calls).toEqual([['unsupported']]);
  });

  it('network failure keeps the switch ON — no snap-back, no onBlocked', async () => {
    const bits = makeEngine({ masterEnabled: false }, { ok: false, reason: 'network' });
    const onBlocked = jest.fn();
    const view = await renderPanel(bits, { onBlocked });
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();
    expect(bits.masterCalls).toEqual([true]);
    expect(onBlocked.mock.calls).toEqual([]);
  });

  it('unauthenticated (a guest recording intent) keeps the switch ON — no snap-back, no onBlocked', async () => {
    const bits = makeEngine({ masterEnabled: false }, { ok: false, reason: 'unauthenticated' });
    const onBlocked = jest.fn();
    const view = await renderPanel(bits, { onBlocked });
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', true);
    await flush();
    // Exactly the one call — no retraction; login claims the intent later
    expect(bits.masterCalls).toEqual([true]);
    expect(onBlocked.mock.calls).toEqual([]);
  });

  it('turning OFF resolves void and never snaps back', async () => {
    const bits = makeEngine(); // master on; setMasterEnabled resolves undefined
    const onBlocked = jest.fn();
    const view = await renderPanel(bits, { onBlocked });
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', false);
    await flush();
    expect(bits.masterCalls).toEqual([false]);
    expect(onBlocked.mock.calls).toEqual([]);
  });
});

describe('store-driven re-render', () => {
  it('a prefs emission re-renders the switches from the snapshot', async () => {
    const bits = makeEngine();
    const view = await renderPanel(bits);
    expect(view.getByTestId('notifyuikit-channel-chat').props.value).toBe(true);
    await act(async () => {
      bits.prefs.emit(basePrefs({ channels: { news: true, chat: false, schedule: true, admin: true } }));
    });
    expect(view.getByTestId('notifyuikit-channel-chat').props.value).toBe(false);
    expect(view.getByTestId('notifyuikit-channel-news').props.value).toBe(true);
    expect(view.getByTestId('notifyuikit-chat-preview').props.value).toBe(true);
  });
});

describe('showChannels', () => {
  it('false leaves the master standing alone — channel rows, both hairlines and the chat preview leave the tree', async () => {
    const bits = makeEngine();
    const view = await renderPanel(bits, { showChannels: false });
    expect(collectTestIDs(view)).toEqual(['notifyuikit-settings', 'notifyuikit-master']);
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) expect(view.queryByTestId(id)).toBeNull();
    for (const label of ['Naujienos', 'Pokalbiai', 'Tvarkaraštis', 'Administracija', 'Rodyti žinutės tekstą']) {
      expect(view.queryByText(label)).toBeNull();
    }
    expect(hairlineCount(view)).toBe(0);
    // The master is untouched by the hiding — still live, still wired
    expect(view.getByTestId('notifyuikit-master')).toBeEnabled();
    await fireEvent(view.getByTestId('notifyuikit-master'), 'valueChange', false);
    await flush();
    expect(bits.masterCalls).toEqual([false]);
  });

  it('the default keeps every row and both hairlines — the 1.0 tree', async () => {
    const view = await renderPanel(makeEngine());
    expect(hairlineCount(view)).toBe(2);
  });
});

describe('channelsLocked', () => {
  it('locks + dims the channel and chat-preview rows even with the master ON; the master stays live', async () => {
    const bits = makeEngine();
    const view = await renderPanel(bits, { channelsLocked: true });
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
      expect(view.getByTestId(id).props.disabled).toBe(true);
      expect(flat(rowHosting(view, id).props.style).opacity).toBe(0.4);
    }
    expect(view.getByTestId('notifyuikit-master')).toBeEnabled();
    expect(view.getByTestId('notifyuikit-master').props.value).toBe(true);
    expect(flat(rowHosting(view, 'notifyuikit-master').props.style).opacity).toBe(1);
    // A lock is a UI state, not an engine event
    expect(bits.masterCalls).toEqual([]);
    expect(bits.channelCalls).toEqual([]);
  });

  it('a prefs emission does not unlock — the lock is the HOST\'s to lift', async () => {
    const bits = makeEngine({ masterEnabled: false });
    const view = await renderPanel(bits, { channelsLocked: true });
    await act(async () => {
      bits.prefs.emit(basePrefs({ masterEnabled: true }));
    });
    expect(view.getByTestId('notifyuikit-master').props.value).toBe(true);
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
      expect(view.getByTestId(id).props.disabled).toBe(true);
    }
  });

  it('the default is unlocked — master ON enables the rows exactly as before', async () => {
    const view = await renderPanel(makeEngine(), { channelsLocked: false });
    for (const id of [...CHANNEL_IDS, 'notifyuikit-chat-preview']) expect(view.getByTestId(id)).toBeEnabled();
  });
});

describe('channelHints', () => {
  it('a hint renders under its own channel label, and nowhere else', async () => {
    const view = await renderPanel(makeEngine(), {
      channelHints: { news: 'Fakulteto naujienos', schedule: 'Paskaitų pakeitimai' },
    });
    expect(rowTexts(rowHosting(view, 'notifyuikit-channel-news'))).toEqual(['Naujienos', 'Fakulteto naujienos']);
    expect(rowTexts(rowHosting(view, 'notifyuikit-channel-schedule'))).toEqual(['Tvarkaraštis', 'Paskaitų pakeitimai']);
    // Channels without a hint keep the single-line row
    expect(rowTexts(rowHosting(view, 'notifyuikit-channel-chat'))).toEqual(['Pokalbiai']);
    expect(rowTexts(rowHosting(view, 'notifyuikit-channel-admin'))).toEqual(['Administracija']);
    // The label hints are untouched by the channel ones
    expect(rowTexts(rowHosting(view, 'notifyuikit-master'))).toEqual(['Pranešimai', 'Leisti programai pranešti']);
    expect(rowTexts(rowHosting(view, 'notifyuikit-chat-preview'))).toEqual(['Rodyti žinutės tekstą', 'Išjungus — tik siuntėjas']);
  });

  it('a hint wears the hint typography, not the label\'s', async () => {
    const view = await renderPanel(makeEngine(), { channelHints: { chat: 'Žinutės ir paminėjimai' } });
    expect(flat(view.getByText('Žinutės ir paminėjimai').props.style).fontSize).toBe(12);
    expect(flat(view.getByText('Pokalbiai').props.style).fontSize).toBe(14);
  });
});

describe('icons', () => {
  const glyph = (id: string) => <Text testID={id}>●</Text>;

  it('a glyph renders inside its own row, and every row reserves the same 24-wide gutter', async () => {
    const view = await renderPanel(makeEngine(), {
      icons: { master: glyph('glyph-master'), chat: glyph('glyph-chat'), chatPreview: glyph('glyph-preview') },
    });
    const inRow = (rowID: string, glyphID: string) =>
      hostsIn(rowHosting(view, rowID)).some((n) => n.props.testID === glyphID);
    expect(inRow('notifyuikit-master', 'glyph-master')).toBe(true);
    expect(inRow('notifyuikit-channel-chat', 'glyph-chat')).toBe(true);
    expect(inRow('notifyuikit-chat-preview', 'glyph-preview')).toBe(true);
    // Not leaked into a neighbour
    expect(inRow('notifyuikit-channel-news', 'glyph-chat')).toBe(false);
    expect(inRow('notifyuikit-channel-chat', 'glyph-master')).toBe(false);
    // Rows WITHOUT a glyph still carry an empty gutter — the label column stays aligned
    for (const id of ['notifyuikit-master', ...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
      const gutters = guttersIn(rowHosting(view, id));
      expect(gutters).toHaveLength(1);
      expect(flat(gutters[0].props.style)).toMatchObject({ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' });
    }
    expect(descendants(guttersIn(rowHosting(view, 'notifyuikit-channel-news'))[0])).toHaveLength(0);
  });

  it('the gutter sits before the texts and is hidden from screen readers', async () => {
    const view = await renderPanel(makeEngine(), { icons: { master: glyph('glyph-master') } });
    const row = rowHosting(view, 'notifyuikit-master');
    const [gutter] = row.children ?? [];
    expect(typeof gutter !== 'string' && guttersIn(row)[0] === gutter).toBe(true);
    expect(guttersIn(row)[0].props.accessibilityElementsHidden).toBe(true);
    expect(guttersIn(row)[0].props.importantForAccessibility).toBe('no-hide-descendants');
    expect(rowTexts(row)).toEqual(['●', 'Pranešimai', 'Leisti programai pranešti']);
  });

  it('no icons ⇒ no gutter on any row — the pre-1.1 layout to the pixel', async () => {
    const bare = await renderPanel(makeEngine());
    const empty = await renderPanel(makeEngine(), { icons: {} });
    for (const view of [bare, empty]) {
      for (const id of ['notifyuikit-master', ...CHANNEL_IDS, 'notifyuikit-chat-preview']) {
        expect(guttersIn(rowHosting(view, id))).toHaveLength(0);
      }
    }
  });
});
