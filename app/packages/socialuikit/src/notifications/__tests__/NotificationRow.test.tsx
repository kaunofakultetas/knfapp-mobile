// -----------------------------------------------------------
//  [*] Tests — socialuikit NotificationRow
//
//  The activity row pinned: every known kind maps to its label
//  and an unknown kind degrades to the generic line; a grouped
//  row names the first actor and counts the rest while its
//  faces stay a two-head duo inside the lone portrait's slot
//  (a five-head stack squeezed the sentence); unread rows swap
//  the testID suffix and grow the brand dot; and the whole row
//  is ONE accessibility target speaking one combined sentence.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';

import type { KitNotification, KitUser } from '../../core/types';
import { defaultLabels } from '../../provider/labels';
import NotificationRow from '../NotificationRow';


// The provider-less fallback catalog is Lithuanian
const lt = defaultLabels.lt;

// One read like from Ona, two minutes ago (the helper below is
// a hoisted declaration)
const base: KitNotification = {
  key: 'n1',
  kind: 'like',
  actors: [user('u1', 'Ona')],
  // A recent past stamp so the default clock never reads it as skew
  newestAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  read: true,
};







// -----------------------------------------------------------
// user
// -----------------------------------------------------------
//
// A portrait-less actor.
//
// Used by:
//   - the tests below
// -----------------------------------------------------------

function user(id: string, displayName: string): KitUser {
  return { id, displayName };
}




describe('NotificationRow', () => {

  it('maps every kind to its line, unknown kinds to the generic one', async () => {
    const cases: [KitNotification['kind'], string][] = [
      ['like', lt.notifLike('Ona', 0)],
      ['comment', lt.notifComment('Ona', 0)],
      ['reply', lt.notifReply('Ona', 0)],
      ['mention', lt.notifMention('Ona', 0)],
      ['connect_request', lt.notifConnectRequest('Ona')],
      ['connect_accept', lt.notifConnectAccept('Ona')],
      // 'system' has no arm of its own; a kind minted after this
      // client shipped must degrade the same way
      ['system', lt.notifGeneric('Ona')],
      ['badge_unlocked', lt.notifGeneric('Ona')],
    ];

    for (const [kind, line] of cases) {
      const r = await render(<NotificationRow notification={{ ...base, kind }} onPress={jest.fn()} />);
      expect(r.getByText(line)).toBeTruthy();
      await r.unmount();
    }
  });


  it('names the first actor, counts the rest, and shows a group as a duo in one slot', async () => {
    const four = [user('u1', 'Ona'), user('u2', 'Jonas'), user('u3', 'Rasa'), user('u4', 'Tomas')];
    const grouped = await render(<NotificationRow notification={{ ...base, actors: four }} onPress={jest.fn()} />);
    expect(grouped.getByText(lt.notifLike('Ona', 3))).toBeTruthy();

    const seven = [...four, user('u5', 'Eglė'), user('u6', 'Lukas'), user('u7', 'Ieva')];
    const crowded = await render(<NotificationRow notification={{ ...base, actors: seven }} onPress={jest.fn()} />);
    const back = crowded.getByTestId('socialuikit-notification-avatar-0');
    const front = crowded.getByTestId('socialuikit-notification-avatar-1');
    expect(crowded.queryByTestId('socialuikit-notification-avatar-2')).toBeNull();
    // The sentence still counts everyone the duo does not show
    expect(crowded.getByText(lt.notifLike('Ona', 6))).toBeTruthy();

    // A lone actor: no 'and others' phrasing, one full portrait
    const lone = await render(<NotificationRow notification={base} onPress={jest.fn()} />);
    expect(lone.getByText(lt.notifLike('Ona', 0))).toBeTruthy();
    const portrait = lone.getByTestId('socialuikit-notification-avatar-0');
    expect(lone.queryByTestId('socialuikit-notification-avatar-1')).toBeNull();

    // The duo's heads are pinned to opposite corners, each
    // smaller than the lone portrait — the slot never widens
    const style = (node: { props: Record<string, unknown> }) =>
      Object.assign({}, ...[node.props.style].flat(2)) as Record<string, number | string>;
    expect(style(back)).toMatchObject({ position: 'absolute', top: 0, left: 0 });
    expect(style(front)).toMatchObject({ position: 'absolute', bottom: 0, right: 0 });
    expect(style(back).width).toBeLessThan(style(portrait).width as number);
    expect(style(portrait).position).toBeUndefined();
  });


  it('an unread row swaps the testID suffix and grows the brand dot', async () => {
    const unread = await render(<NotificationRow notification={{ ...base, read: false }} onPress={jest.fn()} />);
    expect(unread.getByTestId('socialuikit-notification-row-unread')).toBeTruthy();
    expect(unread.getByTestId('socialuikit-notification-dot')).toBeTruthy();
    expect(unread.queryByTestId('socialuikit-notification-row')).toBeNull();

    const read = await render(<NotificationRow notification={base} onPress={jest.fn()} />);
    expect(read.getByTestId('socialuikit-notification-row')).toBeTruthy();
    expect(read.queryByTestId('socialuikit-notification-row-unread')).toBeNull();
    expect(read.queryByTestId('socialuikit-notification-dot')).toBeNull();
  });


  it('speaks one combined sentence and hands the whole notification back', async () => {
    const onPress = jest.fn();
    const n: KitNotification = { ...base, subjectPreview: 'Puikus renginys!' };
    const r = await render(<NotificationRow notification={n} onPress={onPress} />);

    // One label for the whole row: the sentence, then the snippet
    expect(r.getByTestId('socialuikit-notification-row').props.accessibilityLabel).toBe(
      `${lt.notifLike('Ona', 0)}. Puikus renginys!`,
    );
    // Exactly one press target — the row is not four separate stops
    expect(r.getAllByRole('button')).toHaveLength(1);

    // The snippet is a one-line second row
    expect(r.getByText('Puikus renginys!').props.numberOfLines).toBe(1);

    await fireEvent.press(r.getByTestId('socialuikit-notification-row'));
    expect(onPress).toHaveBeenCalledWith(n);

    // With no snippet the combined label is the sentence alone
    const bare = await render(<NotificationRow notification={base} onPress={jest.fn()} />);
    expect(bare.getByTestId('socialuikit-notification-row').props.accessibilityLabel).toBe(lt.notifLike('Ona', 0));
  });

  it('a tombstoned actor still reads as a person in the line', async () => {
    const ghost: KitNotification = {
      key: 'g1',
      kind: 'like',
      actors: [{ id: 'gone', displayName: '' }],
      newestAt: new Date(Date.UTC(2026, 7, 30, 12, 0, 0)).toISOString(),
      read: true,
    };
    const r = await render(<NotificationRow notification={ghost} onPress={() => {}} />);
    expect(r.getByText(lt.notifLike('Nežinomas narys', 0))).toBeTruthy();
  });
});
