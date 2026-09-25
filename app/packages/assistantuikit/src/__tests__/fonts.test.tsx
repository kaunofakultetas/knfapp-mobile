// -----------------------------------------------------------
//  [*] Tests — the host's font families reach every text
//
//  A host that loaded its own faces hands them in `fonts`,
//  and every Text the kit draws must wear them: the welcome
//  title and body, the chips, the composer field and its
//  button, both bubbles, the markdown blocks (paragraph,
//  bold, heading, list, table, inline code), reasoning, the
//  generic tool card, the sources footer, the action bar and
//  the error strip. A mapped weight is the family ALONE — a
//  fontWeight beside it makes Android fake a second bold — and
//  a host that maps nothing keeps the system face with the
//  weight, exactly as before the slot existed.
// -----------------------------------------------------------

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AssistantThread from '../AssistantThread';
import type { AssistantFonts } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, send, settled } from './support/scriptedRuntime';


const FONTS: AssistantFonts = {
  regular: 'Kit-Regular',
  medium: 'Kit-Medium',
  semibold: 'Kit-SemiBold',
  bold: 'Kit-Bold',
  mono: 'Kit-Mono',
};

type View = Awaited<ReturnType<typeof render>>;

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

// The face a Text node renders in: its own style merged over
// every Text ancestor's, the way nested Text inherits on device
const face = (start: unknown) => {
  let node = start as { type: unknown; props: { style?: unknown }; parent: unknown } | null;
  const chain: Record<string, unknown>[] = [];
  while (node) {
    if (node.type === 'Text') chain.unshift(flat(node.props.style));
    node = node.parent as typeof node;
  }
  const merged = Object.assign({}, ...chain);
  return { fontFamily: merged.fontFamily, fontWeight: merged.fontWeight };
};

const faceOf = (view: View, text: string | RegExp) => face(view.getByText(text));

const renderThread = (model: ReturnType<typeof createScriptedModel>, fonts?: AssistantFonts) =>
  render(
    <ScriptedThread model={model}>
      <AssistantThread
        labels={LABELS}
        fonts={fonts}
        suggestions={[{ title: 'Rytojaus paskaitos', prompt: 'Kokios paskaitos rytoj?', description: 'Pagal grupę' }]}
        copyToClipboard={() => {}}
      />
    </ScriptedThread>,
  );


describe('host fonts on the empty thread', () => {
  it('the welcome, the chip, the field and the button wear the host families — no synthesized weight', async () => {
    const view = await renderThread(createScriptedModel([]), FONTS);
    expect(faceOf(view, LABELS.emptyTitle)).toEqual({ fontFamily: 'Kit-Bold', fontWeight: undefined });
    expect(faceOf(view, LABELS.emptyBody)).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(faceOf(view, 'Rytojaus paskaitos')).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(faceOf(view, 'Pagal grupę')).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(flat(view.getByTestId('assistantuikit-composer-input').props.style).fontFamily).toBe('Kit-Regular');
    expect(faceOf(view, LABELS.send)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
  });

  it('a host that maps nothing keeps the system face at each weight', async () => {
    const view = await renderThread(createScriptedModel([]));
    expect(faceOf(view, LABELS.emptyTitle)).toEqual({ fontFamily: undefined, fontWeight: '700' });
    expect(faceOf(view, 'Rytojaus paskaitos')).toEqual({ fontFamily: undefined, fontWeight: '600' });
    expect(faceOf(view, LABELS.emptyBody)).toEqual({ fontFamily: undefined, fontWeight: undefined });
  });
});


describe('host fonts in a conversation', () => {
  it('bubbles, markdown, reasoning, tool card, sources and actions all wear them', async () => {
    const model = createScriptedModel([[
      { reasoning: 'Ieškau žinyne' },
      { tool: { name: 'searchHandbook', input: { query: 'wifi' }, output: { entries: [{ id: 'h1', title: 'Wi-Fi fakultete', excerpt: 'eduroam', language: 'lt' }] } } },
      { tool: { name: 'unregisteredTool', input: { a: 1 }, output: { ok: true } } },
      { text: '## Prisijungimas\n\nJunkitės prie **eduroam** su `vardas@vu.lt`.\n\n- pirmas žingsnis\n\n| Tinklas | Slaptažodis |\n|---|---|\n| eduroam | VU |' },
    ]]);
    const view = await renderThread(model, FONTS);
    await send(view, 'Kaip prisijungti?');
    await settled(view);

    // The user's words
    expect(faceOf(view, 'Kaip prisijungti?')).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    // Markdown: heading and bold take the bold FAMILY, prose the
    // regular one, inline code the host's mono
    expect(faceOf(view, 'Prisijungimas')).toEqual({ fontFamily: 'Kit-Bold', fontWeight: undefined });
    expect(faceOf(view, 'vardas@vu.lt').fontFamily).toBe('Kit-Mono');
    expect(faceOf(view, 'pirmas žingsnis')).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(faceOf(view, 'Tinklas')).toEqual({ fontFamily: 'Kit-Bold', fontWeight: undefined });
    expect(faceOf(view, 'VU')).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    const bold = view.getAllByText('eduroam').find((node) => flat(node.props.style).fontFamily === 'Kit-Bold');
    expect(bold).toBeTruthy();

    // Reasoning header, the generic tool card, sources, actions
    expect(faceOf(view, LABELS.thinking)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(faceOf(view, 'unregisteredTool')).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(faceOf(view, 'searchHandbook')).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    const toggles = view.getAllByText(LABELS.showDetails);
    expect(toggles).toHaveLength(2);
    expect(face(toggles[1])).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(face(view.getAllByText(LABELS.toolDone)[0])).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(faceOf(view, LABELS.sourcesTitle)).toEqual({ fontFamily: 'Kit-Bold', fontWeight: undefined });
    expect(faceOf(view, /Wi-Fi fakultete/).fontFamily).toBe('Kit-Regular');
    expect(faceOf(view, LABELS.copy)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(faceOf(view, LABELS.regenerate)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });

    // The raw payload behind the generic card is code: mono
    await fireEvent.press(toggles[1]);
    expect(faceOf(view, /"a": 1/).fontFamily).toBe('Kit-Mono');
  });

  it('the error strip wears them too — the runtime detail included', async () => {
    const view = await renderThread(createScriptedModel([[{ throw: 'Serveris neatsako (503)' }]]), FONTS);
    await send(view, 'Labas');
    await waitFor(() => expect(view.getByTestId('assistantuikit-error')).toBeTruthy());
    await act(async () => {});
    expect(faceOf(view, LABELS.errorTitle)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    expect(faceOf(view, LABELS.errorBody)).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(faceOf(view, 'Serveris neatsako (503)')).toEqual({ fontFamily: 'Kit-Regular', fontWeight: undefined });
    expect(faceOf(view, LABELS.retry)).toEqual({ fontFamily: 'Kit-SemiBold', fontWeight: undefined });
    // The strip announces itself when it appears
    expect(view.getByTestId('assistantuikit-error').props.accessibilityRole).toBe('alert');
  });
});
