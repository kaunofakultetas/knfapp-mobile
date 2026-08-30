// -----------------------------------------------------------
//  [*] UI — ConfirmDialog
//
//  Cross-platform confirmation as a promise. Alert.alert is a
//  NO-OP on react-native-web — awaiting it there would hang a
//  destructive flow forever — so on web the promise is bridged
//  into ConfirmHost, a themed in-app modal mounted once in the
//  root layout; native gets the real two-button alert. Should
//  a web confirm ever fire before the host has mounted,
//  window.confirm remains as the last-resort fallback — it
//  works, it just shows the browser's own OK/Cancel instead of
//  the translated labels.
//
//  confirmAction itself lives outside React on purpose (it is
//  called from async handlers) and cannot call useTranslation,
//  so callers pass already-translated labels; the host renders
//  those labels verbatim, which is why the web dialog keeps
//  the call site's wording and destructive styling. Only an
//  explicit confirm resolves true; cancelling or dismissing
//  (tap outside, back button) resolves false.
// -----------------------------------------------------------

// Native alert + platform switch, host modal primitives
import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, Text, View } from 'react-native';

// The host's action pair — imported directly, not through the
// ui barrel, so the barrel's export of this file cannot cycle
import { Button } from './Button';


interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}


// A confirm the web host is currently showing
interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}


// The mounted ConfirmHost registers its presenter here — a
// plain module slot, so confirmAction stays callable from
// outside React
let presentConfirm: ((pending: PendingConfirm) => void) | null = null;







// -----------------------------------------------------------
// confirmAction
// -----------------------------------------------------------
//
//   if (await confirmAction({ title, message,
//        confirmLabel, cancelLabel })) { … }   — plain confirm
//   confirmAction({ …, destructive: true })    — red confirm
//                                                button on iOS
//
// Used by:
//   - screens that delete or revoke things — conversation
//     delete, post delete, unfriend, invitation revoke, user
//     deactivate, settings reset
// -----------------------------------------------------------

export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  if (Platform.OS === 'web') {

    // The themed host keeps the translated labels and the
    // destructive styling; window.confirm (browser-language
    // OK/Cancel) only if the host is somehow not mounted
    if (presentConfirm) {
      return new Promise((resolve) => {
        presentConfirm?.({ title, message, confirmLabel, cancelLabel, destructive, resolve });
      });
    }
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }


  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      // Android back / tap-outside dismisses without a button press
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}







// -----------------------------------------------------------
// ConfirmHost
// -----------------------------------------------------------
//
// The web presenter behind confirmAction: shows the pending
// confirm as a themed modal — scrim, card, the caller's own
// cancel/confirm labels, danger fill when destructive — and
// resolves the bridged promise with the outcome. On native it
// never presents: confirmAction reaches Alert.alert first.
//
// Used by:
//   - app/_layout.tsx — mounted once beside the Toast host
// -----------------------------------------------------------

export function ConfirmHost() {

  const [pending, setPending] = useState<PendingConfirm | null>(null);


  // Register while mounted; a second confirm arriving over an
  // open one settles the first as cancelled instead of
  // stranding its promise
  useEffect(() => {
    presentConfirm = (next) => {
      setPending((prev) => {
        prev?.resolve(false);
        return next;
      });
    };
    return () => {
      presentConfirm = null;
    };
  }, []);


  const finish = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };


  if (!pending) return null;


  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => finish(false)}>

      {/* Scrim — tapping it cancels, like dismissing an alert */}
      <Pressable
        className="flex-1 items-center justify-center bg-scrim px-xl"
        onPress={() => finish(false)}
        accessibilityLabel={pending.cancelLabel}
      >
        {/* The card claims its own presses so only the scrim dismisses */}
        <Pressable className="w-full rounded-xl bg-surface p-lg" style={{ maxWidth: 400 }} onPress={() => {}}>
          <Text className="font-raleway-bold text-lg text-ink">{pending.title}</Text>
          <Text className="mt-sm font-raleway text-base text-ink-soft">{pending.message}</Text>
          <View className="mt-lg flex-row justify-end gap-sm">
            <Button title={pending.cancelLabel} variant="ghost" fullWidth={false} onPress={() => finish(false)} />
            <Button
              title={pending.confirmLabel}
              variant={pending.destructive ? 'danger' : 'primary'}
              fullWidth={false}
              onPress={() => finish(true)}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
