import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

export default function AppLayout() {
  const { signOut } = useAuth();
  return (
    <Tabs
      screenOptions={{
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            // A failed sign-out leaves the session in place, which the UI already shows.
            onPress={() => void signOut().catch(() => undefined)}
            style={styles.headerButton}>
            <Text style={styles.headerButtonLabel}>Sign out</Text>
          </Pressable>
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarIconStyle: styles.hidden,
        tabBarLabelStyle: styles.tabLabel,
      }}>
      <Tabs.Screen name="index" options={{ title: 'People' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: { paddingHorizontal: 16 },
  headerButtonLabel: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  hidden: { display: 'none' },
  tabLabel: { fontSize: 14, fontWeight: '600' },
});
