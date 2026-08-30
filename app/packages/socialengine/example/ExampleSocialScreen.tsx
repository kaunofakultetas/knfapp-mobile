// -----------------------------------------------------------
//  [*] socialengine — example: a social screen with no backend
//
//  The engine driving a deliberately plain UI — a ScrollView of
//  post cards in bare React Native — over fakeSocialTransport,
//  so nothing outside this file is needed: no server, no UI
//  kit, no host app. Paste it into a blank Expo project and it
//  runs. It shows the complete contract a UI consumes:
//
//    useLikeToggle   — the optimistic like on every card
//    usePoll         — one card carries a poll, voted
//                      pessimistically
//    useRelationship — the connect button on Ona's strip
//    useUnreadBadge  — the count on the header's activity pill
//
//  POSTS below stands in for the host's fetching layer: the
//  engine treats those rows as immutable server truth and
//  layers the viewer's intents over them, which is why the
//  array is a plain module constant and is never mutated.
//
//  Split into (root component last):
//
//    useDemoBackend      — one fake transport for the demo's life
//    ActivityBadge       — the unread pill in the header
//    ConnectButton       — one user's standing, actionable
//    LikeButton          — heart + count over useLikeToggle
//    PollBlock           — choices, then results, over usePoll
//    PostCard            — author line + text + interactions
//    Screen              — header, profile strip, the feed
//    ExampleSocialScreen — provider wiring (default export)
// -----------------------------------------------------------

import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  SocialEngineProvider,
  fakeSocialTransport,
  pollPercent,
  showPollResults,
  useLikeToggle,
  usePoll,
  useRelationship,
  useUnreadBadge,
  type FakeSocialTransport,
  type Poll,
  type RelationshipAction,
  type RelationshipState,
  type SocialNoticeCode,
  type SocialPost,
  type SocialUser,
} from '../src';


const ME: SocialUser = { id: 'me', displayName: 'Aš' };
const ONA: SocialUser = { id: 'u-ona', displayName: 'Ona', handle: '@ona' };
const TOMAS: SocialUser = { id: 'u-tomas', displayName: 'Tomas' };

const NOW = Date.now();
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

