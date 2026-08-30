// -----------------------------------------------------------
//  [*] chatengine — example: a room with no backend and no kit
//
//  The engine driving a deliberately plain UI — a FlatList and
//  a TextInput in bare React Native — over fakeTransport, so
//  nothing outside this file is needed: no server, no UI kit,
//  no host app. Paste it into a blank Expo project and it runs.
//  It shows the complete contract a UI consumes:
//
//    conversation.messages (newest first) / loading / error /
//    hasMore + loadOlder / deleteMessage
//    composer.text / onChangeText / sendMessage / attach /
//    replyTo / startEdit / retryMessage
//    reactions.reactTo
//    typingUsers
//
//  The fake echoes every send back through the realtime door
//  (echoSends) — exactly what a broadcasting backend does — so
//  the temp → server-row swap and the echo dedupe run for real.
//  A pretend friend types and answers after a moment.
// -----------------------------------------------------------

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { ChatEngineProvider, fakeTransport, memoryStorage, useChatRoom, type ChatMessage, type EngineNotice, type FakeTransport } from '../src';


const ME = { id: 'me', displayName: 'Me' };
const ONA = { id: 'ona', displayName: 'Ona' };
const ROOM = 'demo';
const NOW = Date.now();

const seed = (id: string, sender: typeof ME, text: string, minutesAgo: number): ChatMessage => ({
  id,
  conversationId: ROOM,
  senderId: sender.id,
  senderName: sender.displayName,
  text,
  createdAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  isOwn: sender.id === ME.id,
  status: sender.id === ME.id ? 'read' : 'read',
  reactions: [],
  deleted: false,
});







// -----------------------------------------------------------
// Demo backend
// -----------------------------------------------------------
//
// One fake transport for the demo's lifetime. `push()` plays a
// realtime event as if the server sent it — used below to make
// Ona type and reply.
// -----------------------------------------------------------

function useDemoBackend(): { transport: FakeTransport; notices: EngineNotice[] } {
  const ref = useRef<{ transport: FakeTransport; notices: EngineNotice[] } | null>(null);
  if (!ref.current) {
    ref.current = {
      transport: fakeTransport({
        self: ME,
        echoSends: true,
        participants: [ME, ONA],
        conversation: { id: ROOM, type: 'direct', title: null, avatarEmoji: null },
        messages: [seed('1', ONA, 'Labas! Try sending something.', 3), seed('2', ME, 'The engine runs with no server behind it.', 2), seed('3', ONA, 'Long-press a row to react, tap ↩ to reply.', 1)],
      }),
      notices: [],
    };
  }
  return ref.current;
}







// -----------------------------------------------------------
// Row
// -----------------------------------------------------------

