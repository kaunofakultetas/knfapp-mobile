// -----------------------------------------------------------
//  [*] Tests — socialuikit social parts
//
//  The ConnectButton's contract, face by face: each
//  relationship state renders exactly its action(s) and fires
//  exactly its verb, 'self' and 'blockedBy' render nothing at
//  all (a block must stay invisible to its target), and a
//  pending face is inert. Then the ProfileHeader: compacted
//  tallies, the actions slot carrying a host-dropped
//  ConnectButton, the connections cell pressable only when
//  routed, and the portrait resolved through env.resolveImageUrl
//  with the initial fallback.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { KitProfile } from '../../core/types';
import { defaultLabels } from '../../provider/labels';
import { SocialUiKitProvider } from '../../provider';
import ConnectButton from '../ConnectButton';
import ProfileHeader from '../ProfileHeader';


// The provider-less default catalog — Lithuanian
const lt = defaultLabels.lt;

const profileOf = (over: Partial<KitProfile> = {}): KitProfile => ({
  user: { id: 'u1', displayName: 'Ona Petrauskaitė', handle: 'ona', avatarUrl: null },
  bio: 'Informacijos sistemų studentė Kaune.',
  relationship: 'none',
  counts: { posts: 1250, connections: 8 },
  ...over,
});




describe('ConnectButton', () => {

  it("'none' renders the primary connect face and fires 'connect'", async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="none" onAction={onAction} />);

    expect(r.getByText(lt.connect)).toBeTruthy();
    // The face is a real button under its label
    await fireEvent.press(r.getByRole('button', { name: lt.connect }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('connect');
    expect(r.queryByTestId('socialuikit-connect-accept')).toBeNull();
  });


  it("'outgoing' shows the requested status but fires 'cancel'", async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="outgoing" onAction={onAction} />);

    // Visible text names the status; the accessible name names
    // the tap's actual effect
    expect(r.getByText(lt.requested)).toBeTruthy();
    await fireEvent.press(r.getByRole('button', { name: lt.cancelRequest }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('cancel');
  });


  it("'incoming' renders BOTH buttons, each firing its own verb", async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="incoming" onAction={onAction} />);

    const accept = r.getByTestId('socialuikit-connect-accept');
    const decline = r.getByTestId('socialuikit-connect-decline');
    expect(accept.props.accessibilityRole).toBe('button');
    expect(decline.props.accessibilityRole).toBe('button');
    expect(r.getByText(lt.accept)).toBeTruthy();
    expect(r.getByText(lt.decline)).toBeTruthy();

    await fireEvent.press(accept);
    await fireEvent.press(decline);
    expect(onAction.mock.calls).toEqual([['accept'], ['decline']]);
  });


  it("'connected' renders the subtle face and fires 'disconnect'", async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="connected" onAction={onAction} />);

    expect(r.getByText(lt.connected)).toBeTruthy();
    await fireEvent.press(r.getByTestId('socialuikit-connect-disconnect'));
    expect(onAction).toHaveBeenCalledWith('disconnect');
  });


  it("'blocking' renders the unblock face and fires 'unblock'", async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="blocking" onAction={onAction} />);

    expect(r.getByText(lt.unblock)).toBeTruthy();
    await fireEvent.press(r.getByRole('button', { name: lt.unblock }));
    expect(onAction).toHaveBeenCalledWith('unblock');
  });


  it("'self' renders nothing", async () => {
    const r = await render(<ConnectButton state="self" onAction={jest.fn()} />);
    expect(r.toJSON()).toBeNull();
  });


  it("'blockedBy' renders nothing — a block never advertises itself", async () => {
    const r = await render(<ConnectButton state="blockedBy" onAction={jest.fn()} />);
    expect(r.toJSON()).toBeNull();
  });


  it('a pending face is dimmed, reports disabled and swallows taps', async () => {
    const onAction = jest.fn();
    const r = await render(<ConnectButton state="none" pending onAction={onAction} />);

    const btn = r.getByTestId('socialuikit-connect-connect');
    expect(btn.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(btn);
    expect(onAction).not.toHaveBeenCalled();


    // Both halves of the incoming pair go inert together
    const pair = await render(<ConnectButton state="incoming" pending onAction={onAction} />);
    await fireEvent.press(pair.getByTestId('socialuikit-connect-accept'));
    await fireEvent.press(pair.getByTestId('socialuikit-connect-decline'));
    expect(onAction).not.toHaveBeenCalled();
  });
});




