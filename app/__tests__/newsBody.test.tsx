// -----------------------------------------------------------
//  [*] Tests — components/news/NewsBody + stripMarkdown
//
//  The markdown subset the scraper stores must round-trip:
//  blocks render as separate elements, inline markers become
//  styled spans, and whatever fails to parse stays visible
//  as literal text. stripMarkdown is the prose inverse the
//  card snippet rides on. A hand-written post keeps every
//  character as typed, and only its bare http(s) addresses
//  become links (sentence punctuation stays text).
// -----------------------------------------------------------

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import NewsBody, { parsePlainLinks } from '@/components/news/NewsBody';
import { stripMarkdown } from '@/services/newsText';







// -----------------------------------------------------------
// textOf
// -----------------------------------------------------------
//
// Every visible string in a test-renderer tree, in order —
// what a reader of the rendered body would see.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function textOf(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const children = node.children ?? [];
  return children.map(textOf).join('');
}


describe('NewsBody', () => {
  it('renders headings, paragraphs, lists and links as separate blocks', () => {
    const text = [
      '## Antraštė',
      'Pastraipa su [nuoroda](https://vu.lt/x) ir **storu** tekstu.',
      '- Vienas\n- Du',
    ].join('\n\n');

    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NewsBody text={text} markdown />);
    });

    const rendered = textOf(tree.toJSON());
    expect(rendered).toContain('Antraštė');
    expect(rendered).toContain('Pastraipa su nuoroda ir storu tekstu.');
    expect(rendered).toContain('Vienas');
    expect(rendered).toContain('Du');
    // Markers never reach the screen
    expect(rendered).not.toContain('**');
    expect(rendered).not.toContain('](');
  });

  it('renders a plain post exactly as typed', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NewsBody text={'Šiandien **šašlykai**!'} markdown={false} />);
    });
    expect(textOf(tree.toJSON())).toBe('Šiandien **šašlykai**!');
  });

  it('keeps a torn link tail visible as literal text', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NewsBody text={'Pabaiga [Vilniaus universi'} markdown />);
    });
    expect(textOf(tree.toJSON())).toBe('Pabaiga [Vilniaus universi');
  });
});


describe('stripMarkdown', () => {
  it('reduces the scraper subset to prose', () => {
    expect(stripMarkdown('## A\n[t](https://x.lt) ir **b** ir *k*\n- vienas'))
      .toBe('A\nt ir b ir k\nvienas');
  });
});



describe('a hand-written post\'s links', () => {
  it('cuts bare addresses out as links and leaves the sentence around them as typed', () => {
    expect(parsePlainLinks('Registracija: https://forms.gle/abc123. Iki penktadienio!')).toEqual([
      { text: 'Registracija: ' },
      { text: 'https://forms.gle/abc123', url: 'https://forms.gle/abc123' },
      { text: '. Iki penktadienio!' },
    ]);
  });

  it('keeps a balanced parenthesis, drops an unbalanced one, and ignores non-web text', () => {
    expect(parsePlainLinks('(žr. https://lt.wikipedia.org/wiki/Kaunas_(miestas))')[1]).toEqual({
      text: 'https://lt.wikipedia.org/wiki/Kaunas_(miestas)',
      url: 'https://lt.wikipedia.org/wiki/Kaunas_(miestas)',
    });
    expect(parsePlainLinks('rašykite į ftp://x.lt arba http://localhost')).toEqual([
      { text: 'rašykite į ftp://x.lt arba http://localhost' },
    ]);
  });

  it('renders the post exactly as typed with the address as a link span', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NewsBody text={'Anketa: https://vu.lt/a **svarbu**'} markdown={false} />);
    });
    expect(textOf(tree.toJSON())).toBe('Anketa: https://vu.lt/a **svarbu**');
    const links = tree.root.findAll((node) => node.props.accessibilityRole === 'link' && typeof node.props.onPress === 'function');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
