# Changelog

## 1.0.0 — 2026-08-30

The presentational social-feed kit, standalone behind `SocialUiKitProvider`.

- **Provider** — one seam for theme (light/dark bases, deep-partial
  override), labels (LT-first catalogs with declining count functions,
  partial merge), component swap-outs (`Avatar`, `PostPoll`,
  `EmptyState`) and the three host functions (`resolveImageUrl`,
  `openHref`, `now`); neutral defaults with no provider at all.
- **PostCard + ActionRow** — the card with author row, edited mark,
  source chip, snippet fold, at most one attachment block (media beats
  link), the poll slot, the deleted face; memo-wrapped display truth
  with spoken action names carrying live tallies.
- **MediaGallery + LinkCard** — 3:2 albums with a clamped lone-image
  exception, four tiles and a "+N" wash (`gallerySpans` exported pure),
  video and ALT overlays; link cards in three sizes by what the
  unfurler found.
- **PollBlock** — ballots/results gating on the injected clock, tap-is-
  the-vote singles, tick-and-submit multiples, exact bar widths, shared
  crowns, the four-option fold, the guest hint.
- **CommentRow + CommentComposer** — bubbles with a deleted face; a
  draft-owning composer that clears only on a confirmed submit, with
  the signed-out prompt row.
- **ConnectButton + ProfileHeader** — one face per relationship state
  (nothing for `self` and `blockedBy`), the profile top with compacted
  tallies and an actions slot.
- **NotificationRow** — grouped activity with stacked portraits,
  forward-compatible kinds, the unread tint and dot.
- **FeedList + NewPostsPill + RowErrorBoundary** — the top-down feed
  scaffold: per-row error sealing with try-again, guarded paging,
  optional pull-to-refresh, the new-posts pill.
- **RelativeTime** — self-updating stamps and (`hasFuture`) countdowns
  on one boundary-aimed timeout; clock-skew clamp.
- **Formatters** — `formatCount` (floored compaction), `clampSnippet`
  (word-boundary fold).
- **Tests** — the pure helpers, the provider merge and LT/EN parity,
  render-level pins per component, the poll contract, the public
  surface pin, and the example screen proven live; `TZ=UTC` pinned.
- **Example** — `example/ExampleFeedScreen.tsx`: the whole kit on one
  screen over in-file state (optimistic likes, a live poll through
  `pollSlot`, the connect flow, the comment bar).
