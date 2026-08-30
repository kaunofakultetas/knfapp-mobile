// -----------------------------------------------------------
//  [*] chatkit — MessageContextMenu
//
//  The long-press menu, iMessage-style: the screen dims, a
//  copy of the pressed bubble floats exactly where it was
//  (sliding up or down just enough for the whole stack to
//  fit), a reaction bar pops in above it and a menu card
//  settles below it — Reply, Copy (text messages), Delete (own
//  messages, in the danger colour). The reader's current
//  reaction is ringed; tapping it again clears it.
//
//  A transparent full-window Modal, so the scrim dims the stack
//  header too (the screen body alone would leave the burgundy
//  bar at full strength above the menu); motion is Reanimated
//  springs inside it, and web keeps the theme variables
//  because the root layout mirrors them onto the document. The
//  bubble frame arrives in window coordinates (measured on
//  long-press); the layer measures its own window offset once
//  laid out and converts.
//
//  Split into (root component last):
//
//    MenuRow            — one label + icon row
//    MessageContextMenu — the layer (default export)
// -----------------------------------------------------------

// Theme + labels
import { fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useKitLabels } from './labels';

// Rendering + motion
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

// The floating copy
import { BubbleBody } from './MessageBubble';
import type { ContextTarget } from './types';


// Geometry of the stack around the bubble
const BAR_HEIGHT = 50;
const BAR_GAP = 8;
const MENU_GAP = 8;
const MENU_WIDTH = 236;
const ROW_HEIGHT = 46;
const EDGE = 12;

// Soft, critically damped — the stack settles, never bounces
const OPEN_SPRING = { damping: 24, stiffness: 300, mass: 0.9, overshootClamping: true };
const CLOSE_MS = 160;

// What the layer holds while open and while fading out
interface Snapshot {
  target: ContextTarget;
  canReact: boolean;
  canReply: boolean;
  canDelete: boolean;
}

const tick = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};







// -----------------------------------------------------------
// MenuRow
// -----------------------------------------------------------
//
// Used by:
//   - MessageContextMenu (below)
// -----------------------------------------------------------

function MenuRow({
  icon,
  label,
  danger,
  last,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  last?: boolean;
  onPress: () => void;
}) {

  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center justify-between px-4 active:bg-surface-soft"
      style={{ height: ROW_HEIGHT, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: colors.line }}
    >
      <Text style={{ fontFamily: fonts.medium, fontSize: 16, color: danger ? colors.danger : colors.ink }}>{label}</Text>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.inkSoft} />
    </Pressable>
  );
}







// -----------------------------------------------------------
// MessageContextMenu (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/chat-room/index.tsx — on message long-press
// -----------------------------------------------------------

