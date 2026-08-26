// -----------------------------------------------------------
//  [*] API — auth
//
//  Session endpoints: login, invitation-gated registration,
//  the /auth/me identity check and best-effort logout.
//  Request bodies are snake_case, responses camelCase — the
//  backend convention throughout services/api.
//
//  Split into:
//
//    AuthResponse           — user + session token
//    ValidateCodeResponse   — invitation-code check result
//    loginApi               — username/password → session
//    registerApi            — create an account
//    fetchMe                — verify the stored session
//    validateInvitationCode — pre-check a code while typing
//    logoutApi              — server session drop, best-effort
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// Domain types
import type { User } from '@/types';







// -----------------------------------------------------------
// AuthResponse
// -----------------------------------------------------------
//
// Used by:
//   - loginApi, registerApi (below)
//   - context/AuthContext.tsx — session persistence
// -----------------------------------------------------------

export interface AuthResponse {
  user: User;
  token: string;
}







// -----------------------------------------------------------
// ValidateCodeResponse
// -----------------------------------------------------------
//
// Used by:
//   - validateInvitationCode (below)
//   - app/register.tsx — live code feedback
// -----------------------------------------------------------

export interface ValidateCodeResponse {
  valid: boolean;
  error?: string;
  role?: string;
  remainingUses?: number;
}







// -----------------------------------------------------------
// loginApi
// -----------------------------------------------------------
//
// Used by:
//   - context/AuthContext.tsx — login()
// -----------------------------------------------------------

export const loginApi = (username: string, password: string) =>
  request(api.post<AuthResponse>('/auth/login', { username, password }));







// -----------------------------------------------------------
// registerApi
// -----------------------------------------------------------
//
// The invitation code is optional — registering without one
// creates an uninvited account with reduced trust (the
// backend marks invited=false).
//
// Used by:
//   - context/AuthContext.tsx — register()
// -----------------------------------------------------------

export const registerApi = (params: {
  invitation_code?: string;
  username: string;
  password: string;
  display_name: string;
  email: string;
}) => request(api.post<AuthResponse>('/auth/register', params));







// -----------------------------------------------------------
// fetchMe
// -----------------------------------------------------------
//
// Resolves the account behind the stored token — the startup
// session check. A 401 here means the session is dead and the
// stored auth state must be cleared.
//
// Used by:
//   - context/AuthContext.tsx — hydration-time verification
// -----------------------------------------------------------

export const fetchMe = () => request(api.get<User>('/auth/me'));







// -----------------------------------------------------------
// validateInvitationCode
// -----------------------------------------------------------
//
// Used by:
//   - app/register.tsx — checks the code before submitting
// -----------------------------------------------------------

export const validateInvitationCode = (code: string) =>
  request(api.post<ValidateCodeResponse>('/auth/validate-code', { code }));







// -----------------------------------------------------------
// logoutApi
// -----------------------------------------------------------
//
// Fire-and-forget server-side session drop. Never throws —
// local logout (token removal, cache clear) must proceed even
// when the server is unreachable.
//
// Used by:
//   - context/AuthContext.tsx — logout()
// -----------------------------------------------------------

export async function logoutApi(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } catch {
    // Best-effort — local teardown proceeds regardless
  }
}
