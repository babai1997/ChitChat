import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleDashed } from 'lucide-react-native';
import { COLORS } from '../../src/theme/colors';

export default function StatusScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
      </View>
      <View style={styles.body}>
        <CircleDashed size={40} color={COLORS.textSecondary} />
        <Text style={styles.text}>Status updates coming soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    height: 60,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: COLORS.bg,
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: COLORS.textPrimary },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { color: COLORS.textSecondary, fontSize: 14 },
});
