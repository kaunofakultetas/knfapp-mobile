// -----------------------------------------------------------
//  [*] Tests — socialuikit PostCard + ActionRow
//
//  The composition rules pinned: at most one attachment block
//  (media beats link), the edited mark, the snippet fold and
//  its read-more hint, the deleted placeholder, the source
//  chip toggle, the poll slot's order of precedence, and the
//  press-target discipline — an action tap never also opens
//  the post, while the like button's spoken name flips with
//  likedByMe carrying the live tally.
// -----------------------------------------------------------

import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { clampSnippet } from '../../core/format';
import type { KitLinkPreview, KitMediaItem, KitPost, KitUser } from '../../core/types';
import { SocialUiKitProvider } from '../../provider';
import { defaultLabels } from '../../provider/labels';
import PostCard from '../PostCard';


// The provider-less fallback catalog is Lithuanian
const lt = defaultLabels.lt;

const ona: KitUser = { id: 'u1', displayName: 'Ona Petrauskaitė' };

const base: KitPost = {
  id: 'p1',
  author: ona,
  text: 'Fakulteto bendruomenės šventė vyks penktadienį vidiniame kieme.',
  // A recent past stamp so the default clock never reads it as skew
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  likeCount: 3,
  commentCount: 2,
  likedByMe: false,
  isOwn: false,
};

const media: KitMediaItem[] = [{ url: '/uploads/a.jpg', kind: 'image' }];
const link: KitLinkPreview = { url: 'https://example.org/naujiena', title: 'Naujiena' };

// The two required callbacks, fresh per render
const actions = () => ({ onPressLike: jest.fn(), onPressComment: jest.fn() });




