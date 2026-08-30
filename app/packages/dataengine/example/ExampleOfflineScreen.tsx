// -----------------------------------------------------------
//  [*] dataengine — example: an offline-first board, no backend
//
//  useFeed driving a deliberately plain screen — a FlatList in
//  bare React Native — over a fake in-file server, so nothing
//  outside this file is needed. Paste it into a blank Expo
//  project and it runs. The arc it walks:
//
//    - the demo MOUNTS OFFLINE with a seeded cache, so the
//      first page you see is the offline copy under a cachedAt
//      banner ("error" never shows — there is something to show);
//    - the network toggle flips manualNetwork(), and the
//      offline→online transition is the provider's restore
//      event: useFeed refetches by itself, the live page
//      replaces the copy, the banner goes;
//    - scrolling to the end pages through loadMore;
//    - pull-to-refresh runs refresh('merge') — the fake server
//      gains a post between page-1 fetches, and the merge folds
//      it in on top while the loaded pages keep their place.
//
//  A real host swaps memoryStorage for AsyncStorage and
//  manualNetwork for a connectivity wrapper — nothing else
//  changes (see the README).
//
//  Used by:
//    - example/__tests__/example.test.tsx — mounts it whole
// -----------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import {
  DataEngineProvider,
  createCache,
  manualNetwork,
  memoryStorage,
  useFeed,
  type FeedPage,
  type KeyValueStorage,
  type NetworkSource,
} from '../src';


const PAGE_SIZE = 4;
const CACHE_KEY = 'feed:board';

interface Post {
  id: string;
  author: string;
  text: string;
}

const post = (id: number, author: string, text: string): Post => ({ id: `p${id}`, author, text });







// -----------------------------------------------------------
// Demo server
// -----------------------------------------------------------
//
// One fake backend for the demo's lifetime: a page-sliced row
// list that throws while the manual network is off, gains a
// fresh post on every page-1 fetch after the first (so a merge
// refresh has something to fold in), and a cache seeded before
// mount — the "last visit" whose copy the offline first page
// serves. The demo starts OFFLINE on purpose.
//
// Used by:
//   - ExampleOfflineScreen (below) — provider wiring
//   - Board (below) — fetchPage and the toggle
// -----------------------------------------------------------

interface DemoServer {
  storage: KeyValueStorage;
  network: NetworkSource & { set(online: boolean): void };
  fetchPage: (page: number) => Promise<FeedPage<Post>>;
}

function useDemoServer(): DemoServer {
  const ref = useRef<DemoServer | null>(null);
  if (!ref.current) {
    const storage = memoryStorage();
    const network = manualNetwork(false);


    const rows: Post[] = [
      post(1, 'Rasa', 'Library hours change next week — check the door.'),
      post(2, 'Jonas', 'Anyone lost a blue scarf in room 204?'),
      post(3, 'Ona', 'Chess club moves to Thursdays.'),
      post(4, 'Tomas', 'Free coffee vouchers at the info desk.'),
      post(5, 'Rasa', 'The gym is closed for maintenance on Friday.'),
      post(6, 'Jonas', 'Study group for the statistics exam, sign up!'),
      post(7, 'Ona', 'Lost & found is overflowing — come claim things.'),
      post(8, 'Tomas', 'Bike parking moves behind the main building.'),
      post(9, 'Rasa', 'Spring concert tickets go on sale Monday.'),
    ];


    // The copy a previous session left behind — what the
    // offline mount serves (memoryStorage's writes commit
    // synchronously, so this lands before the first fetch)
    void createCache(storage).set(CACHE_KEY, rows.slice(0, PAGE_SIZE));


    // Someone posts between visits: every page-1 fetch after
    // the first finds one more row on top, so both the restore
    // refetch and a pull-to-refresh have a visible effect
    let firstPageFetches = 0;
    const fetchPage = async (page: number): Promise<FeedPage<Post>> => {
      if (!network.isOnline()) throw new Error('offline');


      if (page === 1) {
        firstPageFetches += 1;
        if (firstPageFetches > 1) {
          rows.unshift(post(100 + firstPageFetches, 'Live', `Posted while you were away #${firstPageFetches - 1}`));
        }
      }


      const start = (page - 1) * PAGE_SIZE;
      return { items: rows.slice(start, start + PAGE_SIZE), hasMore: start + PAGE_SIZE < rows.length };
    };


    ref.current = { storage, network, fetchPage };
  }
  return ref.current;
}







