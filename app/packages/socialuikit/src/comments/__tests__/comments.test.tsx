// -----------------------------------------------------------
//  [*] Tests — socialuikit comments
//
//  The row's two faces (a live comment, the inert deleted
//  placeholder) and the composer's contract: the signed-out
//  prompt fires onPressSignIn, a confirmed submit clears the
//  field while a refused one keeps it, whitespace never
//  submits, a second tap mid-flight is swallowed, and the
//  length cap reaches the input.
// -----------------------------------------------------------

import { act, fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CommentComposer from '../CommentComposer';
import CommentRow from '../CommentRow';
import type { KitComment } from '../../core/types';
import { SocialUiKitProvider } from '../../provider';


// The composer reads real insets; a frozen frame keeps the
// hook deterministic
const METRICS = { insets: { top: 0, bottom: 34, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 390, height: 800 } };

// Five minutes past the comment below, so the row's
// RelativeTime reads '5m' whatever the machine clock says
const NOW = new Date('2026-08-30T12:39:00.000Z');
const ENV = { now: () => NOW };

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SocialUiKitProvider locale="en" env={ENV}>
        {ui}
      </SocialUiKitProvider>
    </SafeAreaProvider>,
  );

// Settles the submit promise chain (await onSubmit → setText)
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
};

const comment: KitComment = {
  id: 'c1',
  author: { id: 'u1', displayName: 'Ona' },
  text: 'Labas visiems',
  createdAt: '2026-08-30T12:34:00.000Z',
  isOwn: false,
};




describe('CommentRow', () => {

  // RelativeTime aims a wake-up timeout at its next band edge;
  // fake timers keep the suite from holding a real handle open
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());


  it('renders the author, the text and the relative stamp', async () => {
    const r = await wrap(<CommentRow comment={comment} />);

    expect(r.getByTestId('socialuikit-comment-row')).toBeTruthy();
    expect(r.getByText('Ona')).toBeTruthy();
    expect(r.getByText('Labas visiems')).toBeTruthy();
    // createdAt is five minutes before the frozen env clock
    expect(r.getByText('5m')).toBeTruthy();
  });


  it('a deleted comment shows the italic placeholder and drops every interaction', async () => {
    const onPressAuthor = jest.fn();
    const onLongPress = jest.fn();
    const r = await wrap(
      <CommentRow comment={{ ...comment, deleted: true }} onPressAuthor={onPressAuthor} onLongPress={onLongPress} />,
    );

    const placeholder = r.getByText('Comment deleted');
    expect(StyleSheet.flatten(placeholder.props.style).fontStyle).toBe('italic');
    expect(r.queryByText('Labas visiems')).toBeNull();
    expect(r.queryByText('Ona')).toBeNull();
    // No pressable face survives deletion: the row is a plain
    // View with no responder machinery (firing longPress here
    // would only bubble up to CommentRow's own composite prop,
    // so the structural check is the honest one)
    expect(r.queryByRole('button')).toBeNull();
    const row = r.getByTestId('socialuikit-comment-row');
    expect(row.props.onLongPress).toBeUndefined();
    expect(row.props.onStartShouldSetResponder).toBeUndefined();
    expect(onLongPress).not.toHaveBeenCalled();
    expect(onPressAuthor).not.toHaveBeenCalled();
  });


  it('hands the author back from the portrait and the comment back from a long-press', async () => {
    const onPressAuthor = jest.fn();
    const onLongPress = jest.fn();
    const r = await wrap(<CommentRow comment={comment} onPressAuthor={onPressAuthor} onLongPress={onLongPress} />);

    await fireEvent.press(r.getByRole('button', { name: "Ona's profile photo" }));
    expect(onPressAuthor).toHaveBeenCalledWith(comment.author);
    await fireEvent(r.getByTestId('socialuikit-comment-row'), 'longPress');
    expect(onLongPress).toHaveBeenCalledWith(comment);
  });
});




describe('CommentComposer', () => {

  it('signed out: the prompt row replaces the field and fires onPressSignIn', async () => {
    const onPressSignIn = jest.fn();
    const onSubmit = jest.fn(async () => true);
    const r = await wrap(<CommentComposer canComment={false} onSubmit={onSubmit} onPressSignIn={onPressSignIn} />);

    expect(r.getByTestId('socialuikit-comment-locked')).toBeTruthy();
    expect(r.getByText('Sign in to comment')).toBeTruthy();
    expect(r.queryByTestId('socialuikit-comment-input')).toBeNull();
    expect(r.queryByTestId('socialuikit-comment-send')).toBeNull();
    await fireEvent.press(r.getByRole('button', { name: 'Sign in' }));
    expect(onPressSignIn).toHaveBeenCalledTimes(1);
  });


  it('a confirmed submit sends the trimmed draft and clears the field', async () => {
    const onSubmit = jest.fn(async () => true);
    const r = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);

    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), '  Sveiki  ');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();

    expect(onSubmit).toHaveBeenCalledWith('Sveiki');
    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('');
  });


  it('a refused submit keeps the draft for a retry', async () => {
    const onSubmit = jest.fn(async () => false);
    const r = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);

    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), 'Sveiki');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('Sveiki');
  });


  it('a whitespace-only draft never submits', async () => {
    const onSubmit = jest.fn(async () => true);
    const r = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);

    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), '   \n  ');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('   \n  ');
  });


  it('a second tap mid-flight is swallowed', async () => {
    let settle: (delivered: boolean) => void = () => {};
    const onSubmit = jest.fn(() => new Promise<boolean>((resolve) => { settle = resolve; }));
    const r = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);

    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), 'Labas');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // The delayed confirmation still clears the field
    await act(async () => {
      settle(true);
      for (let i = 0; i < 40; i++) await Promise.resolve();
    });
    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('');
  });


  it('hands the cap to the input — the given one, or the 2000 default', async () => {
    const onSubmit = jest.fn(async () => true);
    const capped = await wrap(<CommentComposer canComment onSubmit={onSubmit} maxLength={500} />);
    expect(capped.getByTestId('socialuikit-comment-input').props.maxLength).toBe(500);

    const bare = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);
    expect(bare.getByTestId('socialuikit-comment-input').props.maxLength).toBe(2000);
    expect(bare.getByTestId('socialuikit-comment-input').props.multiline).toBe(true);
  });

  it('absorbs a throwing host as delivered=false: the draft stays, the composer recovers', async () => {
    const onSubmit = jest.fn(async () => {
      throw new Error('backend down');
    });
    const r = await wrap(<CommentComposer canComment onSubmit={onSubmit} />);
    await fireEvent.changeText(r.getByTestId('socialuikit-comment-input'), 'Sveiki');
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();

    expect(r.getByTestId('socialuikit-comment-input').props.value).toBe('Sveiki');
    // Recovered — the next tap submits again
    await fireEvent.press(r.getByTestId('socialuikit-comment-send'));
    await flush();
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
