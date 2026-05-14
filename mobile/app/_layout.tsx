import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function RootNavigator() {
  const auth = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (auth.status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (auth.status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (auth.status === 'authenticated' && inAuthGroup) {
      router.replace('/(app)/dashboard');
    }
  }, [auth.status, segments, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
