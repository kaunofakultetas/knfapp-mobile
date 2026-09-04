// -----------------------------------------------------------
//  [*] chatuikit — example: the kit and the engine together
//
//  ExampleConversation.tsx shows the kit alone, on static
//  rows. This file shows the intended pairing: @knf/chatengine
//  supplies the state (history, optimistic sends, edits,
//  unsends, reactions, receipts, typing) over a fake transport
//  — so still no server — and the kit draws it. Every prop the
//  kit asks for comes straight off the engine's hooks; this is
//  the reference wiring a host copies (the KNF app's chat room
//  is this plus navigation, search, presence and pickers).
//
//  Because the two packages never import each other, the
//  glue lives in the host — here, in one file:
//
//    ChatEngineProvider(fakeTransport)  →  useChatRoom
//    ChatUiKitProvider(theme, labels)   →  MessageList / Composer / MessageContextMenu
//    engine.conversation.messages       →  buildTimeline → items
//    kit callbacks                      →  engine actions
// -----------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

// The engine — reached through the alias exactly as a host would
import { ChatEngineProvider, fakeTransport, memoryStorage, useChatRoom, type ChatMessage, type EngineNotice, type FakeTransport } from '@knf/chatengine';

// The kit — this package
import {
  buildTimeline,
  ChatUiKitProvider,
  Composer,
  defaultLabels,
  MessageContextMenu,
  MessageList,
  type ContextTarget,
  type KitMessage,
  type MessageListHandle,
} from '../src';


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
  status: 'read',
  reactions: [],
  deleted: false,
});

// Optimistic rows have no server id yet: no menu, no reply
const isTemp = (m: KitMessage) => m.id.startsWith('temp-');







// -----------------------------------------------------------
// Room — the glue
// -----------------------------------------------------------

