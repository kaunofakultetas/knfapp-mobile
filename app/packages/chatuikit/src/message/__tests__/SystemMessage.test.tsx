// -----------------------------------------------------------
//  [*] Tests — system rows and ghost quotes read right
//
//  A system row words its EVENT in the provider's language
//  with its sender as the actor (the stored prose is only the
//  fallback — KNF-126), and a ghost quote (the quoted row
//  expired away, no sender left) reads as its snippet alone,
//  never "null: …" (KNF-163).
// -----------------------------------------------------------

import { render } from '@testing-library/react-native';

import type { KitMessage, KitReply } from '../../core/types';
import { ChatUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import ReplyQuote from '../ReplyQuote';
import SystemMessage from '../SystemMessage';







// -----------------------------------------------------------
// system
// -----------------------------------------------------------
//
// A system row from Ona, with overrides.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

const system = (over: Partial<KitMessage>): KitMessage => ({
  id: 's1', senderId: 'u2', senderName: 'Ona', text: 'Ona sukūrė grupę „KNF“', createdAt: '2026-09-19T10:00:00Z', isOwn: false, status: 'read', reactions: [], kind: 'system', ...over,
});


describe('SystemMessage', () => {
  it('words the event in the reader\'s language, not the stored Lithuanian', async () => {
    const { getByText, queryByText } = await render(
      <ChatUiKitProvider locale="en">
        <SystemMessage message={system({ system: { event: 'group_created', title: 'KNF' } })} />
      </ChatUiKitProvider>,
    );
    expect(getByText('Ona created the group “KNF”')).toBeTruthy();
    expect(queryByText('Ona sukūrė grupę „KNF“')).toBeNull();
  });

  it('counts the disappearing window in Lithuanian', async () => {
    const { getByText } = await render(
      <ChatUiKitProvider locale="lt">
        <SystemMessage message={system({ text: 'x', system: { event: 'ttl_on', seconds: 604800 } })} />
      </ChatUiKitProvider>,
    );
    expect(getByText('Ona įjungė nykstančias žinutes (7 dienos)')).toBeTruthy();
  });

  it('a row without an event, or with an unknown one, shows its stored text', async () => {
    const legacy = await render(
      <ChatUiKitProvider locale="en">
        <SystemMessage message={system({ text: 'Ona paliko pokalbį' })} />
      </ChatUiKitProvider>,
    );
    expect(legacy.getByText('Ona paliko pokalbį')).toBeTruthy();
    const unknown = await render(
      <ChatUiKitProvider locale="en">
        <SystemMessage message={system({ text: 'Ona pervadino grupę', system: { event: 'renamed' } })} />
      </ChatUiKitProvider>,
    );
    expect(unknown.getByText('Ona pervadino grupę')).toBeTruthy();
  });
});


describe('ReplyQuote ghost', () => {
  it('a quote with no sender left reads as its snippet alone', async () => {
    const ghost: KitReply = { id: 'gone', senderId: '', senderName: '', text: '', deleted: true, kind: 'text' };
    const { getByLabelText, queryByText } = await render(
      <ChatUiKitProvider locale="en">
        <ReplyQuote reply={ghost} own={false} labels={defaultLabels.en} onPress={() => {}} />
      </ChatUiKitProvider>,
    );
    expect(getByLabelText('Message deleted')).toBeTruthy();
    expect(queryByText('null')).toBeNull();
  });

  it('a live quote still names its sender', async () => {
    const quote: KitReply = { id: 'q', senderId: 'u3', senderName: 'Vida', text: 'labas', deleted: false };
    const { getByLabelText } = await render(
      <ChatUiKitProvider locale="en">
        <ReplyQuote reply={quote} own={false} labels={defaultLabels.en} onPress={() => {}} />
      </ChatUiKitProvider>,
    );
    expect(getByLabelText('Vida: labas')).toBeTruthy();
  });
});
