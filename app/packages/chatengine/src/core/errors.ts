// -----------------------------------------------------------
//  [*] chatengine — errors
//
//  One failure shape for every transport. Adapters throw
//  TransportError (or anything toTransportError() can read —
//  an object with status / code / serverCode is enough), the
//  engine triages it: transport failures and transient server
//  states re-queue for retry, a definitive 4xx keeps a send
//  failed for good and names why.
//
//  Split into:
//
//    TransportError     — the class
//    toTransportError   — duck-typed normalisation
//    isRetryable        — the retry policy
//    sendFailureCode    — a NoticeCode for a failed send
// -----------------------------------------------------------

import type { NoticeCode } from './transport';


export type TransportErrorKind = 'http' | 'timeout' | 'network' | 'canceled';

export class TransportError extends Error {
  kind: TransportErrorKind;
  // HTTP status for kind 'http', 0 otherwise
  status: number;
  // The backend's own machine-readable code, when it sent one
  serverCode?: string;
  data?: unknown;

  constructor(message: string, kind: TransportErrorKind, status = 0, serverCode?: string, data?: unknown) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
    this.status = status;
    this.serverCode = serverCode;
    this.data = data;
  }
}


// Reads the fields most HTTP clients' errors carry (axios-style
// wrappers, fetch wrappers, the app's ApiError) — `code` may be
// the kind itself ('timeout' / 'network' / 'http' / 'canceled')
export function toTransportError(err: unknown): TransportError {
  if (err instanceof TransportError) return err;
  const any = (err ?? {}) as { message?: unknown; status?: unknown; code?: unknown; serverCode?: unknown; data?: unknown };
  const message = typeof any.message === 'string' ? any.message : 'Transport failure';
  const status = typeof any.status === 'number' ? any.status : 0;
  const code = typeof any.code === 'string' ? any.code : undefined;
  const kind: TransportErrorKind =
    code === 'timeout' || code === 'network' || code === 'canceled' ? code
    : status > 0 ? 'http'
    : code === 'http' ? 'http'
    : 'network';
  const serverCode = typeof any.serverCode === 'string' ? any.serverCode : undefined;
  return new TransportError(message, kind, status, serverCode, any.data);
}


// Transport failures and transient server states (5xx, 429)
// heal; a definitive 4xx never does
export function isRetryable(err: unknown): boolean {
  const e = toTransportError(err);
  return e.kind === 'network' || e.kind === 'timeout' || e.status >= 500 || e.status === 429;
}


export function sendFailureCode(err: unknown): NoticeCode {
  const e = toTransportError(err);
  if (e.kind === 'http') {
    if (e.status === 400 || e.status === 413) return 'send_too_long';
    if (e.status === 401) return 'session_expired';
    if (e.status === 403) return 'send_forbidden';
  }
  if (e.kind === 'timeout') return 'timeout';
  return 'send_failed';
}