describe('ProfileHeader', () => {

  it('shows name, handle, bio and the compacted tallies', async () => {
    const r = await render(<ProfileHeader profile={profileOf()} />);

    expect(r.getByTestId('socialuikit-profile-header')).toBeTruthy();
    expect(r.getByText('Ona Petrauskaitė')).toBeTruthy();
    expect(r.getByText('@ona')).toBeTruthy();
    expect(r.getByText('Informacijos sistemų studentė Kaune.')).toBeTruthy();

    // 1250 posts compact to '1.2k'; both cells carry their label
    expect(r.getByText('1.2k')).toBeTruthy();
    expect(r.getByText(lt.profilePosts)).toBeTruthy();
    expect(r.getByText('8')).toBeTruthy();
    expect(r.getByText(lt.profileConnections)).toBeTruthy();

    // Without onPressConnections the cell is plain text, not a
    // dead button
    expect(r.getByTestId('socialuikit-profile-connections').props.accessibilityRole).toBeUndefined();
  });


  it('renders missing counts as 0 and skips a missing handle', async () => {
    const r = await render(
      <ProfileHeader
        profile={profileOf({ user: { id: 'u2', displayName: 'Jonas', handle: null }, counts: undefined, bio: null })}
      />,
    );

    expect(r.getAllByText('0')).toHaveLength(2);
    expect(r.queryByText(/^@/)).toBeNull();
  });


  it('renders the host-dropped ConnectButton in the actions slot', async () => {
    const onAction = jest.fn();
    const r = await render(
      <ProfileHeader profile={profileOf()} actions={<ConnectButton state="none" onAction={onAction} />} />,
    );

    await fireEvent.press(r.getByTestId('socialuikit-connect-connect'));
    expect(onAction).toHaveBeenCalledWith('connect');


    // Any node rides the slot — it is not ConnectButton-shaped
    const custom = await render(<ProfileHeader profile={profileOf()} actions={<Text>SLOT</Text>} />);
    expect(custom.getByText('SLOT')).toBeTruthy();
  });


  it('makes the connections tally a press target only when routed', async () => {
    const onPressConnections = jest.fn();
    const r = await render(<ProfileHeader profile={profileOf()} onPressConnections={onPressConnections} />);

    const cell = r.getByTestId('socialuikit-profile-connections');
    expect(cell.props.accessibilityRole).toBe('button');
    await fireEvent.press(cell);
    expect(onPressConnections).toHaveBeenCalledTimes(1);
  });


  it('resolves the portrait through env.resolveImageUrl', async () => {
    const r = await render(
      <SocialUiKitProvider env={{ resolveImageUrl: (url) => `https://cdn.example${url}` }}>
        <ProfileHeader
          profile={profileOf({ user: { id: 'u1', displayName: 'Ona', handle: 'ona', avatarUrl: '/uploads/ona.jpg' } })}
        />
      </SocialUiKitProvider>,
    );

    // expo-image normalises `source` into an array of sources
    expect(r.getByTestId('socialuikit-profile-avatar-image').props.source).toEqual([
      { uri: 'https://cdn.example/uploads/ona.jpg' },
    ]);
  });


  it('falls back to the initial disc without a photo, and taps through onPressAvatar', async () => {
    const onPressAvatar = jest.fn();
    const r = await render(<ProfileHeader profile={profileOf()} onPressAvatar={onPressAvatar} />);

    expect(r.getByText('O')).toBeTruthy();
    await fireEvent.press(r.getByRole('button', { name: lt.avatarA11y('Ona Petrauskaitė') }));
    expect(onPressAvatar).toHaveBeenCalledTimes(1);
  });
});
