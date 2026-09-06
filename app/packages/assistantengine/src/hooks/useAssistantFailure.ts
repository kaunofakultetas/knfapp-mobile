// -----------------------------------------------------------
//  [*] assistantengine — useAssistantFailure
//
//  The thread's error, read as our typed value. The upstream
//  keeps whatever the transport threw; when that is our
//  AssistantTransportError the failure inside it comes back
//  verbatim (status, retryAfterMs and all), and any other
//  Error — a malformed frame, an `error` chunk the model
//  layer streamed mid-answer — reads as 'server' with its
//  message. null while the thread is healthy. Like every other
//  assistant hook it must sit under AssistantRuntimeProvider —
//  outside one the upstream throws its provider error, so a
//  screen mounts it inside the provider, never above it.
//
//  Used by:
//    - testing/index.tsx — the probe's reader publishes this
//      value after every commit
//    - hooks/__tests__/useAssistantFailure.test.ts
//    - the app's assistant screen, once it lands: the error
//      banner's copy and its retry policy — no app import yet
// -----------------------------------------------------------

import { useAISDKError } from '@assistant-ui/ai-sdk';
import { useMemo } from 'react';

import { isAssistantTransportError } from '../core/errors';
import type { AssistantFailure } from '../core/types';


export function useAssistantFailure(): AssistantFailure | null {
  const error = useAISDKError();
  // Memoized on the error's identity — a fresh object per
  // render would re-fire every effect keyed on the failure
  return useMemo(() => (error === undefined ? null : failureOf(error)), [error]);
}

function failureOf(error: Error): AssistantFailure {
  if (isAssistantTransportError(error)) return error.failure;
  return { code: 'server', message: error.message || 'Assistant failed' };
}