function Row({ m, onReply, onReact, onEdit, onDelete, onRetry }: {
  m: ChatMessage;
  onReply: () => void;
  onReact: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const own = m.isOwn;
  const status = m.status === 'failed' ? 'not sent · tap to retry' : m.status === 'sending' ? 'sending…' : own ? m.status : '';
  return (
    <View style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '80%', marginVertical: 3, marginHorizontal: 12 }}>
      {!own ? <Text style={{ fontSize: 11, color: '#777', marginLeft: 8 }}>{m.senderName}</Text> : null}
      <Pressable onPress={m.status === 'failed' ? onRetry : undefined} onLongPress={onReact} style={{ backgroundColor: own ? '#7B003F' : '#EEE', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
        {m.replyTo ? <Text style={{ fontSize: 12, color: own ? '#F3D6E4' : '#666', marginBottom: 4 }}>↩ {m.replyTo.senderName}: {m.replyTo.deleted ? '(deleted)' : m.replyTo.text}</Text> : null}
        <Text style={{ color: own ? '#FFF' : '#111', fontStyle: m.deleted ? 'italic' : 'normal' }}>{m.deleted ? 'Message deleted' : m.text || (m.imageUrl ? '📷 photo' : m.video ? '🎬 video' : m.file ? `📎 ${m.file.name}` : '')}</Text>
        {m.reactions.length > 0 ? <Text style={{ marginTop: 4, fontSize: 12 }}>{m.reactions.map((r) => `${r.emoji}${r.count > 1 ? r.count : ''}`).join(' ')}</Text> : null}
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: own ? 'flex-end' : 'flex-start', gap: 10, marginTop: 2, marginHorizontal: 6 }}>
        <Text style={{ fontSize: 11, color: '#999' }}>{status}{m.editedAt ? ' · edited' : ''}</Text>
        {!m.deleted && m.status !== 'sending' ? <Pressable onPress={onReply}><Text style={{ fontSize: 11, color: '#7B003F' }}>reply</Text></Pressable> : null}
        {own && !m.deleted && m.status === 'sent' || (own && m.status === 'read') ? <Pressable onPress={onEdit}><Text style={{ fontSize: 11, color: '#7B003F' }}>edit</Text></Pressable> : null}
        {own && !m.deleted && !m.id.startsWith('temp-') ? <Pressable onPress={onDelete}><Text style={{ fontSize: 11, color: '#7B003F' }}>unsend</Text></Pressable> : null}
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// Room
// -----------------------------------------------------------

function Room({ transport, notices }: { transport: FakeTransport; notices: EngineNotice[] }) {
  const { conversation, composer, reactions, typingUsers } = useChatRoom(ROOM, { focused: true });
  const [lastNotice, setLastNotice] = useState<string | null>(null);
  useEffect(() => {
    if (notices.length) setLastNotice(notices[notices.length - 1].code);
  }, [notices, notices.length]);

  // A pretend friend: types for a moment, then answers the newest own message
  const answered = useRef(new Set<string>());
  useEffect(() => {
    const newestOwn = conversation.messages.find((m) => m.isOwn && !m.id.startsWith('temp-'));
    if (!newestOwn || answered.current.has(newestOwn.id)) return;
    answered.current.add(newestOwn.id);
    transport.push({ type: 'typing', conversationId: ROOM, userId: ONA.id, displayName: ONA.displayName, active: true });
    const timer = setTimeout(() => {
      transport.push({ type: 'typing', conversationId: ROOM, userId: ONA.id, displayName: ONA.displayName, active: false });
      const reply: ChatMessage = { ...seed(`ona-${Date.now()}`, ONA, `“${newestOwn.text || 'that'}” — got it 👍`, 0), createdAt: new Date().toISOString() };
      transport.rows.push(reply);
      transport.push({ type: 'message', message: reply });
      transport.push({ type: 'read', conversationId: ROOM, readerId: ONA.id, messageIds: [newestOwn.id] });
    }, 1500);
    return () => clearTimeout(timer);
  }, [conversation.messages, transport]);

  const typingLabel = typingUsers.length ? `${typingUsers.map((u) => u.displayName).join(', ')} is typing…` : ' ';
  const rows = useMemo(() => conversation.messages, [conversation.messages]);

  if (conversation.loading) return <Text style={{ padding: 20 }}>Loading…</Text>;
  if (conversation.error) return <Text style={{ padding: 20 }}>Could not load ({conversation.error}) <Text onPress={conversation.retry}>retry</Text></Text>;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={rows}
        inverted
        keyExtractor={(m) => m.clientId ?? m.id}
        renderItem={({ item }) => (
          <Row
            m={item}
            onReply={() => composer.setReplyTo(item)}
            onReact={() => reactions.reactTo(item.id, item.reactions.some((r) => r.bySelf) ? null : '❤️')}
            onEdit={() => composer.startEdit(item)}
            onDelete={() => conversation.deleteMessage(item.id)}
            onRetry={() => composer.retryMessage(item)}
          />
        )}
        onEndReached={() => void conversation.loadOlder()}
        ListFooterComponent={conversation.hasMore ? <Text style={{ textAlign: 'center', color: '#999', padding: 8 }}>{conversation.loadingOlder ? 'Loading older…' : 'Scroll for older'}</Text> : null}
        contentContainerStyle={{ paddingVertical: 8 }}
      />
      <Text style={{ paddingHorizontal: 12, fontSize: 12, color: '#777' }}>{typingLabel}</Text>
      {composer.editing ? <Strip label={`Editing: ${composer.editing.text}`} onCancel={composer.cancelEdit} /> : null}
      {composer.replyTo ? <Strip label={`Replying to ${composer.replyTo.senderName}`} onCancel={() => composer.setReplyTo(null)} /> : null}
      {lastNotice ? <Text style={{ paddingHorizontal: 12, fontSize: 12, color: '#B00020' }}>notice: {lastNotice}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8, gap: 8, borderTopWidth: 1, borderTopColor: '#DDD' }}>
        <Pressable
          onPress={() => void composer.attach({ uri: 'file:///demo/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1234, kind: 'image', width: 1200, height: 800 })}
          disabled={composer.uploadingMedia}
        >
          <Text style={{ fontSize: 20 }}>{composer.uploadingMedia ? '⏳' : '📷'}</Text>
        </Pressable>
        <TextInput
          value={composer.text}
          onChangeText={composer.onChangeText}
          placeholder="Message"
          style={{ flex: 1, backgroundColor: '#F2F2F2', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 }}
          onSubmitEditing={composer.sendMessage}
        />
        <Pressable onPress={composer.text ? composer.sendMessage : () => composer.sendQuickLike()}>
          <Text style={{ fontSize: 20 }}>{composer.editing ? '✓' : composer.text ? '➤' : '👍'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Strip({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 4 }}>
      <Text style={{ flex: 1, fontSize: 12, color: '#7B003F' }} numberOfLines={1}>{label}</Text>
      <Pressable onPress={onCancel}><Text style={{ fontSize: 12, color: '#999' }}>✕</Text></Pressable>
    </View>
  );
}







// -----------------------------------------------------------
// ExampleRoom (default export)
// -----------------------------------------------------------
//
// The provider takes: the transport, who is signed in, a store
// for drafts and the outbox (memory here — AsyncStorage in an
// app), a notice sink (codes — map them to your strings), and
// optionally a network-restore subscription and a video poster
// extractor. Everything a real host does is visible here.
// -----------------------------------------------------------

export default function ExampleRoom({ children }: { children?: ReactNode }) {
  const { transport, notices } = useDemoBackend();
  const storage = useMemo(() => memoryStorage(), []);
  return (
    <ChatEngineProvider transport={transport} currentUser={ME} storage={storage} notify={(n) => notices.push(n)}>
      <Room transport={transport} notices={notices} />
      {children}
    </ChatEngineProvider>
  );
}
