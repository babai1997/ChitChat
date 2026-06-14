import { Redirect } from 'expo-router';

export default function Index() {
  // The _layout.tsx handles the actual redirection logic based on auth state,
  // but we need an index file so Expo Router has a default route to load.
  return <Redirect href="/(auth)/login" />;
}
