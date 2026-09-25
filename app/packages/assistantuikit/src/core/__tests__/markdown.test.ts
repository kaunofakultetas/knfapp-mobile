// -----------------------------------------------------------
//  [*] Tests — the markdown parser, pinned tree by tree
//
//  Every block kind and every inline kind parses to an exact
//  tree; nesting (bold around italic and code, emphasis around
//  a whole link, a list inside a quote, a list one level deep)
//  is asserted whole; blank-separated same-kind items merge
//  into one loose list and only "1."/"1)" interrupts a
//  paragraph; escapes, intraword underscores (NFC and NFD
//  alike) and unicode punctuation boundaries hold; and the
//  streaming rules are pinned on prefixes of a reply — an open
//  **, _, ` or ``` is text until its closer lands, and the
//  same text with the closer parses rich. Input hygiene (CRLF,
//  trailing whitespace, empty and blank-only input),
//  splitStreamingTail's cut points — a construct already
//  closed on the open line settles, the mutable suffix waits —
//  and appendStreamTail's splice into the last leaf close the
//  table. A nested marker-kind switch chains a second nested
//  list instead of numbering bullets (KNF-161). The streaming
//  parser equals parseMarkdown on EVERY prefix of realistic
//  replies while reusing the blocks before its last safe
//  boundary, and an emphasis opener with no possible closer
//  after it costs nothing — a paragraph of unclosed stars is
//  linear, not quadratic (KNF-088).
// -----------------------------------------------------------

import {
  appendStreamTail,
  createStreamingParser,
  parseMarkdown,
  splitStreamingTail,
  type MarkdownBlock,
  type MarkdownInline,
} from '../markdown';

const text = (value: string): MarkdownInline => ({ type: 'text', text: value });
const paragraph = (...spans: MarkdownInline[]): MarkdownBlock => ({ type: 'paragraph', spans });
const plain = (value: string): MarkdownBlock => paragraph(text(value));


