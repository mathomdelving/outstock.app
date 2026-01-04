import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { useFocusEffect } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { COLORS, LOCATION_ACTION_LABELS } from '@/lib/constants'
import {
  Location,
  LocationManager,
  UserProfile,
  ItemAssignment,
  InventoryItem,
  LocationHistory,
  LocationAction,
} from '@/types/database.types'

interface AssignedItem extends ItemAssignment {
  item?: InventoryItem
}

interface ActivityEntry extends LocationHistory {
  item?: InventoryItem
  recorded_by?: UserProfile
}

export default function LocationDetailScreen() {
  const { locationId } = useLocalSearchParams<{ locationId: string }>()
  const { profile } = useAuth()
  const [location, setLocation] = useState<Location | null>(null)
  const [managers, setManagers] = useState<(LocationManager & { user: UserProfile })[]>([])
  const [assignedItems, setAssignedItems] = useState<AssignedItem[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [saving, setSaving] = useState(false)

  // Add manager modal state
  const [addManagerModalVisible, setAddManagerModalVisible] = useState(false)
  const [addingManager, setAddingManager] = useState(false)

  const fetchData = useCallback(async () => {
    if (!locationId) {
      setLoading(false)
      return
    }

    try {
      // Fetch location
      const { data: locationData, error: locationError } = await supabase
        .from('locations')
        .select('*')
        .eq('id', locationId)
        .single()

      if (locationError) throw locationError
      setLocation(locationData)
      setEditName(locationData.name)
      setEditAddress(locationData.address || '')

      // Fetch managers with user profiles
      const { data: managersData } = await supabase
        .from('location_managers')
        .select('*')
        .eq('location_id', locationId)
        .is('revoked_at', null)

      // Fetch user details for each manager
      const managersWithUsers = await Promise.all(
        (managersData || []).map(async (manager: LocationManager) => {
          const { data: userData } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', manager.user_id)
            .single()
          return { ...manager, user: userData }
        })
      )
      setManagers(managersWithUsers)

      // Fetch all users in org (for adding managers)
      if (profile?.organization_id) {
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('organization_id', profile.organization_id)

        // Filter out users who are already managers
        const managerUserIds = new Set((managersData || []).map((m: any) => m.user_id))
        setAvailableUsers((usersData || []).filter(u => !managerUserIds.has(u.id)))
      }

      // Fetch assigned items for this location
      const { data: assignmentsData } = await supabase
        .from('item_assignments')
        .select('*')
        .eq('location_id', locationId)
        .is('revoked_at', null)

      // Fetch item details for each assignment
      const assignmentsWithItems: AssignedItem[] = await Promise.all(
        (assignmentsData || []).map(async (assignment: ItemAssignment) => {
          const { data: itemData } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('id', assignment.item_id)
            .single()
          return { ...assignment, item: itemData || undefined }
        })
      )
      setAssignedItems(assignmentsWithItems)

      // Fetch recent activity for this location
      const { data: activityData } = await supabase
        .from('location_history')
        .select('*')
        .eq('location_name', locationData.name)
        .order('created_at', { ascending: false })
        .limit(20)

      // Fetch item and user details for each activity entry
      const activityWithDetails: ActivityEntry[] = await Promise.all(
        (activityData || []).map(async (entry: LocationHistory) => {
          let item: InventoryItem | undefined
          let recorded_by: UserProfile | undefined

          try {
            const { data: itemData } = await supabase
              .from('inventory_items')
              .select('*')
              .eq('id', entry.item_id)
              .single()
            item = itemData || undefined
          } catch (e) {
            // Item might have been deleted
          }

          if (entry.user_id) {
            try {
              const { data: userData } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', entry.user_id)
                .single()
              recorded_by = userData || undefined
            } catch (e) {
              // User might not exist
            }
          }

          return { ...entry, item, recorded_by }
        })
      )
      setActivity(activityWithDetails)
    } catch (error) {
      console.error('Error fetching location:', error)
    } finally {
      setLoading(false)
    }
  }, [locationId, profile?.organization_id])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  const handleSaveLocation = async () => {
    if (!editName.trim() || !location) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('locations')
        .update({
          name: editName.trim(),
          address: editAddress.trim() || null,
        })
        .eq('id', location.id)

      if (error) throw error

      alert('Location updated successfully')
      setEditModalVisible(false)
      await fetchData()
    } catch (error) {
      console.error('Error updating location:', error)
      alert('Failed to update location: ' + (error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddManager = async (userId: string) => {
    if (!location || !profile) return

    setAddingManager(true)
    try {
      const { error } = await supabase.from('location_managers').insert({
        location_id: location.id,
        user_id: userId,
        assigned_by: profile.id,
      })

      if (error) throw error

      alert('Manager added successfully')
      setAddManagerModalVisible(false)
      await fetchData()
    } catch (error) {
      console.error('Error adding manager:', error)
      alert('Failed to add manager: ' + (error as Error).message)
    } finally {
      setAddingManager(false)
    }
  }

  const handleRemoveManager = async (managerId: string) => {
    try {
      const { error } = await supabase
        .from('location_managers')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', managerId)

      if (error) throw error

      alert('Manager removed')
      await fetchData()
    } catch (error) {
      console.error('Error removing manager:', error)
      alert('Failed to remove manager: ' + (error as Error).message)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  if (!location) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Location not found</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: location.name,
          headerStyle: { backgroundColor: COLORS.surface },
          headerTintColor: COLORS.text,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginRight: 16, padding: 4 }}
            >
              <Text style={{ fontSize: 24, color: COLORS.text }}>←</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Location Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Location Details</Text>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setEditModalVisible(true)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{location.name}</Text>
              </View>
              {location.address && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{location.address}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Created</Text>
                <Text style={styles.infoValue}>
                  {new Date(location.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>

          {/* Managers */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Managers</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setAddManagerModalVisible(true)}
              >
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {managers.length === 0 ? (
              <View style={styles.emptyManagers}>
                <Text style={styles.emptyManagersText}>
                  No managers assigned. Add users who can manage inventory at this location.
                </Text>
              </View>
            ) : (
              managers.map((manager) => (
                <View key={manager.id} style={styles.managerCard}>
                  <View style={styles.managerInfo}>
                    <Text style={styles.managerName}>
                      {manager.user?.display_name || manager.user?.email}
                    </Text>
                    <Text style={styles.managerEmail}>{manager.user?.email}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveManager(manager.id)}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* Assigned Items */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assigned Items</Text>

            {assignedItems.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>
                  No items assigned to this location yet.
                </Text>
              </View>
            ) : (
              assignedItems.map((assignment) => (
                <TouchableOpacity
                  key={assignment.id}
                  style={styles.itemCard}
                  onPress={() => router.push(`/(app)/item/${assignment.item_id}`)}
                >
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{assignment.item?.name || 'Unknown Item'}</Text>
                    {assignment.item?.category && (
                      <Text style={styles.itemCategory}>{assignment.item.category}</Text>
                    )}
                  </View>
                  <View style={styles.itemQuantity}>
                    <Text style={styles.itemQuantityValue}>
                      {assignment.quantity_assigned ?? '-'}
                    </Text>
                    <Text style={styles.itemQuantityLabel}>units</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* Total assigned summary */}
            {assignedItems.length > 0 && (
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>Total Items Assigned</Text>
                <Text style={styles.totalValue}>
                  {assignedItems.reduce((sum, a) => sum + (a.quantity_assigned || 0), 0)} units
                </Text>
              </View>
            )}
          </View>

          {/* Recent Activity */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>

            {activity.length === 0 ? (
              <View style={styles.emptySection}>
                <Text style={styles.emptySectionText}>
                  No activity recorded at this location yet.
                </Text>
              </View>
            ) : (
              activity.map((entry) => (
                <View key={entry.id} style={styles.activityCard}>
                  <View style={styles.activityIcon}>
                    <Text style={styles.activityIconText}>
                      {entry.action === 'sale'
                        ? '💰'
                        : entry.action === 'giveaway'
                        ? '🎁'
                        : entry.action === 'restock'
                        ? '📦'
                        : '📝'}
                    </Text>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityAction}>
                      {LOCATION_ACTION_LABELS[entry.action as LocationAction]}
                      {entry.item ? ` - ${entry.item.name}` : ''}
                    </Text>
                    <Text style={styles.activityQuantity}>
                      {entry.quantity_change > 0 ? '+' : ''}
                      {entry.quantity_change} → {entry.quantity_after} total
                    </Text>
                    <Text style={styles.activityTime}>
                      {entry.recorded_by
                        ? `by ${entry.recorded_by.display_name || entry.recorded_by.email} • `
                        : ''}
                      {new Date(entry.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Edit Modal */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Location</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Location name"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address</Text>
                <TextInput
                  style={styles.input}
                  value={editAddress}
                  onChangeText={setEditAddress}
                  placeholder="Address (optional)"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveButton, saving && styles.modalButtonDisabled]}
                  onPress={handleSaveLocation}
                  disabled={saving}
                >
                  <Text style={styles.modalSaveButtonText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Add Manager Modal */}
        <Modal
          visible={addManagerModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAddManagerModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Manager</Text>

              {availableUsers.length === 0 ? (
                <Text style={styles.noUsersText}>
                  All organization members are already managers of this location.
                </Text>
              ) : (
                <FlatList
                  data={availableUsers}
                  keyExtractor={(item) => item.id}
                  style={styles.userList}
                  renderItem={({ item: user }) => (
                    <TouchableOpacity
                      style={styles.userItem}
                      onPress={() => handleAddManager(user.id)}
                      disabled={addingManager}
                    >
                      <View>
                        <Text style={styles.userName}>
                          {user.display_name || user.email}
                        </Text>
                        <Text style={styles.userEmail}>{user.email}</Text>
                      </View>
                      <Text style={styles.userRole}>{user.role}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              <TouchableOpacity
                style={styles.modalCancelButtonFull}
                onPress={() => setAddManagerModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primary + '20',
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  emptyManagers: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyManagersText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  managerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  managerInfo: {
    flex: 1,
  },
  managerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  managerEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.error + '20',
  },
  removeButtonText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalCancelButtonFull: {
    backgroundColor: COLORS.background,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 16,
  },
  modalCancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  noUsersText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  userList: {
    maxHeight: 300,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  userName: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  userRole: {
    fontSize: 12,
    color: COLORS.primary,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  // Assigned Items styles
  emptySection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptySectionText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemQuantity: {
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  itemQuantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  itemQuantityLabel: {
    fontSize: 11,
    color: COLORS.primary,
  },
  totalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  // Activity styles
  activityCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityIconText: {
    fontSize: 18,
  },
  activityContent: {
    flex: 1,
  },
  activityAction: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  activityQuantity: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
})
