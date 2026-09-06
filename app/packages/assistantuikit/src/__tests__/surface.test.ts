// -----------------------------------------------------------
//  [*] Tests — the public surface, pinned
//
//  A new export is a deliberate act: it must land here first.
//  Runtime names are compared exactly; type-only exports leave
//  no runtime trace, so the label set and the tool-card
//  contract are pinned as annotations the host's tsc run
//  refuses to compile without. The markdown renderer is
//  stubbed so the pin does not depend on its file.
// -----------------------------------------------------------

import * as pkg from '../index';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

describe('@knf/assistantuikit surface', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(pkg).sort()).toEqual([
      'AssistantComposer',
      'AssistantErrorBanner',
      'AssistantKitProvider',
      'AssistantMessage',
      'AssistantThread',
      'MarkdownText',
      'ToolCardShell',
      'TypingIndicator',
      'defaultColors',
      'parseMarkdown',
    ]);
  });

  it('ships the neutral palette with every token', () => {
    expect(Object.keys(pkg.defaultColors).sort()).toEqual([
      'brand',
      'danger',
      'ink',
      'inkSoft',
      'line',
      'onBrand',
      'surface',
      'surfaceSoft',
    ]);
  });

  it('types the label set and the tool-card contract', () => {
    const labels: pkg.AssistantLabels = {
      placeholder: 'p',
      send: 's',
      cancel: 'c',
      retry: 'r',
      copy: 'k',
      copied: 'kk',
      regenerate: 'g',
      thinking: 't',
      emptyTitle: 'et',
      emptyBody: 'eb',
      errorTitle: 'rt',
      errorBody: 'rb',
      toolRunning: 'tr',
      toolDone: 'td',
      toolFailed: 'tf',
      showDetails: 'sd',
      hideDetails: 'hd',
      previousBranch: 'pb',
      nextBranch: 'nb',
      scrollToLatest: 'sl',
    };
    const renderer: pkg.ToolCardRenderer = (part: pkg.ToolCardPart) => (part.status === 'done' ? null : null);
    const suggestion: pkg.AssistantSuggestion = { title: 't', prompt: 'p' };
    const status: pkg.ToolCardStatus = 'running';
    expect(Object.keys(labels)).toHaveLength(20);
    expect(renderer({ toolName: 'x', input: {}, status })).toBeNull();
    expect(suggestion.description).toBeUndefined();
  });
});