describe('PostCard', () => {

  it('shows at most one attachment block — media beats link', async () => {
    const both = await render(<PostCard post={{ ...base, media, link }} {...actions()} />);
    expect(both.getByTestId('socialuikit-gallery')).toBeTruthy();
    expect(both.queryByTestId('socialuikit-link-card')).toBeNull();

    const linkOnly = await render(<PostCard post={{ ...base, link }} {...actions()} />);
    expect(linkOnly.getByTestId('socialuikit-link-card')).toBeTruthy();
    expect(linkOnly.queryByTestId('socialuikit-gallery')).toBeNull();

    // An empty media array is no album — the link still shows
    const emptyAlbum = await render(<PostCard post={{ ...base, media: [], link }} {...actions()} />);
    expect(emptyAlbum.getByTestId('socialuikit-link-card')).toBeTruthy();

    const bare = await render(<PostCard post={base} {...actions()} />);
    expect(bare.queryByTestId('socialuikit-gallery')).toBeNull();
    expect(bare.queryByTestId('socialuikit-link-card')).toBeNull();
  });


  it('marks an edited post next to the stamp', async () => {
    const edited = await render(<PostCard post={{ ...base, editedAt: base.createdAt }} {...actions()} />);
    expect(edited.getByText(`· ${lt.edited}`)).toBeTruthy();

    const clean = await render(<PostCard post={base} {...actions()} />);
    expect(clean.queryByText(`· ${lt.edited}`)).toBeNull();
  });


  it('folds the body at snippetLength and hangs the read-more hint', async () => {
    const foldedText = clampSnippet(base.text, 24);
    const folded = await render(<PostCard post={base} snippetLength={24} {...actions()} />);
    expect(folded.getByText(foldedText)).toBeTruthy();
    expect(folded.getByText(lt.readMore)).toBeTruthy();
    expect(folded.queryByText(base.text)).toBeNull();

    // No snippetLength → the whole body, no hint
    const full = await render(<PostCard post={base} {...actions()} />);
    expect(full.getByText(base.text)).toBeTruthy();
    expect(full.queryByText(lt.readMore)).toBeNull();

    // A body already within the fold earns no hint either
    const short = await render(<PostCard post={{ ...base, text: 'Trumpa žinutė' }} snippetLength={140} {...actions()} />);
    expect(short.getByText('Trumpa žinutė')).toBeTruthy();
    expect(short.queryByText(lt.readMore)).toBeNull();
  });


  it('a deleted post collapses to the placeholder row', async () => {
    const onPress = jest.fn();
    const r = await render(<PostCard post={{ ...base, deleted: true, media, link }} onPress={onPress} {...actions()} />);

    expect(r.getByTestId('socialuikit-post-card')).toBeTruthy();
    expect(r.getByText(lt.deletedPost)).toBeTruthy();

    // Everything else is gone — author, attachments, actions
    expect(r.queryByText(ona.displayName)).toBeNull();
    expect(r.queryByTestId('socialuikit-gallery')).toBeNull();
    expect(r.queryByTestId('socialuikit-action-like')).toBeNull();
  });


  it('the source chip shows by default and hides on showSource={false}', async () => {
    const source = { id: 'knf', label: 'knf.vu.lt' };

    const shown = await render(<PostCard post={{ ...base, source }} {...actions()} />);
    expect(shown.getByText('knf.vu.lt')).toBeTruthy();
    expect(shown.getByLabelText(lt.sourceA11y('knf.vu.lt'))).toBeTruthy();

    const hidden = await render(<PostCard post={{ ...base, source }} showSource={false} {...actions()} />);
    expect(hidden.queryByText('knf.vu.lt')).toBeNull();

    // No source at all → no chip even with showSource on
    const sourceless = await render(<PostCard post={base} {...actions()} />);
    expect(sourceless.queryByLabelText(lt.sourceA11y('knf.vu.lt'))).toBeNull();
  });


  it('an action tap never also opens the post', async () => {
    const onPress = jest.fn();
    const onPressShare = jest.fn();
    const a = actions();
    const r = await render(<PostCard post={base} onPress={onPress} onPressShare={onPressShare} {...a} />);

    await fireEvent.press(r.getByTestId('socialuikit-action-like'));
    expect(a.onPressLike).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(r.getByTestId('socialuikit-action-comment'));
    expect(a.onPressComment).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(r.getByTestId('socialuikit-action-share'));
    expect(onPressShare).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    // The card body itself still opens the post
    await fireEvent.press(r.getByTestId('socialuikit-post-card'));
    expect(onPress).toHaveBeenCalledTimes(1);

    // No share handler → no share target at all
    const shareless = await render(<PostCard post={base} {...actions()} />);
    expect(shareless.queryByTestId('socialuikit-action-share')).toBeNull();
  });


  it('the like button speaks its state and live tally', async () => {
    const a = actions();
    const r = await render(<PostCard post={{ ...base, likeCount: 3, likedByMe: false }} {...a} />);
    expect(r.getByLabelText(lt.likeWithCount(3))).toBeTruthy();

    // After an optimistic toggle the same button announces the
    // reverse action with the new tally
    await r.rerender(<PostCard post={{ ...base, likeCount: 4, likedByMe: true }} {...a} />);
    expect(r.getByLabelText(lt.unlikeWithCount(4))).toBeTruthy();
    expect(r.queryByLabelText(lt.likeWithCount(3))).toBeNull();

    // The comments button's name is pluralised too
    expect(r.getByLabelText(lt.commentsWithCount(2))).toBeTruthy();
  });


  it('pollSlot renders verbatim and beats the PostPoll fallback', async () => {
    const slot = <Text testID="host-poll">apklausa</Text>;

    const direct = await render(<PostCard post={base} pollSlot={slot} {...actions()} />);
    expect(direct.getByTestId('host-poll')).toBeTruthy();

    // With no slot, a mounted components.PostPoll fills it,
    // receiving the post itself
    const PostPoll = ({ post }: { post: KitPost }) => <Text testID="fallback-poll">{post.id}</Text>;
    const viaComponents = await render(
      <SocialUiKitProvider components={{ PostPoll }}>
        <PostCard post={base} {...actions()} />
      </SocialUiKitProvider>,
    );
    expect(viaComponents.getByTestId('fallback-poll')).toBeTruthy();
    expect(viaComponents.getByText('p1')).toBeTruthy();

    // When both exist, the explicit slot wins
    const both = await render(
      <SocialUiKitProvider components={{ PostPoll }}>
        <PostCard post={base} pollSlot={slot} {...actions()} />
      </SocialUiKitProvider>,
    );
    expect(both.getByTestId('host-poll')).toBeTruthy();
    expect(both.queryByTestId('fallback-poll')).toBeNull();
  });

  it('memo skips an unchanged row even though the host passes fresh inline callbacks', async () => {
    let renders = 0;
    const CountingAvatar = ({ user }: { user: KitUser; size?: number }) => {
      renders += 1;
      return <Text testID="probe-avatar">{user.displayName}</Text>;
    };
    // The components object stays STABLE across rerenders — a
    // changing context value would re-render into the memoized
    // subtree and mask what the comparator does
    const components = { Avatar: CountingAvatar };
    const ui = (post: KitPost) => (
      <SocialUiKitProvider components={components}>
        <PostCard post={post} onPressLike={() => {}} onPressComment={() => {}} />
      </SocialUiKitProvider>
    );
    const post = base;
    const view = await render(ui(post));
    const painted = renders;
    expect(painted).toBeGreaterThan(0);

    // Same post object, new callback identities — the row skips
    await view.rerender(ui(post));
    expect(renders).toBe(painted);

    // A new post object re-renders
    await view.rerender(ui({ ...post }));
    expect(renders).toBe(painted + 1);
  });

  it('a tombstoned author reads as a person, never a blank byline', async () => {
    const ghost = { ...base, author: { id: 'gone', displayName: '   ' } };
    const r = await render(<PostCard post={ghost} onPressLike={() => {}} onPressComment={() => {}} />);
    expect(r.getByText('Nežinomas narys')).toBeTruthy();
  });

  it('the Avatar slot receives exactly its documented props — nothing more, nothing renamed', async () => {
    const seen: unknown[] = [];
    const Probe = (props: { user: KitUser; size: number }) => {
      seen.push(props);
      return null;
    };
    const components = { Avatar: Probe };
    await render(
      <SocialUiKitProvider components={components}>
        <PostCard post={base} onPressLike={() => {}} onPressComment={() => {}} />
      </SocialUiKitProvider>,
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const props of seen as { user: KitUser; size: number }[]) {
      expect(Object.keys(props).sort()).toEqual(['size', 'user']);
      expect(props.user).toBe(base.author);
      expect(typeof props.size).toBe('number');
    }
  });
});
