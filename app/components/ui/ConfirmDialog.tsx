// -----------------------------------------------------------
//  [*] UI — ConfirmDialog
//
//  Cross-platform confirmation as a promise. Alert.alert is a
//  NO-OP on react-native-web — awaiting it there would hang a
//  destructive flow forever — so the web build falls back to
//  window.confirm while native gets the real two-button alert.
//
//  This module lives outside React and cannot call
//  useTranslation, so callers pass already-translated labels.
//  Only an explicit confirm resolves true; cancelling or
//  dismissing the native alert (tap outside, back button)
//  resolves false.
// -----------------------------------------------------------

// Native alert + platform switch
import { Alert, Platform } from 'react-native';


interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}







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
