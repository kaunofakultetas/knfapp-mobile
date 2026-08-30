// -----------------------------------------------------------
//  [*] socialuikit — example
//
//  The whole kit on one screen, with no host app and no server:
//  an in-file dataset of KitPost rows covering every card face
//  (a four-image album, an unfurled link, a poll, an edited
//  post, a post wearing a source chip), the activity row and
//  the connect button as the feed's header, and the comment bar
//  pinned underneath. Every piece of state is a useState in
//  this file, so a reader sees the full loop in one place:
//  rows go in through props, taps come back through callbacks,
//  the "host" (this screen) patches its data, the kit
//  re-renders — a like flips optimistically on the row itself,
//  a cast vote swaps the poll's ballot face for results,
//  accepting the connect request flips the button's face.
//  Render it anywhere (a route, a story, a test).
//
//  Split into (root component last):
//
//    FALLBACK_METRICS / ENV     — jest/web safe-area, host env
//    ONA…, minutesAgo, seed*    — the in-file dataset
//    FeedHeader                 — activity row + connect button
//    ExampleFeedScreen          — the screen (default export)
// -----------------------------------------------------------

import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

// The kit — this package
import {
  CommentComposer,
  ConnectButton,
  defaultTheme,
  FeedList,
  NotificationRow,
  PollBlock,
  PostCard,
  SocialUiKitProvider,
  type KitNotification,
  type KitPoll,
  type KitPost,
  type KitRelationship,
  type KitUser,
} from '../src';


// Native safe-area metrics arrive on device; jest and the
// web's first frame have none, so a zero frame keeps the demo
// rendering synchronously instead of waiting for a measurement
const FALLBACK_METRICS = {
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 390, height: 800 },
};

// Module-level so the provider's memo sees one stable object;
// the resolver shows the seam a real host fills with its CDN
const ENV = {
  resolveImageUrl: (url: string) => (url.startsWith('http') ? url : `https://demo.invalid${url}`),
};


const ONA: KitUser = { id: 'ona', displayName: 'Ona Petrauskaitė', handle: 'ona' };
const JONAS: KitUser = { id: 'jonas', displayName: 'Jonas Kazlauskas' };
const RUTA: KitUser = { id: 'ruta', displayName: 'Rūta Vilkaitė' };

// Recent-past stamps keep RelativeTime in its relative bands
// ("Ką tik", "25 min.") on the real clock, whenever this runs
const NOW = Date.now();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();


// One row per card face the kit can draw. The poll post
// carries NO poll field — the poll rides through pollSlot
// below, which is the kit's contract: the card never fetches
// or renders a poll itself
const seedPosts: KitPost[] = [
  {
    id: 'p-gallery',
    author: JONAS,
    text: 'Bendruomenės dienos akimirkos — ačiū visiems atėjusiems!',
    createdAt: minutesAgo(4),
    media: [1, 2, 3, 4].map((n) => ({
      url: `/uploads/diena-${n}.jpg`,
      kind: 'image' as const,
      width: 1200,
      height: 800,
      alt: n === 1 ? 'Studentai vidiniame kieme' : null,
    })),
    likeCount: 12,
    commentCount: 3,
    likedByMe: false,
    isOwn: false,
  },
  {
    id: 'p-link',
    author: RUTA,
    text: 'Verta perskaityti prieš registraciją:',
    createdAt: minutesAgo(25),
    link: {
      url: 'https://knf.vu.lt/naujienos/mainai',
      title: 'Mainų programos ruduo',
      description: 'Atranka prasideda rugsėjo 15 d. — terminai, kriterijai ir partnerių sąrašas.',
      siteName: 'knf.vu.lt',
      imageUrl: '/uploads/mainai.jpg',
    },
    likeCount: 7,
    commentCount: 1,
    likedByMe: true,
    isOwn: false,
  },
  {
    id: 'p-poll',
    author: ONA,
    text: 'Padėkite išsirinkti!',
    createdAt: minutesAgo(60),
    likeCount: 5,
    commentCount: 8,
    likedByMe: false,
    isOwn: false,
  },
  {
    id: 'p-edited',
    author: ONA,
    text: 'Paskaita perkelta į 402 auditoriją (ne 401 — atsiprašau!).',
    createdAt: minutesAgo(180),
    editedAt: minutesAgo(170),
    likeCount: 2,
    commentCount: 0,
    likedByMe: false,
    isOwn: true,
  },
  {
    id: 'p-source',
    author: ONA,
    text: 'Registracija į rudens semestro būrelius jau atidaryta — vietų skaičius ribotas.',
    createdAt: minutesAgo(300),
    source: { id: 'knf', label: 'KNF naujienos' },
    likeCount: 31,
    commentCount: 6,
    likedByMe: false,
    isOwn: false,
  },
];


const seedPoll: KitPoll = {
  id: 'poll-1',
  question: 'Kada rengiame filmų vakarą?',
  options: [
    { id: 'a', text: 'Ketvirtadienį', voteCount: 9, votedByMe: false },
    { id: 'b', text: 'Penktadienį', voteCount: 14, votedByMe: false },
    { id: 'c', text: 'Šeštadienį', voteCount: 4, votedByMe: false },
  ],
  answerType: 'single',
  totalVotes: 27,
  voterCount: 27,
  expiresAt: new Date(NOW + 3 * 24 * 3_600_000).toISOString(),
  closed: false,
  votedByMe: false,
};


