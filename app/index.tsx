import { Redirect } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'

export default function Index() {
  const { user, initialized } = useAuth()

  if (!initialized) {
    return null
  }

  // Redirect based on auth state
  if (user) {
    return <Redirect href="/(app)/(tabs)" />
  }

  return <Redirect href="/(auth)/login" />
}