// -----------------------------------------------------------
// Board
// -----------------------------------------------------------
//
// The whole useFeed contract on one screen: loading / error /
// items / cachedAt / refreshing / loadingMore, refresh('merge')
// on the pull, loadMore on the end, and the network toggle
// whose off→on flip is what triggers the automatic refetch.
//
// Used by:
//   - ExampleOfflineScreen (below)
// -----------------------------------------------------------

function Board({ server }: { server: DemoServer }) {
  const feed = useFeed(server.fetchPage, { cacheKey: CACHE_KEY, silentRefreshMode: 'merge' });


  // Mirror of the manual source for the toggle's label — the
  // subscription is the same one a real connectivity wrapper
  // would feed
  const [online, setOnline] = useState(server.network.isOnline());
  useEffect(() => server.network.subscribe(setOnline), [server]);


  if (feed.loading) return <Text style={{ padding: 20 }}>Loading…</Text>;


  return (
    <View style={{ flex: 1 }}>
      <Pressable
        testID="network-toggle"
        onPress={() => server.network.set(!server.network.isOnline())}
        style={{ padding: 10, backgroundColor: online ? '#E7F3E7' : '#F3E7E7' }}
      >
        <Text style={{ textAlign: 'center', color: online ? '#1B5E20' : '#7B003F' }}>
          {online ? 'Online — tap to go offline' : 'Offline — tap to reconnect'}
        </Text>
      </Pressable>


      {feed.cachedAt !== null ? (
        <Text testID="cached-banner" style={{ padding: 8, fontSize: 12, textAlign: 'center', color: '#7B003F', backgroundColor: '#F7EAF1' }}>
          Offline copy from {new Date(feed.cachedAt).toISOString().slice(11, 16)} UTC
        </Text>
      ) : null}


      {feed.error ? (
        <Text style={{ padding: 20, textAlign: 'center' }}>
          Could not load. <Text style={{ color: '#7B003F' }} onPress={() => void feed.refresh()}>Retry</Text>
        </Text>
      ) : (
        <FlatList
          testID="board-list"
          data={feed.items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={() => void feed.refresh('merge')} />}
          onEndReached={() => feed.loadMore()}
          renderItem={({ item }) => (
            <View style={{ marginHorizontal: 12, marginVertical: 4, padding: 12, borderRadius: 10, backgroundColor: '#F2F2F2' }}>
              <Text style={{ fontSize: 12, color: '#7B003F', marginBottom: 2 }}>{item.author}</Text>
              <Text style={{ color: '#111' }}>{item.text}</Text>
            </View>
          )}
          ListFooterComponent={
            feed.loadingMore ? <Text style={{ textAlign: 'center', color: '#999', padding: 8 }}>Loading more…</Text> : null
          }
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      )}
    </View>
  );
}







// -----------------------------------------------------------
// ExampleOfflineScreen (default export)
// -----------------------------------------------------------
//
// The provider takes only the two injected sources; everything
// a real host does differently is which implementations it
// passes (AsyncStorage, a connectivity wrapper) — the screen
// underneath is identical.
//
// Used by:
//   - example/__tests__/example.test.tsx
// -----------------------------------------------------------

export default function ExampleOfflineScreen() {
  const server = useDemoServer();
  return (
    <DataEngineProvider storage={server.storage} network={server.network}>
      <Board server={server} />
    </DataEngineProvider>
  );
}
