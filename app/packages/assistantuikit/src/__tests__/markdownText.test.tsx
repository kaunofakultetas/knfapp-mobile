// -----------------------------------------------------------
//  [*] Tests — MarkdownText, the tree on screen
//
//  Every block and mark lands as the Text or View it should:
//  headings with the header role and their weight, bold and
//  italic as nested Texts, inline code and the code box in the
//  monospace family with the fence body verbatim, links that
//  press through to the HOST's onPressLink with the destination
//  alone (and stay inert without one), bullets and numbers
//  counted from the list's start, quotes in the soft ink, a
//  rule as a one-pixel line. The streaming contract is pinned
//  frame by frame: with isStreaming the open line's mutable
//  suffix stays plain — an open **, a half-typed "**bold*", an
//  open fence from its opener render as a plain tail Text —
//  while a construct already closed on that line (**bold**, a
//  [link]) renders rich with the plain suffix flowing on in
//  the same paragraph or list item; the same text with its
//  closer renders rich, and without isStreaming the whole
//  text parses.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';

import MarkdownText from '../MarkdownText';
import { defaultColors } from '../core/types';

// jest-expo runs the suite as iOS — the family the code box
// asks for on this platform
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

const flat = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]));

// Host-tree walk for the Views that carry no text and no testID
type HostNode = { type: string; props: Record<string, unknown>; children: (HostNode | string)[] | null };