// The poll lives in the fake's store and travels by id — the
// post only carries pollId, exactly as a real backend would
const POLL: Poll = {
  id: 'poll-1',
  question: 'Kur švenčiam sesijos pabaigą?',
  options: [
    { id: 'opt-a', text: 'Kavinėje', voteCount: 2, votedByMe: false },
    { id: 'opt-b', text: 'Prie Nemuno', voteCount: 3, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 5,
  voterCount: 5,
  closed: false,
  votedByMe: false,
};

// Immutable server truth — what the host's fetching layer would
// hand a real screen. likeCounts match the fake's like seeds so
// the "server" and the rows agree from the first render
const POSTS: SocialPost[] = [
  { id: 'p-1', author: ONA, text: 'Balsuokim!', createdAt: iso(30), likeCount: 3, commentCount: 1, likedByMe: false, isOwn: false, pollId: POLL.id },
  { id: 'p-2', author: TOMAS, text: 'The engine runs with no server behind it.', createdAt: iso(20), likeCount: 7, commentCount: 0, likedByMe: false, isOwn: false },
  { id: 'p-3', author: ME, text: 'Own rows like fine too.', createdAt: iso(5), likeCount: 0, commentCount: 0, likedByMe: false, isOwn: true },
];








// -----------------------------------------------------------
// useDemoBackend
// -----------------------------------------------------------
//
// One fake transport for the demo's lifetime, seeded so every
// hook has something to chew on: the poll, Ona's 'none'
// standing (the connect button's starting point), authoritative
// like counters matching POSTS, and two unread activity rows
// for the badge.
//
// Used by:
//   - ExampleSocialScreen (below)
// -----------------------------------------------------------

function useDemoBackend(): FakeSocialTransport {
  const ref = useRef<FakeSocialTransport | null>(null);
  if (!ref.current) {
    ref.current = fakeSocialTransport({
      polls: [POLL],
      relationships: { [ONA.id]: 'none' },
      likes: {
        'post:p-1': { liked: false, count: 3 },
        'post:p-2': { liked: false, count: 7 },
        'post:p-3': { liked: false, count: 0 },
      },
      notifications: [
        { id: 'n-1', kind: 'like', actor: TOMAS, createdAt: iso(60), read: false, subjectId: 'p-3', subjectPreview: 'Own rows like fine too.' },
        { id: 'n-2', kind: 'like', actor: ONA, createdAt: iso(45), read: false, subjectId: 'p-3', subjectPreview: 'Own rows like fine too.' },
      ],
    });
  }
  return ref.current;
}








// -----------------------------------------------------------
// ActivityBadge
// -----------------------------------------------------------
//
// The unread count over useUnreadBadge — '' renders nothing at
// all, and the hook already caps a runaway count at '30+'.
//
// Used by:
//   - Screen (below), in the header row
// -----------------------------------------------------------

function ActivityBadge() {

  const { badge } = useUnreadBadge();


  if (!badge) return null;
  return (
    <View style={{ backgroundColor: '#7B003F', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 }}>
      <Text testID="unread-badge" style={{ color: '#FFF', fontSize: 11, fontWeight: '600' }}>{badge}</Text>
    </View>
  );
}








// -----------------------------------------------------------
// ConnectButton
// -----------------------------------------------------------
//
// One user's standing with the viewer, actionable. The label
// and the next action both come off the MERGED state, so the
// button walks none → outgoing the instant the viewer taps and
// the server's confirmed word corrects it if the backend is
// instant-connect.
//
// Used by:
//   - Screen (below), on Ona's profile strip
// -----------------------------------------------------------

// 'self', 'blocking' and 'blockedBy' render nothing — a blocked
// viewer must see NOTHING actionable, by design
const CONNECT_STEP: Partial<Record<RelationshipState, { label: string; action: RelationshipAction }>> = {
  none: { label: 'Connect', action: 'connect' },
  outgoing: { label: 'Requested', action: 'cancel' },
  incoming: { label: 'Accept', action: 'accept' },
  connected: { label: 'Connected', action: 'disconnect' },
};

function ConnectButton({ user, base }: { user: SocialUser; base: RelationshipState }) {

  const { state, pending, canAct, act } = useRelationship(user.id, base);


  const step = CONNECT_STEP[state];
  if (!step) return null;


  return (
    <Pressable
      testID="connect"
      disabled={!canAct || pending}
      onPress={() => act(step.action)}
      style={{ borderWidth: 1, borderColor: '#7B003F', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, opacity: pending ? 0.5 : 1 }}
    >
      <Text style={{ color: '#7B003F', fontSize: 12 }}>{step.label}</Text>
    </Pressable>
  );
}








// -----------------------------------------------------------
// LikeButton
// -----------------------------------------------------------
//
// Heart + count over useLikeToggle. The count shown is the
// diff-merge of the immutable base row and the viewer's shadow,
// so it flips the instant the row is tapped and can never
// double count after a refetch.
//
// Used by:
//   - PostCard (below)
// -----------------------------------------------------------

function LikeButton({ post }: { post: SocialPost }) {

  const { liked, likeCount, pending, toggle } = useLikeToggle(post);


  return (
    <Pressable testID={`like-${post.id}`} onPress={toggle} style={{ opacity: pending ? 0.6 : 1, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: liked ? '#7B003F' : '#666' }}>{`${liked ? '❤' : '♡'} ${likeCount}`}</Text>
    </Pressable>
  );
}








// -----------------------------------------------------------
// PollBlock
// -----------------------------------------------------------
//
// Choices until the viewer votes, peeks or the poll ends; then
// results. Labels round the percent — the raw value is for bar
// widths, which this plain demo does not draw. Voting is
// pessimistic: the rows only change when the server's answer
// replaces the poll wholesale.
//
// Used by:
//   - PostCard (below), when the post carries a pollId
// -----------------------------------------------------------

function PollBlock({ pollId }: { pollId: string }) {

  const p = usePoll(pollId);


  if (p.error) {
    return (
      <Text style={{ marginTop: 8, fontSize: 12, color: '#B00020' }} onPress={p.refresh}>
        Poll failed to load — tap to retry
      </Text>
    );
  }
  if (p.loading || p.missing || p.poll === null) return null;


  const poll = p.poll;
  const results = showPollResults(poll, p.revealed, new Date());


  return (
    <View style={{ marginTop: 8, borderWidth: 1, borderColor: '#EEE', borderRadius: 10, padding: 10 }}>
      <Text style={{ fontWeight: '600', marginBottom: 4 }}>{poll.question}</Text>
      {poll.options.map((option) => (
        <Pressable
          key={option.id}
          testID={`poll-${option.id}`}
          disabled={!p.canVote || p.submitting}
          onPress={() => void p.vote([option.id])}
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ color: option.votedByMe ? '#7B003F' : '#333' }}>
            {results ? `${option.text} — ${Math.round(pollPercent(option, poll))}% (${option.voteCount})${option.votedByMe ? ' ✓' : ''}` : option.text}
          </Text>
        </Pressable>
      ))}
      {results ? (
        <Text style={{ fontSize: 12, color: '#999' }}>{`${poll.voterCount ?? poll.totalVotes} voted`}</Text>
      ) : (
        <Text style={{ fontSize: 12, color: '#7B003F' }} onPress={p.revealResults}>Peek at results</Text>
      )}
    </View>
  );
}








