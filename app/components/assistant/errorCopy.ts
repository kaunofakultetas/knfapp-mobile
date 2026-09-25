// -----------------------------------------------------------
//  [*] Assistant — the error banner's sentence
//
//  Which sentence the assistant's error strip leads with,
//  decided from the CURRENT thread's failure (the engine's
//  typed AssistantFailure) and nothing older — a sentence kept
//  from a previous turn once told a student to wait out a
//  rate limit that had long passed (KNF-087). The engine's
//  code picks the family, the server's machine code and the
//  status sharpen it: the container's own turn limit vs. the
//  shared AI gateway being busy, a prompt switched off vs. a
//  container down, a vanished conversation, a question too
//  long to send. A Retry-After becomes the wait in the
//  sentence. The runtime's technical line under the sentence
//  stays as it is — this module only chooses the words above
//  it.
//
//  Split into:
//
//    TOO_LONG_CODES     — the server codes of an oversized send
//    formatWait         — Retry-After ms → "30 s" / "10 min."
//    assistantErrorBody — failure → the banner's sentence
// -----------------------------------------------------------

import type { TFunction } from 'i18next';

import type { AssistantFailure } from '@knf/assistantengine';


// The container's refusals of a send that is simply too big —
// the message, the history, or the raw body
const TOO_LONG_CODES = new Set(['INPUT_TOO_LARGE', 'TOO_MANY_MESSAGES', 'PAYLOAD_TOO_LARGE']);

// The container's codes for an assistant that is deliberately
// off (no active prompt) or not set up (no gateway key)
const SWITCHED_OFF_CODES = new Set(['PROMPT_NOT_CONFIGURED', 'NOT_CONFIGURED']);







// -----------------------------------------------------------
// formatWait
// -----------------------------------------------------------
//
//   formatWait(30_000, t)  → '30 s'
//   formatWait(600_000, t) → '10 min.'   (lt) / '10 min' (en)
//
// A Retry-After as the words a person reads: whole seconds
// under a minute, whole minutes from there — both rounded UP,
// so the wait said is never shorter than the wait meant.
//
// Used by:
//   - assistantErrorBody (below)
// -----------------------------------------------------------

export function formatWait(ms: number, t: TFunction): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return t('assistant.waitSeconds', { seconds });
  return t('assistant.waitMinutes', { minutes: Math.ceil(seconds / 60) });
}







// -----------------------------------------------------------
// assistantErrorBody
// -----------------------------------------------------------
//
//   assistantErrorBody(null, t)                           → errorServer
//   assistantErrorBody({ code: 'quota', retryAfterMs … }) → errorQuotaWait
//   assistantErrorBody({ code: 'server', status: 404 … }) → errorThreadGone
//
// One sentence per failure: network and timeout name the
// wire, auth the session, quota the turn limit (or the busy
// gateway, when the server said GATEWAY_RATE_LIMITED) with
// the wait when one was sent, unavailable the container (or
// the switched-off assistant), and the server family splits
// into a vanished thread (404), an oversized send and the
// generic fault — which is also what a failure streamed
// mid-answer reads as. null (no typed failure in hand) is the
// generic fault too.
//
// Used by:
//   - app/(main)/tabs/assistant.tsx — the kit's errorBody label
//   - components/assistant/__tests__/errorCopy.test.ts
// -----------------------------------------------------------

export function assistantErrorBody(failure: AssistantFailure | null, t: TFunction): string {
  if (!failure) return t('assistant.errorServer');
  const wait = failure.retryAfterMs !== undefined ? formatWait(failure.retryAfterMs, t) : null;

  if (failure.code === 'network') return t('assistant.errorNetwork');
  if (failure.code === 'timeout') return t('assistant.errorTimeout');
  if (failure.code === 'auth') return t('assistant.errorAuth');
  if (failure.code === 'quota') {
    if (failure.serverCode === 'GATEWAY_RATE_LIMITED') {
      return wait ? t('assistant.errorBusyWait', { wait }) : t('assistant.errorBusy');
    }
    return wait ? t('assistant.errorQuotaWait', { wait }) : t('assistant.errorQuota');
  }
  if (failure.code === 'unavailable') {
    return failure.serverCode && SWITCHED_OFF_CODES.has(failure.serverCode)
      ? t('assistant.errorNotConfigured')
      : t('assistant.errorUnavailable');
  }
  if (failure.status === 404) return t('assistant.errorThreadGone');
  if (failure.serverCode && TOO_LONG_CODES.has(failure.serverCode)) return t('assistant.errorTooLong');
  return t('assistant.errorServer');
}
