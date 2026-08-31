// -----------------------------------------------------------
//  [*] socialuikit — PollBlock
//
//  The complete poll: ballots on one face, tallies on the
//  other. The results face wins whenever there is nothing left
//  to ask — the viewer already voted, the author closed the
//  poll, the clock ran out — or the viewer peeked through the
//  'see results' link (a one-way reveal: KitPoll carries no
//  way to unsee). Ballots come in the two answer shapes:
//  single-choice rows are radios and the tap itself is the
//  vote; multi-choice rows collect ticks for one submit
//  button. The kit never counts anything — every number is
//  display truth off the KitPoll, and a cast vote only becomes
//  real when the host reflects it back through poll.votedByMe.
//
//  The expiry check reads the provider's injected clock
//  (env.now) once per render, so a frozen test clock freezes
//  the poll; the footer countdown itself is a RelativeTime with
//  hasFuture, which keeps itself honest on the same clock.
//
//  Split into (root component last):
//
//    COLLAPSE_AT  — options shown before the expander
//    exactPercent — an option's bar width, 0-safe
//    leadingIds   — who is winning (ties share the crown)
//    VoteRow      — one ballot row (radio or checkbox)
//    ResultRow    — one tallied row (bar, percent, own mark)
//    PollBlock    — the block itself (default export)
// -----------------------------------------------------------

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { KitPoll, KitPollOption } from '../core/types';
import { useKitEnv, useKitLabels, useKitTheme } from '../provider';
import RelativeTime from '../time/RelativeTime';


// Both faces fold past this many options; expanding is one-way,
// like the reveal — collapsing back would yank rows out from
// under the reader's finger
const COLLAPSE_AT = 4;







// -----------------------------------------------------------
// exactPercent
// -----------------------------------------------------------
//
// The bar is drawn at the EXACT share while the text shows the
// rounded one — three '33%' bars of truly equal width would
// otherwise disagree with two 33s and a 34 in the labels. The
// denominator is people when the host knows them (multi-choice
// vote sums overshoot the crowd), votes otherwise; an empty
// poll divides by nothing and answers 0. Inconsistent host
// data is clamped so a bar never escapes its track.
//
// Used by:
//   - ResultRow (below)
// -----------------------------------------------------------

function exactPercent(option: KitPollOption, poll: KitPoll): number {

  const denominator = poll.voterCount ?? poll.totalVotes;
  if (!(denominator > 0)) return 0;


  return Math.max(0, Math.min(100, (option.voteCount / denominator) * 100));
}







// -----------------------------------------------------------
// leadingIds
// -----------------------------------------------------------
//
// Every option sharing the maximum POSITIVE vote count — a tie
// crowns them all, an untouched poll crowns nobody. Computed
// over the full option list, never the collapsed slice, so a
// leader hidden behind the expander keeps its crown.
//
// Used by:
//   - PollBlock (below) — feeds ResultRow's `leading`
// -----------------------------------------------------------

function leadingIds(options: readonly KitPollOption[]): Set<string> {

  const max = options.reduce((top, option) => Math.max(top, option.voteCount), 0);
  if (max <= 0) return new Set();


  return new Set(options.filter((option) => option.voteCount === max).map((option) => option.id));
}







// -----------------------------------------------------------
// VoteRow
// -----------------------------------------------------------
//
// One ballot row. Single-choice rows are radios whose tap IS
// the vote; multi-choice rows are checkboxes feeding the
// submit button. `disabled` folds all three locks into one — a
// guest, a host answering canVote: false, a vote in flight —
// and is guarded inside the handler too, because a host
// element's onPress can be invoked straight past the prop.
//
// Used by:
//   - PollBlock (below) — the ballot face
// -----------------------------------------------------------

