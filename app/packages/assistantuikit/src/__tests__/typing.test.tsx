// -----------------------------------------------------------
//  [*] Tests — the typing dots
//
//  Inside the thread: the dots show in the assistant bubble
//  while a run has started and nothing has arrived, leave the
//  moment text lands, and never show on a settled message. On
//  their own: three dots, the testID the host looks for (or
//  its own — plain Views a screen reader has nothing to say
//  about), and — with the OS asking for less motion — placed
//  still instead of looped.
// -----------------------------------------------------------

import { act, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';
import type { TestInstance } from 'test-renderer';

import AssistantThread from '../AssistantThread';
import TypingIndicator from '../TypingIndicator';
import { defaultColors } from '../core/types';
import { LABELS, ScriptedThread, createScriptedModel, running, send, settled } from './support/scriptedRuntime';

jest.mock('../MarkdownText', () => jest.requireActual('./support/markdownTextStub'));

const hostChildren = (node: TestInstance): TestInstance[] =>
  node.children.filter((child): child is TestInstance => typeof child !== 'string');

describe('inside the thread', () => {
  it('shows while the run has started and nothing has arrived, then leaves with the first text', async () => {
    const model = createScriptedModel([[{ wait: true }, { text: 'Labas' }]]);
    const view = await render(
      <ScriptedThread model={model}>
        <AssistantThread labels={LABELS} />
      </ScriptedThread>,
    );
    expect(view.queryByTestId('assistantuikit-typing')).toBeNull();
    await send(view, 'Sveiki');
    await running(view);
    expect(view.getByTestId('assistantuikit-typing')).toBeTruthy();
    // The dots sit inside the assistant bubble, not beside it
    expect(view.getByTestId('assistantuikit-message-assistant')).toBeTruthy();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.getByText('Labas')).toBeTruthy();
    expect(view.queryByTestId('assistantuikit-typing')).toBeNull();
  });

  it('shows after a tool call while the container is still answering', async () => {
    const model = createScriptedModel([
      [{ tool: { name: 'lookupSchedule', input: { group: 'IT-1' }, output: { lessons: [] } } }, { wait: true }, { text: 'Rytoj laisva' }],
    ]);
    const view = await render(
      <ScriptedThread model={model}>
        <AssistantThread labels={LABELS} />
      </ScriptedThread>,
    );
    await send(view, 'Kada?');
    await running(view);
    await waitFor(() => expect(view.getByTestId('assistantuikit-tool-lookupSchedule')).toBeTruthy());
    expect(view.getByTestId('assistantuikit-typing')).toBeTruthy();
    await act(async () => {
      model.release();
    });
    await settled(view);
    expect(view.queryByTestId('assistantuikit-typing')).toBeNull();
  });
});

describe('on its own', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders three dots under the stable testID', async () => {
    const view = await render(<TypingIndicator />);
    const dots = hostChildren(view.getByTestId('assistantuikit-typing'));
    expect(dots).toHaveLength(3);
    dots.forEach((dot) => expect(dot.props.style.backgroundColor).toBe(defaultColors.inkSoft));
  });

  it('takes the host colours and its own testID', async () => {
    const view = await render(<TypingIndicator colors={{ ...defaultColors, inkSoft: '#123456' }} testID="host-wait" />);
    const dots = hostChildren(view.getByTestId('host-wait'));
    dots.forEach((dot) => expect(dot.props.style.backgroundColor).toBe('#123456'));
  });

  it('loops the dots by default', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    await render(<TypingIndicator />);
    await waitFor(() => expect(loop).toHaveBeenCalledTimes(1));
  });

  it('with reduced motion the dots are placed still at half strength — no loop at all', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loop = jest.spyOn(Animated, 'loop');
    const stop = jest.fn();
    loop.mockImplementation(() => ({ start: jest.fn(), stop, reset: jest.fn() }));
    const setValue = jest.spyOn(Animated.Value.prototype, 'setValue');
    const view = await render(<TypingIndicator />);
    // The query answers after mount; the loop that started before
    // the answer stops, and no new loop starts
    await waitFor(() => expect(stop).toHaveBeenCalled());
    expect(loop).toHaveBeenCalledTimes(1);
    // Still is not invisible: every dot's phase is PLACED at
    // half strength, clearly a wait
    expect(setValue.mock.calls.filter(([value]) => value === 0.5)).toHaveLength(3);
    expect(hostChildren(view.getByTestId('assistantuikit-typing'))).toHaveLength(3);
  });
});