export default function MessageContextMenu({
  target,
  reactionOptions,
  selectedEmoji,
  canReact,
  canReply,
  canDelete,
  onReact,
  onClearReaction,
  onReply,
  onCopy,
  onDelete,
  onClose,
  onOpened,
  onClosed,
}: {
  target: ContextTarget | null;
  reactionOptions: string[];
  selectedEmoji: string | null;
  // Which actions apply to the target — an unsent optimistic
  // bubble, for instance, can only be discarded
  canReact: boolean;
  canReply: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onClearReaction: () => void;
  onReply: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
  // The floating copy is on screen (first layout inside the
  // Modal) — the host hides the source row from here…
  onOpened?: (messageId: string) => void;
  // …until the close animation has finished
  onClosed?: () => void;
}) {

  const labels = useKitLabels();
  const { colors } = useTheme();
  const { height: windowHeight } = useWindowDimensions();


  // The layer keeps a SNAPSHOT of the target and its capabilities
  // while it animates out — the host's live props flip to null /
  // false the moment it closes, and the geometry must not
  // recompute mid-fade
  const [shown, setShown] = useState<Snapshot | null>(null);
  const progress = useSharedValue(0);
  // Latest props for the effects below — they key on the target's
  // IDENTITY (its id), not on the object the host rebuilds each
  // render, so the snapshot is taken once per open. Written in an
  // effect (declared before the targetId effect, which runs after
  // it) so a render that never commits cannot leak into the ref
  const latest = useRef({ target, canReact, canReply, canDelete, onOpened, onClosed });
  useEffect(() => {
    latest.current = { target, canReact, canReply, canDelete, onOpened, onClosed };
  });
  const targetId = target?.message.id ?? null;
  // The entrance fires once per open, however many times layout
  // re-measures (keyboard dismiss, rotation)
  const hasOpenedRef = useRef(false);
  const finishClose = () => {
    // A reopen can cancel the close timing mid-flight — its
    // completion callback still lands here and must not tear the
    // fresh open down
    if (latest.current.target) return;
    hasOpenedRef.current = false;
    setShown(null);
    latest.current.onClosed?.();
  };
  useEffect(() => {
    const now = latest.current;
    if (targetId && now.target) {
      hasOpenedRef.current = false;
      setShown({ target: now.target, canReact: now.canReact, canReply: now.canReply, canDelete: now.canDelete });
      return;
    }
    if (!targetId) {
      // Nothing was ever shown (first mount) — no close to run,
      // and no spurious onClosed to the host
      if (!shown) return;
      // Teardown must not depend on the animation reporting
      // success — finishClose runs either way and guards itself
      progress.value = withTiming(0, { duration: CLOSE_MS }, () => {
        runOnJS(finishClose)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the target id by design
  }, [targetId]);

  // Live message state (reactions toggled while open) flows into
  // the copy without retaking the capability snapshot
  useEffect(() => {
    if (!target) return;
    setShown((current) => (current && current.target.message.id === target.message.id ? { ...current, target } : current));
  }, [target]);


  // Window offset of this layer, so window-space frames become
  // layer-space positions. The open spring starts from here —
  // the first frame of the Modal has no layout yet, and a spring
  // started before it would aim at a garbage shift
  const layerRef = useRef<View>(null);
  const copyScrollRef = useRef<ScrollView>(null);
  const [layer, setLayer] = useState({ x: 0, top: 0, width: 0, height: 0 });
  const measureLayer = () => {
    layerRef.current?.measureInWindow((x, y, w, h) => {
      setLayer({ x, top: y, width: w, height: h });
      const now = latest.current;
      // Later layouts keep updating the geometry, but the spring
      // and the host notification fire once per open
      if (now.target && !hasOpenedRef.current) {
        hasOpenedRef.current = true;
        progress.value = withSpring(1, OPEN_SPRING);
        now.onOpened?.(now.target.message.id);
      }
    });
  };


  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1]) }],
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [12, 0]) }, { scale: interpolate(progress.value, [0, 1], [0.92, 1]) }],
  }));


  // Stack layout from the snapshot: the bubble shifts only as far
  // as needed for the bar above and the menu below to fit inside
  // the layer; a bubble taller than the room left is clipped at
  // the bottom so the actions stay reachable
  const message = shown?.target.message ?? null;
  const own = !!message?.isOwn;
  const hasText = !!message?.text && !message.deleted;
  const showReact = !!shown?.canReact;
  const showReply = !!shown?.canReply;
  const showDelete = !!shown?.canDelete;
  const rows = (showReply ? 1 : 0) + (hasText ? 1 : 0) + (showDelete ? 1 : 0);
  const menuHeight = rows * ROW_HEIGHT;
  const barSpace = showReact ? BAR_HEIGHT + BAR_GAP : 0;
  const menuSpace = rows ? MENU_GAP + menuHeight : 0;
  const frame = shown?.target.frame ?? { x: 0, y: 0, width: 0, height: 0 };
  const layerWidth = layer.width || 1;
  const layerHeight = layer.height || windowHeight;
  const copyHeight = Math.min(frame.height, Math.max(80, layerHeight - 2 * EDGE - barSpace - menuSpace));
  // A copy clipped to keep the actions reachable becomes
  // scrollable, so the reader can still check the whole message
  const copyClipped = frame.height > copyHeight;
  const stackHeight = barSpace + copyHeight + menuSpace;
  const originalTop = frame.y - layer.top;
  const frameLeft = frame.x - layer.x;
  const maxTop = Math.max(EDGE + barSpace, layerHeight - EDGE - stackHeight + barSpace);
  const bubbleTop = Math.min(Math.max(originalTop, EDGE + barSpace), maxTop);
  const shift = bubbleTop - originalTop;
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, shift]) }, { scale: interpolate(progress.value, [0, 1], [1, 1.02]) }],
  }));

  // Bar and menu hug the bubble's outer edge, clamped to the
  // layer. Each option gets a 50pt slot so the 44pt discs keep
  // daylight between neighbouring targets
  const barWidth = reactionOptions.length * 50 + 12;
  const horizontal = (width: number) =>
    own
      ? { right: Math.max(EDGE, layerWidth - (frameLeft + frame.width)) }
      : { left: Math.min(Math.max(EDGE, frameLeft), layerWidth - EDGE - width) };


  return (
    <Modal
      visible={shown !== null}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      // Android back and the web Escape key close the menu
      onRequestClose={onClose}
    >
    {/* accessibilityViewIsModal keeps VoiceOver inside the layer —
        without it the reader can wander back into the dimmed feed */}
    <View ref={layerRef} onLayout={measureLayer} accessibilityViewIsModal style={{ flex: 1 }}>

      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose} accessibilityRole="button" accessibilityLabel={labels.close} />
      </Animated.View>

      {message && shown ? (
        <>
          {/* Quick reactions */}
          {showReact ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: bubbleTop - BAR_GAP - BAR_HEIGHT,
                height: BAR_HEIGHT,
                width: barWidth,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-around',
                paddingHorizontal: 6,
                borderRadius: BAR_HEIGHT / 2,
                backgroundColor: colors.menuSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.line,
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.18,
                shadowRadius: 14,
                elevation: 8,
                ...horizontal(barWidth),
              },
              barStyle,
            ]}
            // A real role makes the bar an announced group ("Reaguoti")
            // without collapsing the emoji buttons inside it
            accessibilityRole="toolbar"
            accessibilityLabel={labels.react}
          >
            {reactionOptions.map((emoji, index) => {
              const selected = selectedEmoji === emoji;
              return (
                <ReactionOption
                  key={emoji}
                  emoji={emoji}
                  index={index}
                  selected={selected}
                  progress={progress}
                  label={selected ? labels.removeReaction : emoji}
                  onPress={() => {
                    tick();
                    if (selected) onClearReaction();
                    else onReact(emoji);
                  }}
                />
              );
            })}
          </Animated.View>
          ) : null}

          {/* The floating copy of the pressed bubble. A clipped
              copy scrolls (the indicator flashes as the
              affordance) so a long message can be read in full
              before acting on it; an unclipped one stays inert and
              lets taps fall through to the scrim */}
          <Animated.View
            pointerEvents={copyClipped ? 'auto' : 'none'}
            style={[
              { position: 'absolute', top: originalTop, left: frameLeft, width: frame.width, height: copyHeight, overflow: 'hidden' },
              bubbleStyle,
            ]}
          >
            <ScrollView
              ref={copyScrollRef}
              scrollEnabled={copyClipped}
              showsVerticalScrollIndicator={copyClipped}
              onLayout={copyClipped ? () => copyScrollRef.current?.flashScrollIndicators() : undefined}
            >
              <View pointerEvents="none">
                <BubbleBody message={message} position={shown.target.position} labels={labels} initialImageRatio={shown.target.imageRatio} />
              </View>
            </ScrollView>
          </Animated.View>

          {/* Actions */}
          {rows ? (
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: bubbleTop + copyHeight + MENU_GAP,
                width: MENU_WIDTH,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: colors.menuSurface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.line,
                shadowColor: colors.shadow,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 18,
                elevation: 10,
                ...horizontal(MENU_WIDTH),
              },
              menuStyle,
            ]}
          >
            {showReply ? <MenuRow icon="arrow-undo-outline" label={labels.reply} onPress={onReply} last={!hasText && !showDelete} /> : null}
            {hasText ? <MenuRow icon="copy-outline" label={labels.copy} onPress={onCopy} last={!showDelete} /> : null}
            {showDelete ? <MenuRow icon="trash-outline" label={labels.delete} danger last onPress={onDelete} /> : null}
          </Animated.View>
          ) : null}
        </>
      ) : null}

    </View>
    </Modal>
  );
}







// -----------------------------------------------------------
// ReactionOption
// -----------------------------------------------------------
//
// One emoji in the bar, popping in with a small stagger.
//
// Used by:
//   - MessageContextMenu (above)
// -----------------------------------------------------------

function ReactionOption({
  emoji,
  index,
  selected,
  progress,
  label,
  onPress,
}: {
  emoji: string;
  index: number;
  selected: boolean;
  progress: SharedValue<number>;
  label: string;
  onPress: () => void;
}) {

  const { colors } = useTheme();


  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = 0;
    pop.value = withDelay(40 + index * 30, withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }));
  }, [index, pop]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value * Math.min(1, progress.value * 2) }],
  }));


  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        // A full 44pt disc — the minimum touch target on both axes
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.brandSoft : 'transparent',
        }}
      >
        <Text style={{ fontSize: 26, lineHeight: 32 }}>{emoji}</Text>
      </Pressable>
    </Animated.View>
  );
}
