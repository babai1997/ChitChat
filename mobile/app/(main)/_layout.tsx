import { Tabs } from 'expo-router';
import { MessageCircle, Phone, Settings, CircleDashed } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View } from 'react-native';
import MiniCallScreen from '../../components/call/MiniCallScreen';
import { COLORS } from '../../src/theme/colors';

export default function MainLayout() {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          height: Platform.OS === 'ios' ? 88 : 60 + insets.bottom,
          paddingBottom: Platform.OS === 'ios' ? 28 : insets.bottom + 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageCircle size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
          tabBarIcon: ({ color, size }) => <Phone size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, size }) => <CircleDashed size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
      {/* Hide the chat/[id] dynamic route from the tab bar */}
      <Tabs.Screen
        name="chat/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      {/* Hide the call-info/[id] dynamic route from the tab bar */}
      <Tabs.Screen
        name="call-info/[id]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      {/* Hide the linked-devices route from the tab bar — pushed from Settings, not a top-level tab */}
      <Tabs.Screen
        name="linked-devices"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      {/* Hide the meet/[slug] dynamic route from the tab bar */}
      <Tabs.Screen
        name="meet/[slug]"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      </Tabs>
      <MiniCallScreen />
    </View>
  );
}
