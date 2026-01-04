import { View, Text, StyleSheet } from 'react-native'
import { COLORS } from '@/lib/constants'

export default function AdminAssignmentsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Item Assignments - Coming Soon</Text>
      <Text style={styles.subtext}>Assign inventory items to team members here</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  text: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
})
