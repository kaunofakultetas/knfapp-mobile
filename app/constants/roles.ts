// -----------------------------------------------------------
//  [*] Roles — the shared role → label-key map
//
//  Every screen that names a user role resolves it through
//  roleLabel(), so the drawer, the ID card, the profile, the
//  register code check and the admin screens all name roles
//  identically — and an unknown backend role degrades to its
//  raw value instead of a blank or a raw i18n key.
//
//  Split into:
//
//    ROLE_KEYS — backend role → admin.role* catalog keys
//    roleLabel — translated label with the raw-role fallback
// -----------------------------------------------------------

// t comes in from each caller's useTranslation()
import type { TFunction } from 'i18next';




// backend role → the shared admin.role* label keys
export const ROLE_KEYS: Record<string, string> = {
  student: 'admin.roleStudent',
  teacher: 'admin.roleTeacher',
  curator: 'admin.roleCurator',
  admin: 'admin.roleAdmin',
};




// -----------------------------------------------------------
// roleLabel
// -----------------------------------------------------------
//
// The translated label for a backend role; a role the map does
// not know falls back to the raw string so new backend roles
// never render blank.
//
// Used by:
//   - components/Sidebar.tsx — drawer identity row
//   - app/register.tsx — invitation-code role wash
//   - app/(main)/profile/index.tsx — profile role line
//   - app/(main)/tabs/id.tsx — the ID card role pill
//   - app/(main)/admin/index.tsx — invitation role picker
//   - app/(main)/admin-users/index.tsx — role badge + picker
// -----------------------------------------------------------

export const roleLabel = (t: TFunction, role: string): string =>
  ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : role;