// -----------------------------------------------------------
// PostCard
// -----------------------------------------------------------
//
// Used by:
//   - Screen (below), one per POSTS row
// -----------------------------------------------------------

function PostCard({ post }: { post: SocialPost }) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#EEE', padding: 12 }}>
      <Text style={{ fontWeight: '600' }}>{post.author.displayName}{post.author.handle ? `  ${post.author.handle}` : ''}</Text>
      <Text style={{ marginTop: 4 }}>{post.text}</Text>
      {post.pollId ? <PollBlock pollId={post.pollId} /> : null}
      <LikeButton post={post} />
    </View>
  );
}








// -----------------------------------------------------------
// Screen
// -----------------------------------------------------------
//
// Used by:
//   - ExampleSocialScreen (below), inside the provider
// -----------------------------------------------------------

function Screen({ lastNotice }: { lastNotice: SocialNoticeCode | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFF' }}>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#7B003F' }}>Bendruomenė</Text>
        <ActivityBadge />
      </View>


      {/* Ona's profile strip — 'none' is the server truth the
          relationship hook layers the viewer's intent over */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FAF7F8' }}>
        <Text style={{ flex: 1 }}>{`${ONA.displayName}  ${ONA.handle}`}</Text>
        <ConnectButton user={ONA} base="none" />
      </View>


      <ScrollView>
        {POSTS.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ScrollView>


      {lastNotice ? <Text style={{ padding: 8, fontSize: 12, color: '#B00020' }}>notice: {lastNotice}</Text> : null}
    </View>
  );
}








// -----------------------------------------------------------
// ExampleSocialScreen (default export)
// -----------------------------------------------------------
//
// The provider takes: the transport, who is signed in (null
// would make every write route to onRequireAuth instead), a
// notice sink (codes — map them to your strings), and the
// login-flow hook. Everything a real host wires is visible
// here.
// -----------------------------------------------------------

export default function ExampleSocialScreen() {

  const transport = useDemoBackend();
  // Codes, never strings — a real host maps them to translations
  const [lastNotice, setLastNotice] = useState<SocialNoticeCode | null>(null);


  return (
    <SocialEngineProvider
      transport={transport}
      currentUser={ME}
      notify={(n) => setLastNotice(n.code)}
      onRequireAuth={() => setLastNotice('auth_required')}
    >
      <Screen lastNotice={lastNotice} />
    </SocialEngineProvider>
  );
}
