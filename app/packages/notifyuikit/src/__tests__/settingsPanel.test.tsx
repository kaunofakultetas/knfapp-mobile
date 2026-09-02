// -----------------------------------------------------------
//  [*] Tests — NotifySettingsPanel, every flip an engine call
//
//  A hand-rolled store + engine stub drives the panel. Rows
//  render from labels alone; channel rows gate on the master;
//  and the panel's one piece of judgment — master-ON failures
//  snapping the switch back off — is pinned reason by reason:
//  permission/unsupported retract and report through
//  onBlocked, network keeps the recorded intent, turning OFF
//  never snaps. Call payloads are asserted exactly.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';

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

const renderPanel = (
  bits: EngineBits,
  extra: { onBlocked?: (reason: 'permission' | 'unsupported') => void } = {},
) => render(<NotifySettingsPanel engine={bits.engine} labels={LABELS} {...extra} />);

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
