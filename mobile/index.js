// Custom entry point (replaces the default "expo-router/entry" main) so we can
// register the FCM background message handler and notifee's background event
// handler BEFORE anything else loads. These must be registered at the true JS
// entry point, not inside a React component — Android relaunches the JS engine
// headlessly to invoke them when the app is backgrounded or fully killed, so a
// handler registered inside a component's useEffect would never run in that case.
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { router } from 'expo-router';
import {
  handleCallPushMessage,
  handleNotifeeCallEvent,
} from './src/services/incomingCallNotification';
import { handleMessagePushMessage } from './src/services/messagePushNotification';
import 'expo-router/entry';

// Route background FCM data messages by kind
setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
  const kind = remoteMessage.data?.kind;
  if (kind === 'call' || kind === 'call_cancel') {
    await handleCallPushMessage(remoteMessage);
  } else if (kind === 'message') {
    await handleMessagePushMessage(remoteMessage);
  }
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DISMISSED) return;

  const kind = detail.notification?.data?.kind;

  if (kind === 'message') {
    // User tapped a chat message notification while app was backgrounded/killed
    if (type === EventType.PRESS) {
      const chatId = detail.notification?.data?.chatId;
      if (chatId) {
        router.push(`/chat/${chatId}`);
      }
    }
    return;
  }

  // Fall through to call notification handler
  await handleNotifeeCallEvent({ type, detail });
});