describe('blocks', () => {
  it('a paragraph is one block; a blank line starts the next', () => {
    expect(parseMarkdown('Labas.\n\nKaip sekasi?')).toEqual([plain('Labas.'), plain('Kaip sekasi?')]);
  });

  it('a single newline inside a paragraph is a line break, not a join', () => {
    expect(parseMarkdown('Muitinės g. 8\nKaunas')).toEqual([plain('Muitinės g. 8\nKaunas')]);
  });

  it('headings 1-3 by hash count, deeper hashes clamp to 3, closing hashes drop', () => {
    expect(parseMarkdown('# Vienas\n## Du\n### Trys ###\n#### Keturi')).toEqual([
      { type: 'heading', level: 1, spans: [text('Vienas')] },
      { type: 'heading', level: 2, spans: [text('Du')] },
      { type: 'heading', level: 3, spans: [text('Trys')] },
      { type: 'heading', level: 3, spans: [text('Keturi')] },
    ]);
  });

  it('a hash with no space after it is prose — a hashtag, not a heading', () => {
    expect(parseMarkdown('#studentai')).toEqual([plain('#studentai')]);
  });

  it('a closed fence is a code block: language from the info string, body verbatim, no inline parsing', () => {
    expect(parseMarkdown('```python\nprint("*labas*")\n\nx = 1\n```')).toEqual([
      { type: 'code', language: 'python', code: 'print("*labas*")\n\nx = 1' },
    ]);
  });

  it('a fence with no info string has a null language', () => {
    expect(parseMarkdown('```\na\n```')).toEqual([{ type: 'code', language: null, code: 'a' }]);
  });

  it('a closer shorter than its opener does not close — the longer run does', () => {
    expect(parseMarkdown('````\n```\nstill code\n````')).toEqual([
      { type: 'code', language: null, code: '```\nstill code' },
    ]);
  });

  it('an unordered list, any of the three markers', () => {
    expect(parseMarkdown('- vienas\n* du\n+ trys')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { spans: [text('vienas')], nested: null },
          { spans: [text('du')], nested: null },
          { spans: [text('trys')], nested: null },
        ],
      },
    ]);
  });

  it('an ordered list starts at its first number, dot or paren delimited', () => {
    expect(parseMarkdown('7. septyni\n8) aštuoni')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 7,
        items: [
          { spans: [text('septyni')], nested: null },
          { spans: [text('aštuoni')], nested: null },
        ],
      },
    ]);
  });

  it('a marker of the other kind ends the list and opens its own', () => {
    expect(parseMarkdown('1. a\n- b')).toEqual([
      { type: 'list', ordered: true, start: 1, items: [{ spans: [text('a')], nested: null }] },
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('b')], nested: null }] },
    ]);
  });

  it('blank-separated items of the same kind stay one loose list — all-ones numbering counts on', () => {
    expect(parseMarkdown('- a\n\n- b')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { spans: [text('a')], nested: null },
          { spans: [text('b')], nested: null },
        ],
      },
    ]);
    expect(parseMarkdown('1. a\n\n\n1. b\n\n1. c')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: [
          { spans: [text('a')], nested: null },
          { spans: [text('b')], nested: null },
          { spans: [text('c')], nested: null },
        ],
      },
    ]);
  });

  it('a blank line still ends the list before prose or the other kind of marker', () => {
    expect(parseMarkdown('- a\n\nTekstas')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('a')], nested: null }] },
      plain('Tekstas'),
    ]);
    expect(parseMarkdown('- a\n\n1. b')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('a')], nested: null }] },
      { type: 'list', ordered: true, start: 1, items: [{ spans: [text('b')], nested: null }] },
    ]);
  });

  it('only "1." or "1)" interrupts a paragraph — a year at a line start is prose', () => {
    expect(parseMarkdown('Prasideda\n2025. rugsėjo 1 d.')).toEqual([plain('Prasideda\n2025. rugsėjo 1 d.')]);
    expect(parseMarkdown('Planas:\n1. pirmas')).toEqual([
      plain('Planas:'),
      { type: 'list', ordered: true, start: 1, items: [{ spans: [text('pirmas')], nested: null }] },
    ]);
    expect(parseMarkdown('Planas:\n1) pirmas')).toEqual([
      plain('Planas:'),
      { type: 'list', ordered: true, start: 1, items: [{ spans: [text('pirmas')], nested: null }] },
    ]);
  });

  it('after a blank line any number opens a list', () => {
    expect(parseMarkdown('Tekstas\n\n7. septyni')).toEqual([
      plain('Tekstas'),
      { type: 'list', ordered: true, start: 7, items: [{ spans: [text('septyni')], nested: null }] },
    ]);
  });

  it('an indented plain line continues the item above it on a line break', () => {
    expect(parseMarkdown('- pirma eilutė\n  antra eilutė\n- kitas')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { spans: [text('pirma eilutė\nantra eilutė')], nested: null },
          { spans: [text('kitas')], nested: null },
        ],
      },
    ]);
  });

  it('an unindented line after a list is a paragraph, not an item', () => {
    expect(parseMarkdown('- a\nTęsinys')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('a')], nested: null }] },
      plain('Tęsinys'),
    ]);
  });

  it('a blockquote holds blocks of its own, re-parsed', () => {
    expect(parseMarkdown('> # Citata\n> Tekstas su **žodžiu**\n>\n> Kita')).toEqual([
      {
        type: 'quote',
        blocks: [
          { type: 'heading', level: 1, spans: [text('Citata')] },
          paragraph(text('Tekstas su '), { type: 'bold', spans: [text('žodžiu')] }),
          plain('Kita'),
        ],
      },
    ]);
  });

  it('three or more dashes, stars or underscores make a rule, spaced or not', () => {
    expect(parseMarkdown('---\n\n* * *\n\n___')).toEqual([{ type: 'rule' }, { type: 'rule' }, { type: 'rule' }]);
  });

  it('a rule is told apart from a one-item list and from emphasis', () => {
    expect(parseMarkdown('- - -')).toEqual([{ type: 'rule' }]);
    expect(parseMarkdown('- vienas')).toEqual([
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('vienas')], nested: null }] },
    ]);
    expect(parseMarkdown('**a**')).toEqual([paragraph({ type: 'bold', spans: [text('a')] })]);
  });

  it('a block opener ends the paragraph before it without a blank line', () => {
    expect(parseMarkdown('Įžanga:\n- a\n# Antraštė\nTekstas')).toEqual([
      plain('Įžanga:'),
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('a')], nested: null }] },
      { type: 'heading', level: 1, spans: [text('Antraštė')] },
      plain('Tekstas'),
    ]);
  });
});


