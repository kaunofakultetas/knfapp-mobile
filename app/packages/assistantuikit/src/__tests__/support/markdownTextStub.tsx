// -----------------------------------------------------------
//  [*] Test support — the markdown renderer, stubbed
//
//  The suites in this folder pin the bubbles, not the
//  markdown, so the renderer is swapped for one Text that
//  shows the raw string and reports the streaming flag it was
//  handed through its testID — 'markdown-streaming' while the
//  part still arrives, 'markdown-settled' once it landed. Each
//  suite installs it with jest.mock('../MarkdownText', () =>
//  jest.requireActual('./support/markdownTextStub')); the
//  renderer's own suite runs against the real file.
// -----------------------------------------------------------

import { Text } from 'react-native';


export default function MarkdownTextStub({ text, isStreaming = false }: { text: string; isStreaming?: boolean }) {
  return <Text testID={isStreaming ? 'markdown-streaming' : 'markdown-settled'}>{text}</Text>;
}