const hosts = (view: Awaited<ReturnType<typeof render>>): HostNode[] => {
  const out: HostNode[] = [];
  const walk = (node: HostNode | string) => {
    if (typeof node === 'string') return;
    out.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  const json = view.toJSON();
  for (const root of (Array.isArray(json) ? json : [json]) as unknown as HostNode[]) if (root) walk(root);
  return out;
};


describe('blocks and marks', () => {
  it('paragraphs and headings render their text; a heading carries the header role and its weight', async () => {
    const view = await render(<MarkdownText text={'# Antraštė\n\nLabas rytas.'} />);
    expect(view.getByTestId('assistantuikit-markdown')).toBeTruthy();
    const heading = view.getByText('Antraštė');
    expect(heading.props.accessibilityRole).toBe('header');
    expect(heading).toHaveStyle({ fontWeight: '700', fontSize: 20, color: defaultColors.ink });
    expect(view.getByText('Labas rytas.')).toHaveStyle({ fontSize: 15, color: defaultColors.ink });
  });

  it('bold and italic are nested Texts with the weight and the slant', async () => {
    const view = await render(<MarkdownText text="Tai **svarbu** ir _kursyvas_." />);
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });
    expect(view.getByText('kursyvas')).toHaveStyle({ fontStyle: 'italic' });
    expect(view.getByText('Tai svarbu ir kursyvas.')).toBeTruthy();
  });

  it('inline code is monospace on the recessed fill', async () => {
    const view = await render(<MarkdownText text="Vykdyk `npm start` dabar." />);
    expect(view.getByText('npm start')).toHaveStyle({ fontFamily: MONO, backgroundColor: defaultColors.surfaceSoft });
  });

  it('a code block is a monospace box with the fence body verbatim — no marks parsed inside', async () => {
    const view = await render(<MarkdownText text={'```js\nconst a = *1*;\n```'} />);
    const box = view.getByTestId('assistantuikit-markdown-code');
    expect(box).toHaveStyle({ backgroundColor: defaultColors.surfaceSoft, borderColor: defaultColors.line });
    const code = view.getByText('const a = *1*;');
    expect(code).toHaveStyle({ fontFamily: MONO, fontSize: 13, color: defaultColors.ink });
    expect(view.queryByText('1')).toBeNull();
  });

  it('a link presses through to onPressLink with the destination alone, wearing the brand colour', async () => {
    const onPressLink = jest.fn();
    const view = await render(<MarkdownText text="Žr. [VU KnF](https://knf.vu.lt)." onPressLink={onPressLink} />);
    const link = view.getByText('VU KnF');
    expect(link.props.accessibilityRole).toBe('link');
    expect(link).toHaveStyle({ color: defaultColors.brand, textDecorationLine: 'underline' });
    await fireEvent.press(link);
    expect(onPressLink.mock.calls).toEqual([['https://knf.vu.lt']]);
  });

  it('a link without onPressLink is inert — styled, but pressing does nothing', async () => {
    const view = await render(<MarkdownText text="[VU](https://knf.vu.lt)" />);
    const link = view.getByText('VU');
    expect(link.props.onPress).toBeUndefined();
    await fireEvent.press(link);
    expect(link).toHaveStyle({ color: defaultColors.brand });
  });

  it('lists draw bullets, and numbers counted from the start; a nested list sits under its item', async () => {
    const view = await render(<MarkdownText text={'7. septyni\n   - viduje\n8. aštuoni'} />);
    expect(view.getByText('7.')).toHaveStyle({ color: defaultColors.inkSoft });
    expect(view.getByText('8.')).toBeTruthy();
    expect(view.getByText('•')).toBeTruthy();
    expect(view.getByText('viduje')).toBeTruthy();
    expect(view.getByText('septyni')).toBeTruthy();
    expect(view.getByText('aštuoni')).toBeTruthy();
  });

  it('a quote renders its blocks in the soft ink behind a left rule', async () => {
    const view = await render(<MarkdownText text={'> Citata\n> - punktas'} />);
    expect(view.getByText('Citata')).toHaveStyle({ color: defaultColors.inkSoft });
    expect(view.getByText('punktas')).toHaveStyle({ color: defaultColors.inkSoft });
    expect(hosts(view).some((n) => flat(n.props.style).borderLeftWidth === 3)).toBe(true);
  });

  it('a rule is a one-pixel line in the line colour', async () => {
    const view = await render(<MarkdownText text={'a\n\n---\n\nb'} />);
    const rules = hosts(view).filter((n) => flat(n.props.style).height === 1);
    expect(rules).toHaveLength(1);
    expect(flat(rules[0].props.style).backgroundColor).toBe(defaultColors.line);
  });

  it('blocks stack with a gap above each one but the first', async () => {
    const view = await render(<MarkdownText text={'Pirmas\n\nAntras\n\n## Trečias'} />);
    expect(view.getByText('Pirmas')).toHaveStyle({ marginTop: 0 });
    expect(view.getByText('Antras')).toHaveStyle({ marginTop: 8 });
    expect(view.getByText('Trečias')).toHaveStyle({ marginTop: 14 });
  });

  it('empty text renders the container and nothing inside it', async () => {
    const view = await render(<MarkdownText text="" />);
    expect(view.getByTestId('assistantuikit-markdown').props.children).toEqual([[], null]);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
  });

  it('host colours reach the paragraph, the link, the code box and the quote', async () => {
    const colors = { ...defaultColors, ink: '#101010', inkSoft: '#606060', brand: '#7B003F', surfaceSoft: '#EEEEEE', line: '#CCCCCC' };
    const view = await render(
      <MarkdownText text={'Tekstas [n](https://x.lt)\n\n```\nk\n```\n\n> c'} colors={colors} />,
    );
    expect(view.getByText('n')).toHaveStyle({ color: '#7B003F' });
    expect(view.getByTestId('assistantuikit-markdown-code')).toHaveStyle({ backgroundColor: '#EEEEEE', borderColor: '#CCCCCC' });
    expect(view.getByText('k')).toHaveStyle({ color: '#101010' });
    expect(view.getByText('c')).toHaveStyle({ color: '#606060' });
  });
});


