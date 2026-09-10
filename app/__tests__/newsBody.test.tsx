// -----------------------------------------------------------
//  [*] Tests — components/news/NewsBody + stripMarkdown
//
//  The markdown subset the scraper stores must round-trip:
//  blocks render as separate elements, inline markers become
//  styled spans, and whatever fails to parse stays visible
//  as literal text. stripMarkdown is the prose inverse the
//  card snippet rides on.
// -----------------------------------------------------------

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import NewsBody from '@/components/news/NewsBody';
import { stripMarkdown } from '@/services/newsText';


// Every visible string in a test-renderer tree, in order
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
