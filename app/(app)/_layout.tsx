import { Stack } from 'expo-router'
import { Redirect } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { COLORS } from '@/lib/constants'

export default function AppLayout() {
  const { user, initialized } = useAuth()

  // If not logged in, redirect to auth
  if (initialized && !user) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
      <Stack.Screen
        name="item/[itemId]"
        options={{
          headerShown: true,
          headerBackVisible: true,
          title: 'Item Details',
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
        }}
      />
    </Stack>
  )
}
