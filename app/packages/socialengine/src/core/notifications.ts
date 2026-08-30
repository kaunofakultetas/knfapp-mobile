// -----------------------------------------------------------
//  [*] socialengine — notification grouping
//
//  Collapses a flat activity list into rows like "Ona and 3
//  others liked your post". Pure and synchronous — the hook
//  memoizes over it; hosts with their own fetching can call it
//  directly.
//
//  The rules, all of them:
//    - only groupable kinds merge (default: like,
//      connect_accept). Content-bearing kinds (comment, reply,
//      mention) and actionable ones (connect_request carries an
//      accept button) always stand alone.
//    - a merge needs the same kind AND the same subjectId AND a
//      createdAt within windowMs (default 48 h) of the group's
//      NEWEST member — a stale like never rides a fresh row.
//    - actors are deduped (a repeat actor lists once), ordered
//      newest-first and capped at maxActors (default 5);
//      `notifications` keeps every original so expansion costs
//      nothing.
//    - a group reads as read only when EVERY member is read.
//
//  Input order is never trusted: the list is re-sorted by
//  createdAt (newest first) before anything else, which also
//  fixes the output order and pins group.key — the newest
//  member's id — regardless of how the pages arrived.
//
//  Used by:
//    - hooks/useNotifications.ts — groups whatever it holds
//    - hosts re-grouping a list of their own (public export)
// -----------------------------------------------------------

import type { NotificationGroup, NotificationKind, SocialNotification, SocialUser } from './types';


export interface GroupNotificationsOptions {
  // Kinds allowed to merge; every other kind stands alone
  groupableKinds?: NotificationKind[];
  // How far behind the group's newest member a row may trail
  windowMs?: number;
  // Cap on the actors LIST only — notifications keep everything
  maxActors?: number;
}

// 48 hours — older activity on the same subject reads better as
// its own row than as a tail on a fresh one
const DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000;

const DEFAULT_GROUPABLE_KINDS: NotificationKind[] = ['like', 'connect_accept'];

const DEFAULT_MAX_ACTORS = 5;

// A malformed stamp sorts last instead of poisoning the
// comparator with NaN
const parseTime = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

// A group still absorbing members. Actors stay uncapped here so
// dedupe keeps seeing repeat actors past the display limit
interface OpenGroup {
  newest: SocialNotification;
  newestTime: number;
  actors: SocialUser[];
  actorIds: Set<string>;
  notifications: SocialNotification[];
  allRead: boolean;
  subjectPreview: string | null;
}







// -----------------------------------------------------------
// groupNotifications
// -----------------------------------------------------------
//
//   groupNotifications(list)                 — the defaults
//   groupNotifications(list, { windowMs })   — tighter window
//   groupNotifications(list, {
//     groupableKinds: ['like'] })            — accepts stay solo
//
// Used by:
//   - hooks/useNotifications.ts — the grouped rows it serves
//   - hosts with their own fetching (public export)
// -----------------------------------------------------------

export function groupNotifications(list: SocialNotification[], options?: GroupNotificationsOptions): NotificationGroup[] {

  const groupable = new Set(options?.groupableKinds ?? DEFAULT_GROUPABLE_KINDS);
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const maxActors = options?.maxActors ?? DEFAULT_MAX_ACTORS;


  // Newest first; ties keep their relative input order (sort is
  // stable), so a backend sending same-second rows stays sane
  const sorted = [...list].sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));


  const built: OpenGroup[] = [];
  // kind + subjectId → the group currently absorbing that bucket.
  // A NUL sentinel marks "no subject" so it can never collide with a real id
  const openByBucket = new Map<string, OpenGroup>();

  for (const row of sorted) {
    const bucket = `${row.kind}\n${row.subjectId == null ? '\u0000' : row.subjectId}`;
    const open = groupable.has(row.kind) ? openByBucket.get(bucket) : undefined;

    if (open && open.newestTime - parseTime(row.createdAt) <= windowMs) {
      open.notifications.push(row);
      if (!open.actorIds.has(row.actor.id)) {
        open.actorIds.add(row.actor.id);
        open.actors.push(row.actor);
      }
      open.allRead = open.allRead && row.read;
      // The newest member's preview wins; an older one only fills
      // a hole (pages sometimes carry the excerpt on one row only)
      if (open.subjectPreview == null && row.subjectPreview != null) open.subjectPreview = row.subjectPreview;
      continue;
    }

    const fresh: OpenGroup = {
      newest: row,
      newestTime: parseTime(row.createdAt),
      actors: [row.actor],
      actorIds: new Set([row.actor.id]),
      notifications: [row],
      allRead: row.read,
      subjectPreview: row.subjectPreview ?? null,
    };
    built.push(fresh);
    // A row past the window RETIRES the bucket's old group — an
    // even older row can only join this fresh one, never leapfrog
    if (groupable.has(row.kind)) openByBucket.set(bucket, fresh);
  }


  // Groups were opened walking newest-first, so `built` is
  // already in output order
  return built.map((g) => ({
    key: g.newest.id,
    kind: g.newest.kind,
    actors: g.actors.slice(0, maxActors),
    notifications: g.notifications,
    newestAt: g.newest.createdAt,
    read: g.allRead,
    subjectId: g.newest.subjectId ?? null,
    subjectPreview: g.subjectPreview,
  }));
}
