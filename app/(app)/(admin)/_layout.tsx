import { Stack } from 'expo-router'
import { Redirect } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { COLORS } from '@/lib/constants'

export default function AdminLayout() {
  const { isAdmin, initialized } = useAuth()

  // Redirect non-admins
  if (initialized && !isAdmin) {
    return <Redirect href="/(app)/(tabs)" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerBackVisible: true,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="users/index" options={{ title: 'Manage Users' }} />
      <Stack.Screen name="users/[userId]" options={{ title: 'User Details' }} />
      <Stack.Screen name="items/index" options={{ title: 'All Items' }} />
      <Stack.Screen name="items/create" options={{ title: 'Add Item' }} />
      <Stack.Screen name="items/[itemId]" options={{ title: 'Edit Item' }} />
      <Stack.Screen name="locations/index" options={{ title: 'Manage Locations' }} />
      <Stack.Screen name="locations/[locationId]" options={{ title: 'Location Details' }} />
      <Stack.Screen name="assignments/index" options={{ title: 'Assignments' }} />
    </Stack>
  )
}