const seedNotification: KitNotification = {
  key: 'n-connect',
  kind: 'connect_request',
  actors: [JONAS],
  newestAt: minutesAgo(10),
  read: false,
};







// -----------------------------------------------------------
// FeedHeader
// -----------------------------------------------------------
//
// The strip above the first card: the (unread) activity row
// and, underneath it, the connect button showing whatever face
// the current relationship affords. Display truth like every
// kit piece — both the read flag and the relationship live in
// the screen's state and only change through the callbacks.
//
// Used by:
//   - ExampleFeedScreen (below) — FeedList's ListHeaderComponent
// -----------------------------------------------------------

function FeedHeader({
  notification,
  relationship,
  onOpen,
  onAction,
}: {
  notification: KitNotification;
  relationship: KitRelationship;
  onOpen: () => void;
  // The verb ConnectButton fires ('accept', 'decline', …) —
  // typed wide because ConnectAction is not on the surface
  onAction: (action: string) => void;
}) {
  return (
    <View style={{ borderRadius: defaultTheme.radii.card, overflow: 'hidden', marginBottom: 12, backgroundColor: defaultTheme.colors.surface }}>

      <NotificationRow notification={notification} onPress={onOpen} />

      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <ConnectButton state={relationship} onAction={onAction} />
      </View>

    </View>
  );
}







// -----------------------------------------------------------
// ExampleFeedScreen (default export)
// -----------------------------------------------------------
//
// Two wrappers a real host mounts once at its root — the
// safe-area provider and SocialUiKitProvider (Lithuanian
// defaults, only the image resolver filled in) — then one
// FeedList over the dataset with the comment bar pinned under
// it. A host swaps the useState patches for its data layer's
// mutations; the kit wiring stays exactly this.
//
// Used by:
//   - example/__tests__/example.test.tsx — mounts it whole
//   - anyone dropping the kit into a route to see it work
// -----------------------------------------------------------

export default function ExampleFeedScreen() {

  const [posts, setPosts] = useState(seedPosts);
  const [poll, setPoll] = useState(seedPoll);
  const [notification, setNotification] = useState(seedNotification);
  const [relationship, setRelationship] = useState<KitRelationship>('incoming');


  // The optimistic flip: patch the row in place and let memoised
  // cards re-render just that one. A real host fires its request
  // here too and flips back if the server refuses
  const toggleLike = (id: string) =>
    setPosts((prev) =>
      prev.map((post) =>
        post.id === id
          ? { ...post, likedByMe: !post.likedByMe, likeCount: post.likeCount + (post.likedByMe ? -1 : 1) }
          : post,
      ),
    );


  // Polls are pessimistic by contract — the ballot face only
  // swaps once the host reflects votedByMe back. The demo's
  // "server" answers instantly
  const castVote = (optionIds: string[]) =>
    setPoll((prev) => ({
      ...prev,
      votedByMe: true,
      totalVotes: prev.totalVotes + optionIds.length,
      voterCount: (prev.voterCount ?? 0) + 1,
      options: prev.options.map((option) =>
        optionIds.includes(option.id) ? { ...option, voteCount: option.voteCount + 1, votedByMe: true } : option,
      ),
    }));


  // The composer clears only on true — the demo accepts every
  // comment and bumps the newest post's tally so the number
  // visibly moves; a real host posts the text to its thread
  const submitComment = async (_text: string): Promise<boolean> => {
    setPosts((prev) => prev.map((post, i) => (i === 0 ? { ...post, commentCount: post.commentCount + 1 } : post)));
    return true;
  };


  // Opening the activity row marks it read (the tint and dot
  // drop); the connect verbs walk the little state machine a
  // real host would answer with server truth — accept lands on
  // 'connected', a fresh connect on 'outgoing', everything else
  // (decline, cancel, disconnect, unblock) back on 'none'
  const openNotification = () => setNotification((prev) => ({ ...prev, read: true }));

  const connectAction = (action: string) =>
    setRelationship(action === 'accept' ? 'connected' : action === 'connect' ? 'outgoing' : 'none');


  // pollSlot only on the poll post — every other card passes
  // undefined (absent), so nothing poll-shaped renders there
  const renderPost = (post: KitPost) => (
    <PostCard
      post={post}
      onPressLike={() => toggleLike(post.id)}
      onPressComment={() => {}}
      pollSlot={post.id === 'p-poll' ? <PollBlock poll={poll} canVote onVote={castVote} /> : undefined}
      snippetLength={280}
    />
  );


  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_METRICS}>
      <SocialUiKitProvider env={ENV}>
        <View style={{ flex: 1, backgroundColor: defaultTheme.colors.bg }}>

          <FeedList
            items={posts}
            keyOf={(post) => post.id}
            renderItem={renderPost}
            ListHeaderComponent={
              <FeedHeader
                notification={notification}
                relationship={relationship}
                onOpen={openNotification}
                onAction={connectAction}
              />
            }
            contentContainerStyle={{ padding: 12, gap: 12 }}
          />

          <CommentComposer canComment onSubmit={submitComment} />

        </View>
      </SocialUiKitProvider>
    </SafeAreaProvider>
  );
}
