import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { createQueryClient } from '@/lib/query-client';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const signedIn = session != null;

  // Drop cached data on sign-out so the next account starts clean.
  useEffect(() => {
    if (session === null) queryClient.clear();
  }, [session, queryClient]);

  if (session === undefined) return <Loading />;

  // The guards decide which screens exist. A signed-out user cannot reach the
  // app screens by deep link, and nothing navigates by hand on sign-in.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