describe('inline', () => {
  it('bold with ** and with __', () => {
    expect(parseMarkdown('**a** ir __b__')).toEqual([
      paragraph({ type: 'bold', spans: [text('a')] }, text(' ir '), { type: 'bold', spans: [text('b')] }),
    ]);
  });

  it('italic with * and with _', () => {
    expect(parseMarkdown('*a* ir _b_')).toEqual([
      paragraph({ type: 'italic', spans: [text('a')] }, text(' ir '), { type: 'italic', spans: [text('b')] }),
    ]);
  });

  it('inline code keeps its characters raw and shaves one framing space', () => {
    expect(parseMarkdown('Rašyk `a * b` ir `` `x` ``')).toEqual([
      paragraph(text('Rašyk '), { type: 'code', text: 'a * b' }, text(' ir '), { type: 'code', text: '`x`' }),
    ]);
  });

  it('a link with a destination and no title', () => {
    expect(parseMarkdown('Žr. [VU KnF](https://knf.vu.lt).')).toEqual([
      paragraph(text('Žr. '), { type: 'link', url: 'https://knf.vu.lt', title: null, spans: [text('VU KnF')] }, text('.')),
    ]);
  });

  it('a link with a title, in double or single quotes', () => {
    expect(parseMarkdown('[a](https://a.lt "Pirmas") [b](https://b.lt \'Antras\')')).toEqual([
      paragraph(
        { type: 'link', url: 'https://a.lt', title: 'Pirmas', spans: [text('a')] },
        text(' '),
        { type: 'link', url: 'https://b.lt', title: 'Antras', spans: [text('b')] },
      ),
    ]);
  });

  it('a destination with balanced parens survives whole', () => {
    expect(parseMarkdown('[w](https://lt.wikipedia.org/wiki/Kaunas_(miestas))')).toEqual([
      paragraph({ type: 'link', url: 'https://lt.wikipedia.org/wiki/Kaunas_(miestas)', title: null, spans: [text('w')] }),
    ]);
  });

  it('a bracket without the link shape is prose — and so is an empty destination', () => {
    expect(parseMarkdown('[pastaba] ir [x]() ir [y](')).toEqual([plain('[pastaba] ir [x]() ir [y](')]);
  });

  it('stars around spaces and a lone pair are characters, not emphasis', () => {
    expect(parseMarkdown('2 * 3 * 4 ir ** ir ****')).toEqual([plain('2 * 3 * 4 ir ** ir ****')]);
  });

  it('a code span rides inside a link label; a link shape inside a code span stays literal', () => {
    expect(parseMarkdown('Žr. [`kodas`](https://x.lt)')).toEqual([
      paragraph(text('Žr. '), { type: 'link', url: 'https://x.lt', title: null, spans: [{ type: 'code', text: 'kodas' }] }),
    ]);
    expect(parseMarkdown('`[a](b)`')).toEqual([paragraph({ type: 'code', text: '[a](b)' })]);
  });

  it('unicode punctuation flanks emphasis the way ASCII punctuation does', () => {
    expect(parseMarkdown('„_taip_“ ir —*tikrai*—')).toEqual([
      paragraph(
        text('„'),
        { type: 'italic', spans: [text('taip')] },
        text('“ ir —'),
        { type: 'italic', spans: [text('tikrai')] },
        text('—'),
      ),
    ]);
  });
});


describe('nesting', () => {
  it('bold holds italic, code and a link', () => {
    expect(parseMarkdown('**a _b_ `c` [d](https://d.lt)**')).toEqual([
      paragraph({
        type: 'bold',
        spans: [
          text('a '),
          { type: 'italic', spans: [text('b')] },
          text(' '),
          { type: 'code', text: 'c' },
          text(' '),
          { type: 'link', url: 'https://d.lt', title: null, spans: [text('d')] },
        ],
      }),
    ]);
  });

  it('three stars are bold around italic', () => {
    expect(parseMarkdown('***abu***')).toEqual([
      paragraph({ type: 'bold', spans: [{ type: 'italic', spans: [text('abu')] }] }),
    ]);
  });

  it('same-marker emphasis inside emphasis closes on the outer marker', () => {
    expect(parseMarkdown('*a *b* c*')).toEqual([
      paragraph({ type: 'italic', spans: [text('a '), { type: 'italic', spans: [text('b')] }, text(' c')] }),
    ]);
  });

  it('bold holds italic between its own markers — **a *b* c**', () => {
    expect(parseMarkdown('**svarbu *labai* čia**')).toEqual([
      paragraph({ type: 'bold', spans: [text('svarbu '), { type: 'italic', spans: [text('labai')] }, text(' čia')] }),
    ]);
  });

  it('emphasis wraps a whole link — a _ or * inside the URL never closes it', () => {
    expect(parseMarkdown('_žr. [sąrašą](https://x.lt/a_b)_')).toEqual([
      paragraph({
        type: 'italic',
        spans: [text('žr. '), { type: 'link', url: 'https://x.lt/a_b', title: null, spans: [text('sąrašą')] }],
      }),
    ]);
    expect(parseMarkdown('*žr. [sąrašą](https://x.lt/a*b)*')).toEqual([
      paragraph({
        type: 'italic',
        spans: [text('žr. '), { type: 'link', url: 'https://x.lt/a*b', title: null, spans: [text('sąrašą')] }],
      }),
    ]);
  });

  it('a link label carries its own marks', () => {
    expect(parseMarkdown('[**svarbu**](https://x.lt)')).toEqual([
      paragraph({ type: 'link', url: 'https://x.lt', title: null, spans: [{ type: 'bold', spans: [text('svarbu')] }] }),
    ]);
  });

  it('a list nests one level under the item above; deeper indent joins that same level', () => {
    expect(parseMarkdown('1. a\n   - x\n      - y\n2. b')).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: [
          {
            spans: [text('a')],
            nested: {
              type: 'list',
              ordered: false,
              start: 1,
              items: [
                { spans: [text('x')], nested: null },
                { spans: [text('y')], nested: null },
              ],
            },
          },
          { spans: [text('b')], nested: null },
        ],
      },
    ]);
  });

  it('a quote can hold a list and a code block', () => {
    expect(parseMarkdown('> - a\n> - b\n>\n> ```\n> x\n> ```')).toEqual([
      {
        type: 'quote',
        blocks: [
          {
            type: 'list',
            ordered: false,
            start: 1,
            items: [
              { spans: [text('a')], nested: null },
              { spans: [text('b')], nested: null },
            ],
          },
          { type: 'code', language: null, code: 'x' },
        ],
      },
    ]);
  });
});