describe('isStreaming — the mutable suffix is plain until it closes', () => {
  it('an open ** on the last line is a plain tail; the closer turns it bold and the tail goes', async () => {
    const view = await render(<MarkdownText text="Tai **svar" isStreaming />);
    expect(view.getByTestId('assistantuikit-markdown-tail').props.children).toBe('Tai **svar');
    expect(view.queryByText('svar')).toBeNull();

    await view.rerender(<MarkdownText text={'Tai **svarbu**\n'} isStreaming />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });
  });

  it('a half-typed "**bold*" never shows as a star and an italic — plain until the line ends', async () => {
    const view = await render(<MarkdownText text="Tai **svarbu*" isStreaming />);
    expect(view.getByTestId('assistantuikit-markdown-tail').props.children).toBe('Tai **svarbu*');
    expect(view.queryByText('svarbu')).toBeNull();
  });

  it('settled lines render rich while only the last line stays plain', async () => {
    const view = await render(<MarkdownText text={'# A\n- b **c**\n- d **e'} isStreaming />);
    expect(view.getByText('A').props.accessibilityRole).toBe('header');
    expect(view.getByText('c')).toHaveStyle({ fontWeight: '700' });
    expect(view.getByText('•')).toBeTruthy();
    expect(view.getByTestId('assistantuikit-markdown-tail').props.children).toBe('- d **e');
  });

  it('an open fence is plain from its opener; closed, it is the code box', async () => {
    const view = await render(<MarkdownText text={'Kodas:\n```js\nconst a = 1;\nconst b'} isStreaming />);
    expect(view.getByText('Kodas:')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-markdown-code')).toBeNull();
    expect(view.getByTestId('assistantuikit-markdown-tail').props.children).toBe('```js\nconst a = 1;\nconst b');

    await view.rerender(<MarkdownText text={'Kodas:\n```js\nconst a = 1;\nconst b = 2;\n```'} isStreaming />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByTestId('assistantuikit-markdown-code')).toBeTruthy();
    expect(view.getByText('const a = 1;\nconst b = 2;')).toHaveStyle({ fontFamily: MONO });
  });

  it('the tail continues the block above it with no gap, and takes a gap after a blank line', async () => {
    const view = await render(<MarkdownText text={'- a\n- b'} isStreaming />);
    expect(view.getByTestId('assistantuikit-markdown-tail')).toHaveStyle({ marginTop: 0 });

    await view.rerender(<MarkdownText text={'- a\n\nTęsinys'} isStreaming />);
    expect(view.getByTestId('assistantuikit-markdown-tail')).toHaveStyle({ marginTop: 8 });

    await view.rerender(<MarkdownText text="Vienintelė" isStreaming />);
    expect(view.getByTestId('assistantuikit-markdown-tail')).toHaveStyle({ marginTop: 0 });
  });

  it('a closed **bold** mid-stream renders rich; the plain suffix flows on in the same paragraph', async () => {
    const view = await render(<MarkdownText text="Tai **svarbu** ir" isStreaming />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });
    expect(view.getByText('Tai svarbu ir')).toBeTruthy();
  });

  it('a closed link mid-stream presses through like a finished one', async () => {
    const onPressLink = jest.fn();
    const view = await render(
      <MarkdownText text="Žr. [VU](https://knf.vu.lt) ir dar" isStreaming onPressLink={onPressLink} />,
    );
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    const link = view.getByText('VU');
    expect(link.props.accessibilityRole).toBe('link');
    await fireEvent.press(link);
    expect(onPressLink.mock.calls).toEqual([['https://knf.vu.lt']]);
  });

  it('a settled construct on an open list line keeps the bullet and the flowing item text', async () => {
    const view = await render(<MarkdownText text="- Tai **svarbu** ir" isStreaming />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('•')).toBeTruthy();
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });
    expect(view.getByText('Tai svarbu ir')).toBeTruthy();
  });

  it('the stream ending parses the whole text — a closed last line stays rich, with no tail', async () => {
    const view = await render(<MarkdownText text="Tai **svarbu**" isStreaming />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });

    await view.rerender(<MarkdownText text="Tai **svarbu**" />);
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('svarbu')).toHaveStyle({ fontWeight: '700' });
  });

  it('without isStreaming an unterminated fence is a plain paragraph, never a code box', async () => {
    const view = await render(<MarkdownText text={'```js\nconst a = *1*;'} />);
    expect(view.queryByTestId('assistantuikit-markdown-code')).toBeNull();
    expect(view.queryByTestId('assistantuikit-markdown-tail')).toBeNull();
    expect(view.getByText('```js\nconst a = *1*;')).toHaveStyle({ fontSize: 15 });
  });
});