function Room({ transport }: { transport: FakeTransport }) {

  const labels = defaultLabels.en;
  const { conversation, composer, reactions, typingUsers } = useChatRoom(ROOM, { focused: true });


  // Engine rows are structurally KitMessages — no mapping. The
  // timeline is derived once per list change
  const items = useMemo(
    () => buildTimeline(conversation.messages, { today: labels.today, yesterday: labels.yesterday, locale: 'en' }, conversation.hasMore),
    [conversation.messages, conversation.hasMore, labels],
  );


  // The long-press menu: the kit hands a measured target, the
  // engine's actions answer its rows
  const [menuTarget, setMenuTarget] = useState<ContextTarget | null>(null);
  const [hiddenId, setHiddenId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const listRef = useRef<MessageListHandle>(null);
  const menuMessage = menuTarget?.message ?? null;
  const ownReaction = menuMessage?.reactions.find((r) => r.bySelf)?.emoji ?? null;
  const closeMenu = useCallback(() => setMenuTarget(null), []);


  // A pretend friend answers every own send after a moment
  const answered = useRef(new Set<string>());
  const newestOwn = conversation.messages.find((m) => m.isOwn && !isTemp(m));
  useEffect(() => {
    if (!newestOwn || answered.current.has(newestOwn.id)) return;
    answered.current.add(newestOwn.id);
    transport.push({ type: 'typing', conversationId: ROOM, userId: ONA.id, displayName: ONA.displayName, active: true });
    setTimeout(() => {
      transport.push({ type: 'typing', conversationId: ROOM, userId: ONA.id, displayName: ONA.displayName, active: false });
      const reply: ChatMessage = { ...seed(`ona-${Date.now()}`, ONA, `“${newestOwn.text || 'that'}” — noted 👍`, 0), createdAt: new Date().toISOString() };
      transport.rows.push(reply);
      transport.push({ type: 'message', message: reply });
      transport.push({ type: 'read', conversationId: ROOM, readerId: ONA.id, messageIds: [newestOwn.id] });
    }, 1500);
  }, [newestOwn, transport]);


  return (
    <View style={{ flex: 1 }}>
      <MessageList
        ref={listRef}
        items={items}
        typing={typingUsers.length ? { label: `${typingUsers.map((u) => u.displayName).join(', ')} is typing…`, name: typingUsers[0].displayName } : null}
        isGroup={false}
        showAvatars
        intro={{ title: ONA.displayName, subtitle: 'Kit + engine, no server', isGroup: false }}
        loadingOlder={conversation.loadingOlder}
        hasMore={conversation.hasMore}
        onLoadOlder={() => void conversation.loadOlder()}
        revealedId={revealedId}
        highlightedId={null}
        menuTargetId={hiddenId}
        canAct={(m) => !isTemp(m)}
        canReply={(m) => !isTemp(m) && !m.deleted}
        onPressMessage={(m) => setRevealedId((cur) => (cur === m.id ? null : m.id))}
        onLongPressMessage={setMenuTarget}
        onSwipeReply={composer.setReplyTo}
        onPressQuote={(m) => m.replyTo && listRef.current?.scrollToMessage(m.replyTo.id)}
        onPressReactions={() => {}}
        onPressImage={() => {}}
        onRetry={composer.retryMessage}
        onPressLink={() => {}}
        onCopy={() => {}}
        onReact={(m, emoji) => reactions.reactTo(m.id, emoji)}
      />

      <Composer
        value={composer.text}
        onChangeText={composer.onChangeText}
        onSend={composer.sendMessage}
        onQuickLike={() => composer.sendQuickLike()}
        // A host's picker hands the engine a PickedAsset; the demo fakes one
        onAttachMedia={() => void composer.attach({ uri: 'file:///demo/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1234, kind: 'image', width: 1200, height: 800 })}
        onAttachFile={() => void composer.attach({ uri: 'file:///demo/planas.pdf', name: 'planas.pdf', mimeType: 'application/pdf', size: 4321, kind: 'file' })}
        onToggleEmoji={() => {}}
        emojiOpen={false}
        uploadingMedia={composer.uploadingMedia}
        uploadingFile={composer.uploadingFile}
        replyTo={composer.replyTo ? { ...composer.replyTo, deleted: !!composer.replyTo.deleted, fileName: composer.replyTo.file?.name } : null}
        onCancelReply={() => composer.setReplyTo(null)}
        editing={composer.editing}
        onCancelEdit={composer.cancelEdit}
      />

      <MessageContextMenu
        target={menuTarget}
        reactionOptions={reactions.reactionOptions}
        selectedEmoji={ownReaction}
        canReact={!!menuMessage && !menuMessage.deleted}
        canReply={!!menuMessage && !menuMessage.deleted}
        canDelete={!!menuMessage?.isOwn && !menuMessage.deleted}
        onReact={(emoji) => {
          if (menuMessage) reactions.reactTo(menuMessage.id, emoji);
          closeMenu();
        }}
        onClearReaction={() => {
          if (menuMessage) reactions.reactTo(menuMessage.id, null);
          closeMenu();
        }}
        onReply={() => {
          if (menuMessage) composer.setReplyTo(menuMessage);
          closeMenu();
        }}
        onCopy={closeMenu}
        onDelete={() => {
          if (menuMessage) conversation.deleteMessage(menuMessage.id);
          closeMenu();
        }}
        onClose={closeMenu}
        onOpened={setHiddenId}
        onClosed={() => setHiddenId(null)}
        // Host rows: here, Edit on own text (the app adds Report)
        actions={[
          {
            id: 'edit',
            label: 'Edit',
            icon: 'pencil-outline',
            visible: (m) => m.isOwn && !m.deleted && !!m.text,
            onPress: (m) => {
              closeMenu();
              composer.startEdit(m);
            },
          },
        ]}
      />
    </View>
  );
}







// -----------------------------------------------------------
// ExampleRoom (default export)
// -----------------------------------------------------------
//
// Two providers, one per package: the engine's carries the
// transport and the user, the kit's carries theme and labels.
// A host swaps fakeTransport for its adapter and defaultLabels
// for its catalog — nothing else changes.
// -----------------------------------------------------------

export default function ExampleRoom() {

  const [backend] = useState(() =>
    fakeTransport({
      self: ME,
      echoSends: true,
      participants: [ME, ONA],
      conversation: { id: ROOM, type: 'direct', title: null, avatarEmoji: null },
      messages: [seed('1', ONA, 'Labas! This room is the kit drawn by the engine.', 3), seed('2', ME, 'Long-press me: reactions, reply, edit, unsend.', 2), seed('3', ONA, 'Send something — I will answer.', 1)],
    }),
  );
  const storage = useMemo(() => memoryStorage(), []);
  const notify = useCallback((n: EngineNotice) => console.warn('chat notice', n.code, n.detail ?? ''), []);


  return (
    <ChatEngineProvider transport={backend} currentUser={ME} storage={storage} notify={notify}>
      <ChatUiKitProvider labels={defaultLabels.en} locale="en">
        <Room transport={backend} />
      </ChatUiKitProvider>
    </ChatEngineProvider>
  );
}