describe('escapes and word boundaries', () => {
  it('a backslash before punctuation yields the character, no construct', () => {
    expect(parseMarkdown('\\*ne kursyvas\\* ir \\`ne kodas\\` ir \\[ne nuoroda\\](x)')).toEqual([
      plain('*ne kursyvas* ir `ne kodas` ir [ne nuoroda](x)'),
    ]);
  });

  it('a backslash before a letter is a backslash', () => {
    expect(parseMarkdown('C:\\naujas')).toEqual([plain('C:\\naujas')]);
  });

  it('underscores inside a word are characters — snake_case stays whole', () => {
    expect(parseMarkdown('kintamasis snake_case_name ir _tikras_')).toEqual([
      paragraph(text('kintamasis snake_case_name ir '), { type: 'italic', spans: [text('tikras')] }),
    ]);
  });

  it('a star inside a word still opens emphasis', () => {
    expect(parseMarkdown('vien*as*')).toEqual([paragraph(text('vien'), { type: 'italic', spans: [text('as')] })]);
  });

  it('combining marks are word characters — NFD Lithuanian parses like NFC', () => {
    // In NFD the character before the first _ is a combining
    // macron; it must still glue the underscore into the word
    const decomposed = 'ačiū_labai_'.normalize('NFD');
    expect(parseMarkdown(decomposed)).toEqual([plain(decomposed)]);
    expect(parseMarkdown('ačiū_labai_')).toEqual([plain('ačiū_labai_')]);
  });
});


describe('streaming partials — open markers are text until closed', () => {
  it('an open ** is two characters; the closer makes it bold', () => {
    expect(parseMarkdown('Tai **svar')).toEqual([plain('Tai **svar')]);
    expect(parseMarkdown('Tai **svarbu**')).toEqual([paragraph(text('Tai '), { type: 'bold', spans: [text('svarbu')] })]);
  });

  it('an open _ is a character; the closer makes it italic', () => {
    expect(parseMarkdown('Tai _kurs')).toEqual([plain('Tai _kurs')]);
    expect(parseMarkdown('Tai _kursyvas_')).toEqual([paragraph(text('Tai '), { type: 'italic', spans: [text('kursyvas')] })]);
  });

  it('an open ` is a character; the closer makes it code', () => {
    expect(parseMarkdown('Vykdyk `npm sta')).toEqual([plain('Vykdyk `npm sta')]);
    expect(parseMarkdown('Vykdyk `npm start`')).toEqual([paragraph(text('Vykdyk '), { type: 'code', text: 'npm start' })]);
  });

  it('an open ``` fence is one plain paragraph, line breaks kept, no inline parsing inside', () => {
    expect(parseMarkdown('Pavyzdys:\n```js\nconst a = *1*;\nconst b')).toEqual([
      plain('Pavyzdys:'),
      plain('```js\nconst a = *1*;\nconst b'),
    ]);
  });

  it('an open fence inside a quote is one plain paragraph in the quote', () => {
    expect(parseMarkdown('> Pavyzdys:\n> ```\n> const a = *1*;')).toEqual([
      { type: 'quote', blocks: [plain('Pavyzdys:'), plain('```\nconst a = *1*;')] },
    ]);
  });

  it('the same fence closed is a code block', () => {
    expect(parseMarkdown('Pavyzdys:\n```js\nconst a = *1*;\nconst b\n```')).toEqual([
      plain('Pavyzdys:'),
      { type: 'code', language: 'js', code: 'const a = *1*;\nconst b' },
    ]);
  });

  it('a half-typed link is prose until its paren closes', () => {
    // The [label]( construct stays prose; the bare address after
    // it is a link on its own, like any bare URL (this pinned the
    // whole line as one text span before bare URLs autolinked —
    // mid-stream the open line is still all plain tail)
    const label = 'Žr. [VU](';
    expect(parseMarkdown(`${label}https://knf.vu`)).toEqual([
      paragraph(text(label), { type: 'link', url: 'https://knf.vu', title: null, spans: [text('https://knf.vu')] }),
    ]);
    expect(splitStreamingTail(`${label}https://knf.vu`)).toEqual({ settled: '', tail: `${label}https://knf.vu` });
    expect(parseMarkdown('Žr. [VU](https://knf.vu.lt)')).toEqual([
      paragraph(text('Žr. '), { type: 'link', url: 'https://knf.vu.lt', title: null, spans: [text('VU')] }),
    ]);
  });

  it('a bare marker line is prose until its content arrives', () => {
    expect(parseMarkdown('1.')).toEqual([plain('1.')]);
    expect(parseMarkdown('-')).toEqual([plain('-')]);
    expect(parseMarkdown('#')).toEqual([{ type: 'heading', level: 1, spans: [] }]);
  });
});


