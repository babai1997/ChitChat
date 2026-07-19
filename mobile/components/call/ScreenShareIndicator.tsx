import { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useCall } from "../../src/contexts/CallContext";

// expo-notifications uses this hardcoded ID for all trigger:null local notifications
const EXPO_FALLBACK_CHANNEL = "expo_notifications_fallback_notification_channel";
const NOTIF_ID = "screen-share-active";
const CATEGORY_ID = "screen-share";
const ACTION_STOP = "stop-sharing";

// No banner popup, but let the screen-share notification appear in the shade
Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: notification.request.identifier === NOTIF_ID,
  }),
});

async function setup() {
  if (Platform.OS !== "android") return;
  try {
    // Override the fallback channel with HIGH importance so our notification
    // is actually visible (expo uses this channel for all trigger:null notifications)
    await Notifications.setNotificationChannelAsync(EXPO_FALLBACK_CHANNEL, {
      name: "ChitChat Notifications",
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    });

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") await Notifications.requestPermissionsAsync();

    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: ACTION_STOP,
        buttonTitle: "Stop Sharing",
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn("[ScreenShare] setup error:", e);
  }
}

async function show() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: "You are presenting",
        body: "Your screen is visible to call participants.",
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        data: {},
      },
      trigger: null,
    });
  } catch (e) {
    console.warn("[ScreenShare] show error:", e);
  }
}

async function dismiss() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {}
}

setup();

export default function ScreenShareIndicator() {
  const { isScreenSharing, stopScreenShare } = useCall();

  useEffect(() => {
    if (isScreenSharing) {
      show();
    } else {
      dismiss();
    }
    return () => {
      dismiss();
    };
  }, [isScreenSharing]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.actionIdentifier === ACTION_STOP) stopScreenShare();
    });
    return () => sub.remove();
  }, [stopScreenShare]);

  return null;
}
