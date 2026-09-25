// -----------------------------------------------------------
//  [*] Tests — the options the runtime hook hands upstream
//
//  The one tuning decision the engine makes on the upstream's
//  runtime, pinned where it is made: streamed message updates
//  are THROTTLED (a render per raw delta re-parsed a growing
//  answer's markdown dozens of times a second — KNF-088), the
//  automatic resend after a tool round stays the upstream's
//  own predicate, and a persisted thread rides as `messages`
//  only when one was handed in. The upstream hook is mocked
//  here and only here; the behaviour suites run the real one.
// -----------------------------------------------------------

import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';

import { useKnfAssistantRuntime } from '../useKnfAssistantRuntime';

const mockUseChatRuntime = jest.fn((_options: unknown) => ({ runtime: true }));
jest.mock('@assistant-ui/ai-sdk', () => ({
  useChatRuntime: (options: unknown) => mockUseChatRuntime(options),
}));


describe('useKnfAssistantRuntime options', () => {
  beforeEach(() => mockUseChatRuntime.mockClear());

  it('throttles streamed updates and resends after a completed tool round', () => {
    const transport = { tag: 'transport' } as never;
    useKnfAssistantRuntime({ transport });
    expect(mockUseChatRuntime).toHaveBeenCalledWith({
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      throttle: 50,
    });
  });

  it('a persisted thread rides as the upstream messages', () => {
    const transport = { tag: 'transport' } as never;
    const initialMessages = [{ id: 'm1', role: 'user', parts: [] }];
    useKnfAssistantRuntime({ transport, initialMessages });
    expect(mockUseChatRuntime.mock.calls[0][0]).toMatchObject({ messages: initialMessages, throttle: 50 });
  });
});