describe('input hygiene', () => {
  it('empty input, and blank-only input, parse to no blocks', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n  \n')).toEqual([]);
  });

  it('CRLF and lone CR line endings parse like LF', () => {
    const expected = [
      { type: 'heading', level: 1, spans: [text('A')] },
      { type: 'list', ordered: false, start: 1, items: [{ spans: [text('b')], nested: null }] },
      { type: 'code', language: null, code: 'c' },
    ];
    expect(parseMarkdown('# A\r\n- b\r\n\r\n```\r\nc\r\n```')).toEqual(expected);
    expect(parseMarkdown('# A\r- b\r\r```\rc\r```')).toEqual(expected);
  });

  it('trailing whitespace on a line is dropped, and leading prose indent too', () => {
    expect(parseMarkdown('Labas   \n   rytas\t')).toEqual([plain('Labas\nrytas')]);
    expect(parseMarkdown('# Antraštė   ')).toEqual([{ type: 'heading', level: 1, spans: [text('Antraštė')] }]);
  });

  it('adjacent characters merge into one text span', () => {
    const blocks = parseMarkdown('a\\*b ir ** c');
    expect(blocks).toEqual([plain('a*b ir ** c')]);
  });
});


describe('nesting cap — hostile depth parses, never overflows', () => {
  // How many quote levels wrap the innermost block
  const quoteDepth = (blocks: MarkdownBlock[]): number => {
    const [first] = blocks;
    return first && first.type === 'quote' ? 1 + quoteDepth(first.blocks) : 0;
  };

  // How many italic levels wrap the innermost span — each level
  // holds its letter as text beside the next italic
  const italicDepth = (spans: MarkdownInline[]): number => {
    const inner = spans.find((span) => span.type === 'italic');
    return inner && inner.type === 'italic' ? 1 + italicDepth(inner.spans) : 0;
  };

  it('two thousand nested quotes stop at the cap; the rest is one prose line', () => {
    const blocks = parseMarkdown(`${'> '.repeat(2000)}x`);
    expect(quoteDepth(blocks)).toBe(8);
    let inner = blocks;
    for (let i = 0; i < 8; i += 1) inner = (inner[0] as { type: 'quote'; blocks: MarkdownBlock[] }).blocks;
    expect(inner).toEqual([plain(`${'> '.repeat(1992)}x`)]);
  });

  it('five thousand emphasis openers with no closer are one text span', () => {
    const wall = '*a '.repeat(5000).trimEnd();
    expect(parseMarkdown(wall)).toEqual([plain(wall)]);
  });

  it('emphasis nested past the cap keeps the outer levels and reads the rest as characters', () => {
    const letters = 'abcdefghijkl';
    const open = [...letters].map((l) => `*${l}`).join(' ');
    const close = [...letters].reverse().map((l) => `${l}*`).join(' ');
    const blocks = parseMarkdown(`${open} ${close}`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    const depth = italicDepth((blocks[0] as { type: 'paragraph'; spans: MarkdownInline[] }).spans);
    expect(depth).toBeGreaterThanOrEqual(8);
    expect(depth).toBeLessThanOrEqual(10);
  });
});


describe('splitStreamingTail', () => {
  it('a lone open line with an open marker is all tail', () => {
    expect(splitStreamingTail('Labas **pas')).toEqual({ settled: '', tail: 'Labas **pas' });
  });

  it('a construct-free open line is the tail, the newline stays with the settled half', () => {
    expect(splitStreamingTail('# A\n- b\n- c')).toEqual({ settled: '# A\n- b\n', tail: '- c' });
  });

  it('a closed construct on the open line settles; the plain suffix after it is the tail', () => {
    expect(splitStreamingTail('Tai **svarbu** ir')).toEqual({ settled: 'Tai **svarbu**', tail: ' ir' });
    expect(splitStreamingTail('Žr. [VU](https://knf.vu.lt) ir **at')).toEqual({
      settled: 'Žr. [VU](https://knf.vu.lt)',
      tail: ' ir **at',
    });
  });

  it('a * pair closing at the very end settles; _ and ` there wait for the next character', () => {
    // "_a_" + "x" is prose again, "`a`" + "`" re-opens the
    // span — a * closer cannot be undone by what follows it
    expect(splitStreamingTail('Tai *svarbu*')).toEqual({ settled: 'Tai *svarbu*', tail: '' });
    expect(splitStreamingTail('Tai **svarbu**')).toEqual({ settled: 'Tai **svarbu**', tail: '' });
    expect(splitStreamingTail('Tai _svarbu_')).toEqual({ settled: '', tail: 'Tai _svarbu_' });
    expect(splitStreamingTail('Vykdyk `npm start`')).toEqual({ settled: '', tail: 'Vykdyk `npm start`' });
  });

  it('an early unbalanced opener holds the whole line — later pairs may yet nest inside it', () => {
    expect(splitStreamingTail('*a ir **b**')).toEqual({ settled: '', tail: '*a ir **b**' });
  });

  it('an open ` inside a closed pair holds the line — its closer could swallow the emphasis', () => {
    expect(splitStreamingTail('*a `x* b')).toEqual({ settled: '', tail: '*a `x* b' });
  });

  it('a text ending on a newline has no tail', () => {
    expect(splitStreamingTail('# A\n- b\n')).toEqual({ settled: '# A\n- b\n', tail: '' });
    expect(splitStreamingTail('')).toEqual({ settled: '', tail: '' });
  });

  it('an open fence pulls the tail back to its opener', () => {
    expect(splitStreamingTail('Kodas:\n```js\nconst a = 1;\nconst b')).toEqual({
      settled: 'Kodas:\n',
      tail: '```js\nconst a = 1;\nconst b',
    });
  });

  it('a closing fence as the last line is settled, newline or not', () => {
    expect(splitStreamingTail('```\nx\n```')).toEqual({ settled: '```\nx\n```', tail: '' });
    expect(splitStreamingTail('```\nx\n```\n')).toEqual({ settled: '```\nx\n```\n', tail: '' });
  });

  it('a fence closed earlier does not hold the tail; a shorter closer does not close', () => {
    expect(splitStreamingTail('```\nx\n```\nPo to **te')).toEqual({ settled: '```\nx\n```\n', tail: 'Po to **te' });
    expect(splitStreamingTail('````\n```\nvis dar')).toEqual({ settled: '', tail: '````\n```\nvis dar' });
  });

  it('CRLF input comes back LF on both halves', () => {
    expect(splitStreamingTail('a\r\nb\r\nc')).toEqual({ settled: 'a\nb\n', tail: 'c' });
  });

  it('the settled half re-parses as a prefix of the final tree', () => {
    const full = '# A\n\n- b\n- c **d';
    const { settled } = splitStreamingTail(full);
    expect(parseMarkdown(settled)).toEqual(parseMarkdown('# A\n\n- b\n'));
  });
});


describe('appendStreamTail — the mid-line tail joins the last leaf', () => {
  it('a paragraph takes the tail as a trailing text span', () => {
    const blocks = parseMarkdown('Tai **svarbu**');
    expect(appendStreamTail(blocks, ' ir')).toBe(true);
    expect(blocks).toEqual([paragraph(text('Tai '), { type: 'bold', spans: [text('svarbu')] }, text(' ir'))]);
  });

  it('a heading and a quote take it on their last leaf', () => {
    const heading = parseMarkdown('# Planas **A**');
    expect(appendStreamTail(heading, ' ir B')).toBe(true);
    expect(heading).toEqual([
      { type: 'heading', level: 1, spans: [text('Planas '), { type: 'bold', spans: [text('A')] }, text(' ir B')] },
    ]);

    const quote = parseMarkdown('> Tai **svarbu**');
    expect(appendStreamTail(quote, ' ir')).toBe(true);
    expect(quote).toEqual([
      { type: 'quote', blocks: [paragraph(text('Tai '), { type: 'bold', spans: [text('svarbu')] }, text(' ir'))] },
    ]);
  });

  it('a list takes it on its last item — the nested one when a nested list is open', () => {
    const flat = parseMarkdown('- a\n- **b**');
    expect(appendStreamTail(flat, ' ir c')).toBe(true);
    expect(flat).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { spans: [text('a')], nested: null },
          { spans: [{ type: 'bold', spans: [text('b')] }, text(' ir c')], nested: null },
        ],
      },
    ]);

    const nested = parseMarkdown('1. a\n   - **x**');
    expect(appendStreamTail(nested, ' ir y')).toBe(true);
    expect(nested).toEqual([
      {
        type: 'list',
        ordered: true,
        start: 1,
        items: [
          {
            spans: [text('a')],
            nested: {
              type: 'list',
              ordered: false,
              start: 1,
              items: [{ spans: [{ type: 'bold', spans: [text('x')] }, text(' ir y')], nested: null }],
            },
          },
        ],
      },
    ]);
  });

  it('an empty tree and a code block refuse — the caller keeps the tail on its own', () => {
    expect(appendStreamTail([], 'x')).toBe(false);
    const code = parseMarkdown('```\na\n```');
    expect(appendStreamTail(code, 'x')).toBe(false);
    expect(code).toEqual([{ type: 'code', language: null, code: 'a' }]);
  });
});


