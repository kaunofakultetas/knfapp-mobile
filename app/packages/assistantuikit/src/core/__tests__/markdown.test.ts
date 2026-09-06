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
//  table.
// -----------------------------------------------------------

import { appendStreamTail, parseMarkdown, splitStreamingTail, type MarkdownBlock, type MarkdownInline } from '../markdown';

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
    expect(parseMarkdown('Žr. [VU](https://knf.vu')).toEqual([plain('Žr. [VU](https://knf.vu')]);
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
