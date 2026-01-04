import { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect, Stack } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/constants'
import { Location, LocationManager, UserProfile } from '@/types/database.types'

function BackButton() {
  return (
    <TouchableOpacity
      onPress={() => router.back()}
      style={{ marginRight: 16, padding: 4 }}
    >
      <Text style={{ fontSize: 24, color: COLORS.text }}>←</Text>
    </TouchableOpacity>
  )
}

interface LocationWithManagers extends Location {
  managers: (LocationManager & { user: UserProfile })[]
}

export default function AdminLocationsScreen() {
  const { profile } = useAuth()
  const [locations, setLocations] = useState<LocationWithManagers[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Create modal state
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [newLocationAddress, setNewLocationAddress] = useState('')
  const [creating, setCreating] = useState(false)

  // Delete modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchLocations = useCallback(async () => {
    if (!profile?.organization_id) {
      setLoading(false)
      return
    }

    try {
      // Fetch locations with their managers
      const { data: locationsData, error: locationsError } = await supabase
        .from('locations')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name')

      if (locationsError) throw locationsError

      // For each location, fetch managers with user profiles
      const locationsWithManagers: LocationWithManagers[] = await Promise.all(
        (locationsData || []).map(async (location) => {
          const { data: managersData } = await supabase
            .from('location_managers')
            .select('*, user:user_profiles(*)')
            .eq('location_id', location.id)
            .is('revoked_at', null)

          return {
            ...location,
            managers: managersData || [],
          }
        })
      )

      setLocations(locationsWithManagers)
    } catch (error) {
      console.error('Error fetching locations:', error)
    } finally {
      setLoading(false)
    }
  }, [profile?.organization_id])

  useFocusEffect(
    useCallback(() => {
      fetchLocations()
    }, [fetchLocations])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchLocations()
    setRefreshing(false)
  }

  const handleCreateLocation = async () => {
    if (!newLocationName.trim()) {
      alert('Please enter a location name')
      return
    }

    if (!profile?.organization_id) {
      alert('Organization not found')
      return
    }

    setCreating(true)
    try {
      const { error } = await supabase.from('locations').insert({
        organization_id: profile.organization_id,
        name: newLocationName.trim(),
        address: newLocationAddress.trim() || null,
      })

      if (error) throw error

      alert('Location created successfully!')
      setCreateModalVisible(false)
      setNewLocationName('')
      setNewLocationAddress('')
      await fetchLocations()
    } catch (error) {
      console.error('Error creating location:', error)
      alert('Failed to create location: ' + (error as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleDeletePress = (location: Location) => {
    setLocationToDelete(location)
    setDeleteModalVisible(true)
  }

  const handleConfirmDelete = async () => {
    if (!locationToDelete) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('locations')
        .delete()
        .eq('id', locationToDelete.id)

      if (error) throw error

      alert('Location deleted successfully')
      setDeleteModalVisible(false)
      setLocationToDelete(null)
      await fetchLocations()
    } catch (error) {
      console.error('Error deleting location:', error)
      alert('Failed to delete location: ' + (error as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const renderLocation = ({ item }: { item: LocationWithManagers }) => (
    <TouchableOpacity
      style={styles.locationCard}
      onPress={() => router.push(`/(app)/(admin)/locations/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.locationInfo}>
        <Text style={styles.locationName}>{item.name}</Text>
        {item.address && (
          <Text style={styles.locationAddress}>{item.address}</Text>
        )}
        <View style={styles.managerRow}>
          <Text style={styles.managerLabel}>
            {item.managers.length === 0
              ? 'No managers assigned'
              : `${item.managers.length} manager${item.managers.length !== 1 ? 's' : ''}`}
          </Text>
        </View>
      </View>
      <View style={styles.locationActions}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeletePress(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manage Locations',
          headerLeft: () => <BackButton />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Locations</Text>
          <Text style={styles.headerSubtitle}>
            Manage distribution points and assign managers
          </Text>
        </View>

      <FlatList
        data={locations}
        keyExtractor={(item) => item.id}
        renderItem={renderLocation}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📍</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Loading...' : 'No locations yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {loading ? '' : 'Create locations like "Downtown Booth" or "State Fair" to assign inventory'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreateModalVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Location Modal */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Location</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Location Name *</Text>
              <TextInput
                style={styles.input}
                value={newLocationName}
                onChangeText={setNewLocationName}
                placeholder="e.g., Downtown Booth"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Address (optional)</Text>
              <TextInput
                style={styles.input}
                value={newLocationAddress}
                onChangeText={setNewLocationAddress}
                placeholder="e.g., 123 Main St"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setCreateModalVisible(false)
                  setNewLocationName('')
                  setNewLocationAddress('')
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateButton, creating && styles.modalButtonDisabled]}
                onPress={handleCreateLocation}
                disabled={creating}
              >
                <Text style={styles.modalCreateButtonText}>
                  {creating ? 'Creating...' : 'Create'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Location</Text>
            <Text style={styles.modalText}>
              Are you sure you want to delete "{locationToDelete?.name}"? All item assignments to this location will also be removed.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeleteModalVisible(false)
                  setLocationToDelete(null)
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteButton, deleting && styles.modalButtonDisabled]}
                onPress={handleConfirmDelete}
                disabled={deleting}
              >
                <Text style={styles.modalDeleteButtonText}>
                  {deleting ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  locationCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  locationAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  managerLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  locationActions: {
    alignItems: 'flex-end',
  },
  deleteButton: {
    backgroundColor: COLORS.error + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteButtonText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
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
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
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
  modalCancelButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalCreateButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCreateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalDeleteButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDeleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
})