describe('KNF-161 — a nested list that switches marker kind', () => {
  it('bullets after a numbered run are a list of their own, never steps 2 and 3', () => {
    expect(parseMarkdown('- Dokumentai:\n  1. prašymas\n  - pažyma apie studijas\n  - asmens dokumentas')).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            spans: [text('Dokumentai:')],
            nested: {
              type: 'list',
              ordered: true,
              start: 1,
              items: [{ spans: [text('prašymas')], nested: null }],
              next: {
                type: 'list',
                ordered: false,
                start: 1,
                items: [
                  { spans: [text('pažyma apie studijas')], nested: null },
                  { spans: [text('asmens dokumentas')], nested: null },
                ],
              },
            },
          },
        ],
      },
    ]);
  });

  it('numbered steps after a bullet keep their numbers — counted from their own start', () => {
    const [list] = parseMarkdown('1. Žingsniai:\n  - vienas\n  2. du\n  3. trys') as [Extract<MarkdownBlock, { type: 'list' }>];
    const nested = list.items[0].nested!;
    expect(nested.ordered).toBe(false);
    expect(nested.items.map((item) => item.spans)).toEqual([[text('vienas')]]);
    expect(nested.next).toMatchObject({ ordered: true, start: 2 });
    expect(nested.next!.items.map((item) => item.spans)).toEqual([[text('du')], [text('trys')]]);
    expect(nested.next!.next).toBeUndefined();
  });

  it('a single-kind nested list carries no `next` at all', () => {
    const [list] = parseMarkdown('- a\n  - x\n  - y') as [Extract<MarkdownBlock, { type: 'list' }>];
    expect(list.items[0].nested).not.toHaveProperty('next');
  });

  it('continuation prose and the streaming tail join the LAST list of the chain', () => {
    const blocks = parseMarkdown('- a\n  1. x\n  - y\n    tęsinys');
    const nested = (blocks[0] as Extract<MarkdownBlock, { type: 'list' }>).items[0].nested!;
    expect(nested.next!.items[0].spans).toEqual([text('y\ntęsinys')]);
    expect(appendStreamTail(blocks, ' ir z')).toBe(true);
    expect(nested.next!.items[0].spans).toEqual([text('y\ntęsinys'), text(' ir z')]);
  });
});


