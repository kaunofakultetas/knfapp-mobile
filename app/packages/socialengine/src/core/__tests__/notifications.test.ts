// -----------------------------------------------------------
//  [*] Tests — @knf/socialengine notification grouping
//
//  One case per rule: which kinds merge, the kind + subject +
//  window match, actor dedupe / order / cap, the all-read
//  flag, the newest-member key, and the sorted output over an
//  untrusted input order.
// -----------------------------------------------------------

import { groupNotifications } from '../notifications';
import type { SocialNotification, SocialUser } from '../types';


const HOUR = 60 * 60 * 1000;
const BASE = Date.parse('2026-03-01T12:00:00.000Z');

const user = (id: string): SocialUser => ({ id, displayName: `User ${id}` });

// hoursBack keeps stamps readable: at(0) is newest, at(49) is
// just past the default 48 h window
const at = (hoursBack: number) => new Date(BASE - hoursBack * HOUR).toISOString();

const row = (id: string, over: Partial<SocialNotification> = {}): SocialNotification => ({
  id,
  kind: 'like',
  actor: user(`actor-${id}`),
  createdAt: at(0),
  read: false,
  subjectId: 'post-1',
  ...over,
});

describe('groupNotifications', () => {
  it('merges likes on the same subject into one group', () => {
    const groups = groupNotifications([row('n1'), row('n2', { createdAt: at(1) })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].notifications.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(groups[0].actors.map((a) => a.id)).toEqual(['actor-n1', 'actor-n2']);
  });

  it('merges connect_accept rows by default', () => {
    const groups = groupNotifications([
      row('n1', { kind: 'connect_accept', subjectId: null }),
      row('n2', { kind: 'connect_accept', subjectId: null, createdAt: at(1) }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('content-bearing and actionable kinds never merge', () => {
    for (const kind of ['comment', 'reply', 'mention', 'connect_request'] as const) {
      const groups = groupNotifications([row('n1', { kind }), row('n2', { kind, createdAt: at(1) })]);
      expect(groups).toHaveLength(2);
    }
  });

  it('an unknown extension kind stands alone by default', () => {
    const groups = groupNotifications([row('n1', { kind: 'wave' }), row('n2', { kind: 'wave', createdAt: at(1) })]);
    expect(groups).toHaveLength(2);
  });

  it('groupableKinds overrides the default in both directions', () => {
    const list = [
      row('c1', { kind: 'comment' }),
      row('c2', { kind: 'comment', createdAt: at(1) }),
      row('l1', { kind: 'like', subjectId: 'post-2', createdAt: at(2) }),
      row('l2', { kind: 'like', subjectId: 'post-2', createdAt: at(3) }),
    ];
    const groups = groupNotifications(list, { groupableKinds: ['comment'] });
    // Comments now merge; likes lost their groupability
    expect(groups.map((g) => g.notifications.length)).toEqual([2, 1, 1]);
  });

  it('a different kind never merges even on the same subject', () => {
    const groups = groupNotifications([row('n1'), row('n2', { kind: 'connect_accept', createdAt: at(1) })]);
    expect(groups).toHaveLength(2);
  });

  it('a different subject never merges', () => {
    const groups = groupNotifications([row('n1'), row('n2', { subjectId: 'post-2', createdAt: at(1) })]);
    expect(groups).toHaveLength(2);
  });

  it('a missing subject is its own bucket, not a wildcard', () => {
    const groups = groupNotifications([row('n1'), row('n2', { subjectId: null, createdAt: at(1) })]);
    expect(groups).toHaveLength(2);
  });

  it('merges within the default 48 h window and splits beyond it', () => {
    expect(groupNotifications([row('n1'), row('n2', { createdAt: at(47) })])).toHaveLength(1);
    expect(groupNotifications([row('n1'), row('n2', { createdAt: at(49) })])).toHaveLength(2);
  });

  it('measures the window from the group NEWEST member, not the previous row', () => {
    // 40 h steps chain within 48 h of each NEIGHBOUR, but the
    // third row trails the group's newest by 80 h — new group
    const groups = groupNotifications([row('n1'), row('n2', { createdAt: at(40) }), row('n3', { createdAt: at(80) })]);
    expect(groups.map((g) => g.notifications.map((n) => n.id))).toEqual([['n1', 'n2'], ['n3']]);
  });

  it('honours a custom windowMs', () => {
    const groups = groupNotifications([row('n1'), row('n2', { createdAt: at(2) })], { windowMs: HOUR });
    expect(groups).toHaveLength(2);
  });

  it('a repeat actor lists once while every notification is kept', () => {
    const twice = user('actor-x');
    const groups = groupNotifications([row('n1', { actor: twice }), row('n2', { actor: twice, createdAt: at(1) })]);
    expect(groups[0].actors).toEqual([twice]);
    expect(groups[0].notifications).toHaveLength(2);
  });

  it('orders actors newest-first and caps them at maxActors', () => {
    const list = [0, 1, 2, 3, 4, 5, 6].map((h) => row(`n${h}`, { createdAt: at(h) }));
    const groups = groupNotifications(list);
    expect(groups).toHaveLength(1);
    // Default cap 5 trims the list; the originals all survive
    expect(groups[0].actors.map((a) => a.id)).toEqual(['actor-n0', 'actor-n1', 'actor-n2', 'actor-n3', 'actor-n4']);
    expect(groups[0].notifications).toHaveLength(7);

    const capped = groupNotifications(list, { maxActors: 2 });
    expect(capped[0].actors.map((a) => a.id)).toEqual(['actor-n0', 'actor-n1']);
    expect(capped[0].notifications).toHaveLength(7);
  });

  it('reads as read only when EVERY member is read', () => {
    const mixed = groupNotifications([row('n1', { read: true }), row('n2', { read: false, createdAt: at(1) })]);
    expect(mixed[0].read).toBe(false);
    const all = groupNotifications([row('n1', { read: true }), row('n2', { read: true, createdAt: at(1) })]);
    expect(all[0].read).toBe(true);
  });

  it('keys the group by its newest member id', () => {
    const groups = groupNotifications([row('older', { createdAt: at(3) }), row('newest')]);
    expect(groups[0].key).toBe('newest');
    expect(groups[0].newestAt).toBe(at(0));
  });

  it('sorts output newest-first without trusting input order', () => {
    // Shuffled input across three subjects — output follows
    // createdAt, and members inside a group land newest-first
    const list = [
      row('mid', { subjectId: 'b', createdAt: at(5) }),
      row('old', { subjectId: 'c', createdAt: at(9) }),
      row('new2', { subjectId: 'a', createdAt: at(1) }),
      row('new1', { subjectId: 'a', createdAt: at(0) }),
    ];
    const groups = groupNotifications([...list].reverse());
    expect(groups.map((g) => g.key)).toEqual(['new1', 'mid', 'old']);
    expect(groups[0].notifications.map((n) => n.id)).toEqual(['new1', 'new2']);
  });

  it('carries the newest subjectPreview, filling from older members', () => {
    const groups = groupNotifications([row('n1', { subjectPreview: null }), row('n2', { subjectPreview: 'the post text', createdAt: at(1) })]);
    expect(groups[0].subjectPreview).toBe('the post text');
    const winner = groupNotifications([row('n1', { subjectPreview: 'newest wins' }), row('n2', { subjectPreview: 'older loses', createdAt: at(1) })]);
    expect(winner[0].subjectPreview).toBe('newest wins');
  });
});
