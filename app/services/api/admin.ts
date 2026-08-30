// -----------------------------------------------------------
//  [*] API — admin
//
//  Admin-role endpoints: usage stats, invitation-code
//  management and the user list. All of them answer 403 for
//  non-admin sessions — screens gate on user.role before
//  calling.
//
//  Split into:
//
//    AdminInvitation       — one invitation code
//    AdminStats            — dashboard counters
//    AdminUser             — one user-management row
//    fetchAdminStats       — dashboard numbers
//    fetchAdminInvitations — list invitation codes
//    createInvitation      — mint a code
//    revokeInvitation      — delete a code
//    fetchAdminUsers       — list all users
//    updateAdminUser       — change role / active flag
//    deleteAdminUser       — erase an account (GDPR)
// -----------------------------------------------------------

// Shared client core
import { api, request } from './client';

// The backend role enum — one shared model app-wide
import type { UserRole } from '@/types';







// -----------------------------------------------------------
// AdminInvitation
// -----------------------------------------------------------
//
// Used by:
//   - fetchAdminInvitations, createInvitation (below)
//   - app/(main)/admin/index.tsx — invitation cards
// -----------------------------------------------------------

export interface AdminInvitation {
  id: string;
  code: string;
  role: string;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  fullyUsed: boolean;
}







// -----------------------------------------------------------
// AdminStats
// -----------------------------------------------------------
//
// Used by:
//   - fetchAdminStats (below)
//   - app/(main)/admin/index.tsx — the dashboard tiles
// -----------------------------------------------------------

export interface AdminStats {
  users: number;
  posts: number;
  scrapedArticles: number;
  comments: number;
  activeInvitations: number;
}







// -----------------------------------------------------------
// AdminUser
// -----------------------------------------------------------
//
// `active` comes back on both the list and the update
// responses since backend migration v8; it stays optional
// only so an older backend that omits it reads as "unknown"
// rather than deactivated.
//
// Used by:
//   - fetchAdminUsers, updateAdminUser (below)
//   - app/(main)/admin-users/index.tsx — user rows + toggles
// -----------------------------------------------------------

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  active?: boolean;
}







// -----------------------------------------------------------
// fetchAdminStats
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/admin/index.tsx — dashboard load
// -----------------------------------------------------------

export const fetchAdminStats = () => request(api.get<AdminStats>('/admin/stats'));







// -----------------------------------------------------------
// fetchAdminInvitations
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/admin/index.tsx — invitation list
// -----------------------------------------------------------

export const fetchAdminInvitations = () =>
  request(api.get<{ invitations: AdminInvitation[] }>('/admin/invitations'));







// -----------------------------------------------------------
// createInvitation
// -----------------------------------------------------------
//
// The 201 body carries only the stored columns — createdAt,
// expired and fullyUsed are list-time derivations the caller
// fills in for a fresh code (now / false / false) before
// prepending it to the list.
//
// Used by:
//   - app/(main)/admin/index.tsx — "new code" form
// -----------------------------------------------------------

export const createInvitation = (params: {
  role?: string;
  max_uses?: number;
  expires_hours?: number;
}) =>
  request(
    api.post<Omit<AdminInvitation, 'createdAt' | 'expired' | 'fullyUsed'>>(
      '/admin/invitations',
      params,
    ),
  );







// -----------------------------------------------------------
// revokeInvitation
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/admin/index.tsx — code delete action
// -----------------------------------------------------------

export async function revokeInvitation(codeId: string): Promise<void> {
  await request(api.delete(`/admin/invitations/${encodeURIComponent(codeId)}`));
}







// -----------------------------------------------------------
// fetchAdminUsers
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/admin-users/index.tsx — user list load
// -----------------------------------------------------------

export const fetchAdminUsers = () =>
  request(api.get<{ users: AdminUser[] }>('/admin/users'));







// -----------------------------------------------------------
// updateAdminUser
// -----------------------------------------------------------
//
// Deactivation (active: false) deletes the user's sessions
// AND is enforced by the backend: login answers 403 and every
// authenticated request from a stale session is refused. The
// backend rejects non-boolean `active` values with 400.
//
// Used by:
//   - app/(main)/admin-users/index.tsx — role/active editors
// -----------------------------------------------------------

export const updateAdminUser = (
  userId: string,
  updates: { role?: UserRole; active?: boolean },
) => request(api.patch<AdminUser>(`/admin/users/${encodeURIComponent(userId)}`, updates));




// -----------------------------------------------------------
// deleteAdminUser
// -----------------------------------------------------------
//
// The admin's erasure path — the same routine as the user's
// own DELETE /auth/me, without a password confirm: the row is
// anonymised, posts tombstoned, everything personal deleted.
// 400 for the caller's own id (that goes through /auth/me)
// and for the last active admin; 404 for an unknown id.
//
// Used by:
//   - app/(main)/admin-users/index.tsx — the erase action
// -----------------------------------------------------------

export async function deleteAdminUser(userId: string): Promise<void> {
  await request(api.delete(`/admin/users/${encodeURIComponent(userId)}`));
}