// Realistic replies, streamed character by character through
// the same seam MarkdownText uses
const REPLIES = [
  '# Stipendijos\n\nStipendija skiriama pagal **vidurkį**.\n\n1. Pateikite prašymą.\n\n1. Laukite sprendimo.\n\n- pastaba\n  1. vienas\n  - du\n\nDaugiau: [VU](https://vu.lt).',
  'Failai: *.pdf, *.docx arba *.xlsx.\n\n```js\nconst a = "*x*";\n\nlet b;\n```\n\n> Citata\n> - su sąrašu\n\n| Diena | Laikas |\n|---|---:|\n| Pirmadienis | 9:00 |\n\nPabaiga su `kodu`.',
  'Eilutė viena\r\nEilutė dvi\r\n\r\n---\r\n\r\n- a\r\n\r\n- b\r\n\r\nTekstas po sąrašo.',
  'Daugiau: https://knf.vu.lt/studentams_(info). Rašykite knf@knf.vu.lt arba <https://vu.lt>.\n\n- **Svarbu:** https://x.lt/a_b_',
];

describe('createStreamingParser — KNF-088', () => {
  it.each(REPLIES.map((reply, index) => [index, reply]))('equals parseMarkdown on every prefix of reply %i', (_index, reply) => {
    const parse = createStreamingParser();
    for (let end = 1; end <= reply.length; end += 1) {
      const settled = splitStreamingTail(reply.slice(0, end)).settled;
      expect(parse(settled)).toEqual(parseMarkdown(settled));
    }
  });

  it('reuses the blocks before its last boundary — the history is not re-parsed', () => {
    const parse = createStreamingParser();
    const first = parse('# Antraštė\n\nPirma pastraipa.\n\nAntra');
    const second = parse('# Antraštė\n\nPirma pastraipa.\n\nAntra pastraipa auga');
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).toEqual(plain('Antra pastraipa auga'));
  });

  it('a text that is not an extension drops the cache and parses whole', () => {
    const parse = createStreamingParser();
    parse('Pirma.\n\nAntra.');
    expect(parse('Kita.\n\nVisai.')).toEqual(parseMarkdown('Kita.\n\nVisai.'));
  });

  it('the tail splice on its result never leaks into the cache', () => {
    const parse = createStreamingParser();
    const source = 'Pirma.\n\nAntra';
    expect(appendStreamTail(parse(source), ' LIKUTIS')).toBe(true);
    expect(parse(source)).toEqual(parseMarkdown(source));
  });

  it('a loose list is never cut at its blank lines — the numbering counts on', () => {
    const parse = createStreamingParser();
    const reply = '1. vienas\n\n1. du\n\n1. trys';
    parse('1. vienas\n\n1. du');
    expect(parse(reply)).toEqual(parseMarkdown(reply));
    expect(parse(reply)).toHaveLength(1);
  });
});


