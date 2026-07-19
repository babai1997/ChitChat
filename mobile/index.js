// Custom entry point (replaces the default "expo-router/entry" main) so we can
// register the FCM background message handler and notifee's background event
// handler BEFORE anything else loads. These must be registered at the true JS
// entry point, not inside a React component — Android relaunches the JS engine
// headlessly to invoke them when the app is backgrounded or fully killed, so a
// handler registered inside a component's useEffect would never run in that case.
import messaging from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import {
  handleCallPushMessage,
  handleNotifeeCallEvent,
} from './src/services/incomingCallNotification';
import 'expo-router/entry';

messaging().setBackgroundMessageHandler(handleCallPushMessage);

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DISMISSED) return;
  await handleNotifeeCallEvent({ type, detail });
});