function VoteRow({
  option,
  answerType,
  checked,
  disabled,
  onPress,
}: {
  option: KitPollOption;
  answerType: 'single' | 'multiple';
  checked: boolean;
  disabled: boolean;
  onPress: () => void;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const glyph = answerType === 'single' ? (checked ? 'radio-button-on' : 'radio-button-off') : checked ? 'checkbox' : 'square-outline';


  return (
    <Pressable
      testID={`socialuikit-poll-option-${option.id}`}
      accessibilityRole={answerType === 'single' ? 'radio' : 'checkbox'}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: checked ? colors.brand : colors.line,
        borderRadius: radii.chip,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginTop: 8,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Ionicons name={glyph} size={18} color={checked ? colors.brand : colors.inkFaint} />
      <Text numberOfLines={2} style={{ flex: 1, marginLeft: 10, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }}>
        {option.text}
      </Text>
    </Pressable>
  );
}







// -----------------------------------------------------------
// ResultRow
// -----------------------------------------------------------
//
// One tallied row: the wash bar underneath is the exact share,
// the trailing figure the rounded one, and the viewer's own
// pick carries the check glyph named labels.pollYourVote so a
// screen reader hears which row is theirs. Leaders read bold
// in the brand ink over the brand wash; the rest sit on the
// neutral chip ground.
//
// Used by:
//   - PollBlock (below) — the results face
// -----------------------------------------------------------

function ResultRow({ option, poll, leading }: { option: KitPollOption; poll: KitPoll; leading: boolean }) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  const percent = exactPercent(option, poll);


  return (
    <View testID={`socialuikit-poll-option-${option.id}`} style={{ borderRadius: radii.chip, overflow: 'hidden', marginTop: 8, backgroundColor: colors.bg }}>

      <View
        testID={`socialuikit-poll-bar-${option.id}`}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${percent}%`,
          borderRadius: radii.chip,
          backgroundColor: leading ? colors.brandSoft : colors.chip,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 }}>
        <Text
          numberOfLines={2}
          style={{
            flex: 1,
            fontSize: 15,
            fontFamily: leading ? fonts.bold : fonts.regular,
            fontWeight: leading ? '700' : '400',
            color: leading ? colors.brand : colors.ink,
          }}
        >
          {option.text}
        </Text>
        {option.votedByMe ? (
          <Ionicons name="checkmark-circle" size={16} color={colors.brand} accessibilityLabel={labels.pollYourVote} style={{ marginLeft: 6 }} />
        ) : null}
        <Text
          style={{
            marginLeft: 8,
            fontSize: 13,
            fontFamily: leading ? fonts.bold : fonts.regular,
            fontWeight: leading ? '700' : '400',
            color: leading ? colors.brand : colors.inkSoft,
          }}
        >
          {`${Math.round(percent)}%`}
        </Text>
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// PollBlock (default export)
// -----------------------------------------------------------
//
//   <PollBlock poll={poll} canVote={!!user} signedOut={!user}
//              submitting={voting} onVote={(ids) => vote(ids)}
//              onPressSignIn={openLogin}
//              onRefreshResults={refetch} />
//
// Used by:
//   - post/PostCard.tsx — the default poll body when the host
//     swaps nothing into components.PostPoll
//   - the host app's feed screens, through the root export
// -----------------------------------------------------------

export default function PollBlock({
  poll,
  canVote,
  submitting = false,
  signedOut = false,
  onVote,
  onPressSignIn,
  onRefreshResults,
}: {
  poll: KitPoll;
  canVote: boolean;
  submitting?: boolean;
  signedOut?: boolean;
  onVote: (optionIds: string[]) => void;
  onPressSignIn?: () => void;
  onRefreshResults?: () => void;
}) {

  const { colors, fonts, radii } = useKitTheme();
  const labels = useKitLabels();
  const env = useKitEnv();


  // All three local states are one-way PER POLL: results stay
  // revealed, the fold stays open, and ticks only ever matter
  // until the host flips poll.votedByMe. A mounted block handed
  // a DIFFERENT poll (a recycled list row, a reused detail
  // screen) resets all three during render — poll B must never
  // inherit poll A's ballot, its revealed face or its fold
  const [revealedLocally, setRevealedLocally] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statePollId, setStatePollId] = useState(poll.id);
  if (statePollId !== poll.id) {
    setStatePollId(poll.id);
    setRevealedLocally(false);
    setExpanded(false);
    setSelectedIds([]);
  }


  // The clock is read once per render — a poll expiring between
  // frames flips on the next render, which is soon enough. An
  // unparseable expiresAt compares as NaN < now → false, so bad
  // data leaves the poll open rather than killing it
  const now = env.now();
  const expired = poll.closed || (poll.expiresAt != null && new Date(poll.expiresAt).getTime() < now.getTime());
  const showResults = poll.votedByMe || poll.closed || expired || revealedLocally;


  const options = expanded || poll.options.length <= COLLAPSE_AT ? poll.options : poll.options.slice(0, COLLAPSE_AT);
  const hiddenCount = poll.options.length - options.length;
  const leaders = leadingIds(poll.options);
  const rowsLocked = submitting || signedOut || !canVote;


  // Ticks keep their tap order, so onVote reports the voter's
  // sequence, not the ballot's
  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((picked) => picked !== id) : [...prev, id]));

  const submitDisabled = selectedIds.length === 0 || rowsLocked;


  const tally = poll.voterCount != null ? labels.pollPeople(poll.voterCount) : labels.pollVotes(poll.totalVotes);


  return (
    <View testID="socialuikit-poll" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radii.card, padding: 12, backgroundColor: colors.surface }}>

      {poll.question ? (
        <Text
          accessibilityLabel={labels.pollQuestionA11y(poll.question)}
          style={{ fontSize: 15, fontFamily: fonts.medium, fontWeight: '600', color: colors.ink, marginBottom: 2 }}
        >
          {poll.question}
        </Text>
      ) : null}

      {/* The two faces — same testIDs per row, so a host test
          addresses an option without caring which face is up */}
      {showResults
        ? options.map((option) => <ResultRow key={option.id} option={option} poll={poll} leading={leaders.has(option.id)} />)
        : options.map((option) => (
            <VoteRow
              key={option.id}
              option={option}
              answerType={poll.answerType}
              checked={poll.answerType === 'single' ? option.votedByMe : selectedIds.includes(option.id)}
              disabled={rowsLocked}
              onPress={() => (poll.answerType === 'single' ? onVote([option.id]) : toggle(option.id))}
            />
          ))}

      {hiddenCount > 0 ? (
        <Pressable testID="socialuikit-poll-more" accessibilityRole="button" onPress={() => setExpanded(true)} style={{ paddingVertical: 8, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.brand }}>{labels.pollShowMore(hiddenCount)}</Text>
        </Pressable>
      ) : null}

      {/* The spinner takes the submit affordance's place for
          BOTH answer shapes — a single-choice vote in flight
          needs the same 'something is happening' anchor */}
      {!showResults && submitting ? (
        <View style={{ paddingVertical: 10, alignItems: 'center' }}>
          <ActivityIndicator testID="socialuikit-poll-spinner" color={colors.brand} />
        </View>
      ) : null}

      {!showResults && !submitting && poll.answerType === 'multiple' && !signedOut ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: submitDisabled }}
          disabled={submitDisabled}
          onPress={() => {
            if (!submitDisabled) onVote(selectedIds);
          }}
          style={{
            marginTop: 10,
            height: 40,
            borderRadius: radii.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: submitDisabled ? colors.chip : colors.brand,
          }}
        >
          <Text style={{ fontSize: 14, fontFamily: fonts.medium, fontWeight: '600', color: submitDisabled ? colors.inkFaint : colors.onBrand }}>
            {labels.pollSubmit}
          </Text>
        </Pressable>
      ) : null}

      {/* The guest hint stands where the submit button would —
          signing in is the guest's only meaningful action here */}
      {!showResults && signedOut ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onPressSignIn?.()}
          style={{ marginTop: 10, paddingVertical: 8, alignItems: 'center', borderRadius: radii.chip, backgroundColor: colors.brandSoft }}
        >
          <Text style={{ fontSize: 13, fontFamily: fonts.medium, color: colors.brand }}>{labels.pollSignInToVote}</Text>
        </Pressable>
      ) : null}

      {/* Pre-vote on an open poll only — and hidden while a vote
          is in flight, so the faces cannot flip mid-submit */}
      {!showResults && !submitting ? (
        <Pressable accessibilityRole="button" onPress={() => setRevealedLocally(true)} style={{ marginTop: 8, paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.inkSoft }}>{labels.pollSeeResults}</Text>
        </Pressable>
      ) : null}

      {showResults && onRefreshResults ? (
        <Pressable accessibilityRole="button" onPress={onRefreshResults} style={{ marginTop: 8, paddingVertical: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.regular, color: colors.brand }}>{labels.pollRefresh}</Text>
        </Pressable>
      ) : null}

      {/* The closed verdict beats any stale countdown; an open
          poll without a deadline shows the tally alone */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
        <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.inkFaint }}>{tally}</Text>
        {expired || poll.expiresAt ? <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.inkFaint }}>{' · '}</Text> : null}
        {expired ? (
          <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.inkFaint }}>{labels.pollClosed}</Text>
        ) : poll.expiresAt ? (
          <RelativeTime iso={poll.expiresAt} hasFuture style={{ fontSize: 12 }} />
        ) : null}
      </View>
    </View>
  );
}