describe('KNF-088 — an opener with no possible closer is text at once', () => {
  it('a paragraph of unclosed stars parses in linear time', () => {
    const hostile = '*a '.repeat(4000);
    const started = Date.now();
    const blocks = parseMarkdown(hostile);
    // Quadratic, this was ~0.5 s on a server CPU (4x per doubling);
    // bounded, it is a few ms — the ceiling only catches a
    // regression, never a slow CI box
    expect(Date.now() - started).toBeLessThan(250);
    expect(blocks).toEqual([plain(hostile.trim())]);
  });

  it('file globs stay literal, and real emphasis around them still parses', () => {
    expect(parseMarkdown('Failai *.pdf, *.docx arba *.xlsx formatu')).toEqual([plain('Failai *.pdf, *.docx arba *.xlsx formatu')]);
    expect(parseMarkdown('*.pdf ir *svarbu* ir *.doc')).toEqual([
      paragraph(text('*.pdf ir '), { type: 'italic', spans: [text('svarbu')] }, text(' ir *.doc')),
    ]);
  });

  it('a star inside a code span or escaped still closes nothing', () => {
    expect(parseMarkdown('*a `b*` c')).toEqual([paragraph(text('*a '), { type: 'code', text: 'b*' }, text(' c'))]);
    expect(parseMarkdown('*a \\* c')).toEqual([plain('*a * c')]);
  });
});


describe('bare addresses are links of their own', () => {
  const link = (url: string, shown = url): MarkdownInline => ({ type: 'link', url, title: null, spans: [text(shown)] });

  it('a bare URL links whole, the sentence punctuation stays outside', () => {
    expect(parseMarkdown('Daugiau: https://knf.vu.lt/studentams.')).toEqual([
      paragraph(text('Daugiau: '), link('https://knf.vu.lt/studentams'), text('.')),
    ]);
    expect(parseMarkdown('(žr. https://vu.lt), ir „https://knf.vu.lt“')).toEqual([
      paragraph(text('(žr. '), link('https://vu.lt'), text('), ir „'), link('https://knf.vu.lt'), text('“')),
    ]);
  });

  it('a URL keeps its own balanced parens and underscores — no emphasis inside it', () => {
    expect(parseMarkdown('https://lt.wikipedia.org/wiki/Kaunas_(miestas) ir _x_')).toEqual([
      paragraph(link('https://lt.wikipedia.org/wiki/Kaunas_(miestas)'), text(' ir '), { type: 'italic', spans: [text('x')] }),
    ]);
    expect(parseMarkdown('https://x.lt/_a_b_')).toEqual([paragraph(link('https://x.lt/_a_b_'))]);
  });

  it('<…> wraps drop their brackets; a scheme alone, or glued to a word, is text', () => {
    expect(parseMarkdown('Nuoroda <https://vu.lt/a?b=1>')).toEqual([paragraph(text('Nuoroda '), link('https://vu.lt/a?b=1'))]);
    expect(parseMarkdown('https:// ir xhttps://vu.lt')).toEqual([plain('https:// ir xhttps://vu.lt')]);
  });

  it('an e-mail address is a mailto link; the period after it is text', () => {
    expect(parseMarkdown('Rašykite knf@knf.vu.lt arba studijos@knf.vu.lt.')).toEqual([
      paragraph(text('Rašykite '), link('mailto:knf@knf.vu.lt', 'knf@knf.vu.lt'), text(' arba '),
                link('mailto:studijos@knf.vu.lt', 'studijos@knf.vu.lt'), text('.')),
    ]);
  });

  it('no link inside a link label, none inside code — and bold keeps its links', () => {
    expect(parseMarkdown('[https://vu.lt](https://vu.lt)')).toEqual([
      paragraph({ type: 'link', url: 'https://vu.lt', title: null, spans: [text('https://vu.lt')] }),
    ]);
    expect(parseMarkdown('`https://vu.lt` ir `a@b.lt`')).toEqual([
      paragraph({ type: 'code', text: 'https://vu.lt' }, text(' ir '), { type: 'code', text: 'a@b.lt' }),
    ]);
    expect(parseMarkdown('**https://vu.lt**')).toEqual([paragraph({ type: 'bold', spans: [link('https://vu.lt')] })]);
  });
});
