// -----------------------------------------------------------
//  [*] assistantengine — useKnfAssistantRuntime
//
//  The upstream chat runtime over our transport, with the one
//  behaviour the faculty's tool model needs: every tool runs
//  INSIDE the container, which streams the call and its
//  result back and then ends the response — so the client's
//  only job after a tool round trip is to send the thread
//  again, automatically, and let the model finish its answer.
//  That is the upstream's own "last assistant message is
//  complete with tool calls" predicate; nothing else of the
//  upstream's option surface is exposed, because nothing else
//  is decided on the phone. Client-side tools, a cloud thread
//  list, resumable streams: deliberately absent.
//
//  Used by:
//    - testing/index.tsx — mountAssistantProbe mounts this
//      hook, so every probe-based suite runs through it
//    - hooks/__tests__/useKnfAssistantRuntime.test.ts
//    - the app's assistant screen, once it lands: called once
//      near the screen's root, its result handed to
//      AssistantRuntimeProvider — no app import yet
// -----------------------------------------------------------

import { useChatRuntime } from '@assistant-ui/ai-sdk';
import type { AssistantRuntime } from '@assistant-ui/react-native';
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';

import type { KnfAssistantTransport } from '../core/transport';







// -----------------------------------------------------------
// KnfAssistantRuntimeOptions
// -----------------------------------------------------------
//
// What the hook needs: the transport, and optionally a
// persisted thread to resume.
//
// Used by:
//   - useKnfAssistantRuntime (below) — the options argument
//   - testing/index.tsx — mountAssistantProbe takes the same
//     shape
// -----------------------------------------------------------

export interface KnfAssistantRuntimeOptions {
  transport: KnfAssistantTransport;
  // A thread to resume — the upstream's own message shape,
  // persisted opaquely by the host and handed back untouched;
  // the host never builds these by hand
  initialMessages?: unknown[];
}







// -----------------------------------------------------------
// useKnfAssistantRuntime
// -----------------------------------------------------------
//
//   const runtime = useKnfAssistantRuntime({ transport })
//                                        — chat runtime that
//                                          auto-resends after a
//                                          completed tool round
//   { transport, initialMessages }       — resume a persisted
//                                          thread
//
// Used by:
//   - testing/index.tsx — mountAssistantProbe mounts this hook
//   - hooks/__tests__/useKnfAssistantRuntime.test.ts
// -----------------------------------------------------------

export function useKnfAssistantRuntime(options: KnfAssistantRuntimeOptions): AssistantRuntime {
  const { transport, initialMessages } = options;
  return useChatRuntime({
    transport,
    ...(initialMessages ? { messages: initialMessages as UIMessage[] } : {}),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
}
