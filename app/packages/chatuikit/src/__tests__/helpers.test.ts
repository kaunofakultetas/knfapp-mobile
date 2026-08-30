// -----------------------------------------------------------
//  [*] Tests — chatuikit: menu registry, message kinds, link kinds
//
//  The pure halves of the stage-1 additions: buildMenuRows
//  (host actions between Copy and Delete, filtered by
//  `visible`, destructive last), messageKind resolution, and
//  linkify's e-mail / phone detection alongside URLs.
// -----------------------------------------------------------

import { buildMenuRows, defaultLabels, floatingDayFor, linkify, messageKind, type KitMessage } from '../index';


const message: KitMessage = {
  id: 'm1', senderId: 'ona', senderName: 'Ona', text: 'labas', createdAt: new Date().toISOString(),
  isOwn: false, status: 'sent', reactions: [],
};
const noop = () => {};


describe('buildMenuRows', () => {
  it('orders the kit rows around the host actions, destructive last', () => {
    const rows = buildMenuRows(message, {
      showReply: true, hasText: true, showDelete: true, labels: defaultLabels.en,
      actions: [{ id: 'report', label: 'Report', icon: 'flag-outline', onPress: noop }],
      onReply: noop, onCopy: noop, onDelete: noop,
    });
    expect(rows.map((r) => r.key)).toEqual(['reply', 'copy', 'report', 'delete']);
    expect(rows[3].danger).toBe(true);
  });

  it("honours a host action's visibility predicate and hands it the message", () => {
    const seen: string[] = [];
    const rows = buildMenuRows(message, {
      showReply: false, hasText: false, showDelete: false, labels: defaultLabels.lt,
      actions: [
        { id: 'own-only', label: 'x', icon: 'flag-outline', visible: (m) => m.isOwn, onPress: noop },
        { id: 'report', label: 'Pranešti', icon: 'flag-outline', onPress: (m) => seen.push(m.id) },
      ],
      onReply: noop, onCopy: noop, onDelete: noop,
    });
    expect(rows.map((r) => r.key)).toEqual(['report']);
    rows[0].onPress();
    expect(seen).toEqual(['m1']);
  });
});


describe('messageKind', () => {
  it('resolves the implicit kinds and respects an explicit one', () => {
    expect(messageKind(message)).toBe('text');
    expect(messageKind({ ...message, imageUrl: '/api/uploads/a.jpg' })).toBe('image');
    expect(messageKind({ ...message, file: { name: 'a.pdf', uri: 'https://x/a.pdf' } })).toBe('file');
    expect(messageKind({ ...message, kind: 'system' })).toBe('system');
  });
});


describe('linkify — e-mail and phone', () => {
  it('links an address as mailto without also linking its domain', () => {
    const links = linkify('rašyk man: ona@knf.vu.lt, ačiū').filter((s) => s.type === 'link');
    expect(links).toEqual([{ type: 'link', value: 'ona@knf.vu.lt', href: 'mailto:ona@knf.vu.lt', kind: 'email' }]);
  });

  it('links an international number as tel with the digits only', () => {
    const links = linkify('skambink +370 612 34567 rytoj').filter((s) => s.type === 'link');
    expect(links).toEqual([{ type: 'link', value: '+370 612 34567', href: 'tel:+37061234567', kind: 'phone' }]);
  });

  it('leaves short or bare digit runs alone and keeps URLs as url', () => {
    expect(linkify('kaina 12 34').every((s) => s.type === 'text')).toBe(true);
    const links = linkify('žr. knf.vu.lt ir +1 2').filter((s) => s.type === 'link');
    expect(links).toEqual([{ type: 'link', value: 'knf.vu.lt', href: 'https://knf.vu.lt', kind: 'url' }]);
  });
});


describe('floatingDayFor', () => {
  const labels = { today: 'Šiandien', yesterday: 'Vakar', locale: 'lt' };

  it('uses a separator\'s own day, a message\'s day label, and nothing for the unread line', () => {
    expect(floatingDayFor({ type: 'separator', key: 's', day: 'Vakar', time: '15:30' }, labels)).toBe('Vakar');
    expect(floatingDayFor({ type: 'separator', key: 's', day: '', time: '15:30' }, labels)).toBe('15:30');
    expect(floatingDayFor({ type: 'unread', key: 'unread', count: 3 }, labels)).toBe('');
    const today = { ...message, createdAt: new Date().toISOString() };
    expect(floatingDayFor({ type: 'message', key: 'm', message: today, position: 'single' }, labels)).toBe('Šiandien');
  });
});
