import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native'
import { useLocalSearchParams, Stack, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { COLORS, LOCATION_ACTION_LABELS } from '@/lib/constants'
import {
  InventoryItem,
  LocationHistory,
  LocationAction,
  ItemAssignment,
  UserProfile,
  Location,
} from '@/types/database.types'

interface AssignmentWithDetails extends ItemAssignment {
  user?: UserProfile
  location?: Location
}

interface HistoryWithUser extends LocationHistory {
  recorded_by?: UserProfile
}

interface ManagedLocation extends Location {
  assignedQuantity: number
}

export default function ItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  const { profile, isAdmin } = useAuth()
  const [item, setItem] = useState<InventoryItem | null>(null)
  const [history, setHistory] = useState<HistoryWithUser[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentAction, setAdjustmentAction] = useState<LocationAction>('sale')
  const [locationName, setLocationName] = useState('')

  // Assignment modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [assignType, setAssignType] = useState<'user' | 'location'>('user')
  const [assignQuantity, setAssignQuantity] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [availableUsers, setAvailableUsers] = useState<UserProfile[]>([])
  const [availableLocations, setAvailableLocations] = useState<Location[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)

  // Location picker state for quantity adjustment
  const [locationPickerVisible, setLocationPickerVisible] = useState(false)
  const [selectedAdjustmentLocationId, setSelectedAdjustmentLocationId] = useState<string | null>(null)
  const [createLocationModalVisible, setCreateLocationModalVisible] = useState(false)
  const [newLocationName, setNewLocationName] = useState('')
  const [creatingLocation, setCreatingLocation] = useState(false)

  // Location manager request state
  const [managedLocations, setManagedLocations] = useState<ManagedLocation[]>([])
  const [requestModalVisible, setRequestModalVisible] = useState(false)
  const [requestQuantity, setRequestQuantity] = useState('')
  const [requestNotes, setRequestNotes] = useState('')
  const [selectedRequestLocationId, setSelectedRequestLocationId] = useState<string | null>(null)
  const [submittingRequest, setSubmittingRequest] = useState(false)

  const fetchItem = useCallback(async () => {
    if (!itemId) return

    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', itemId)
        .single()

      if (error) throw error
      setItem(data)

      // Fetch history
      const { data: historyData } = await supabase
        .from('location_history')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: false })
        .limit(20)

      // Fetch user info for each history entry
      const historyWithUsers: HistoryWithUser[] = await Promise.all(
        (historyData || []).map(async (entry: LocationHistory) => {
          let recorded_by: UserProfile | undefined
          if (entry.user_id) {
            const { data: userData } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', entry.user_id)
              .single()
            recorded_by = userData || undefined
          }
          return { ...entry, recorded_by }
        })
      )

      setHistory(historyWithUsers)

      // Fetch assignments for admins
      if (isAdmin) {
        const { data: assignmentsData } = await supabase
          .from('item_assignments')
          .select('*')
          .eq('item_id', itemId)
          .is('revoked_at', null)

        // Fetch user and location details for each assignment
        const assignmentsWithDetails: AssignmentWithDetails[] = await Promise.all(
          (assignmentsData || []).map(async (assignment: ItemAssignment) => {
            let user: UserProfile | undefined
            let location: Location | undefined

            if (assignment.user_id) {
              const { data: userData } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('id', assignment.user_id)
                .single()
              user = userData || undefined
            }

            if (assignment.location_id) {
              const { data: locationData } = await supabase
                .from('locations')
                .select('*')
                .eq('id', assignment.location_id)
                .single()
              location = locationData || undefined
            }

            return { ...assignment, user, location }
          })
        )

        setAssignments(assignmentsWithDetails)
      }
    } catch (error) {
      console.error('Error fetching item:', error)
      alert('Failed to load item')
    } finally {
      setLoading(false)
    }
  }, [itemId, isAdmin])

  const fetchAssignmentOptions = useCallback(async () => {
    if (!profile?.organization_id) return

    // Fetch users
    const { data: usersData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('organization_id', profile.organization_id)

    setAvailableUsers(usersData || [])

    // Fetch locations
    const { data: locationsData } = await supabase
      .from('locations')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .order('name')

    setAvailableLocations(locationsData || [])
  }, [profile?.organization_id])

  // Fetch locations managed by the current user (for non-admins)
  const fetchManagedLocations = useCallback(async () => {
    if (!profile?.id || !itemId || isAdmin) return

    try {
      // Get locations where user is a manager
      const { data: managerData } = await supabase
        .from('location_managers')
        .select('location_id')
        .eq('user_id', profile.id)
        .is('revoked_at', null)

      if (!managerData || managerData.length === 0) return

      const locationIds = managerData.map((m) => m.location_id)

      // Fetch location details
      const { data: locationsData } = await supabase
        .from('locations')
        .select('*')
        .in('id', locationIds)

      // For each location, get the assignment quantity for this item
      const locationsWithAssignments: ManagedLocation[] = await Promise.all(
        (locationsData || []).map(async (location) => {
          const { data: assignmentData } = await supabase
            .from('item_assignments')
            .select('quantity_assigned')
            .eq('location_id', location.id)
            .eq('item_id', itemId)
            .is('revoked_at', null)
            .single()

          return {
            ...location,
            assignedQuantity: assignmentData?.quantity_assigned || 0,
          }
        })
      )

      setManagedLocations(locationsWithAssignments)

      // Auto-select first location if only one
      if (locationsWithAssignments.length === 1) {
        setSelectedRequestLocationId(locationsWithAssignments[0].id)
      }
    } catch (error) {
      console.error('Error fetching managed locations:', error)
    }
  }, [profile?.id, itemId, isAdmin])

  useEffect(() => {
    fetchItem()
  }, [fetchItem])

  // Fetch locations for all users (for the adjustment location picker)
  useEffect(() => {
    fetchAssignmentOptions()
  }, [fetchAssignmentOptions])

  // Fetch managed locations for non-admin users
  useEffect(() => {
    fetchManagedLocations()
  }, [fetchManagedLocations])

  const handleAdjustment = async () => {
    if (!item || !adjustmentAmount || !profile) return

    const amount = parseInt(adjustmentAmount, 10)
    if (isNaN(amount) || amount === 0) {
      alert('Please enter a valid amount')
      return
    }

    // Calculate quantity change (negative for sales/giveaways, positive for restock)
    const isDecrease = ['sale', 'giveaway', 'transfer'].includes(adjustmentAction)
    const quantityChange = isDecrease ? -Math.abs(amount) : Math.abs(amount)
    const newQuantity = item.quantity + quantityChange

    if (newQuantity < 0) {
      alert('Cannot reduce quantity below 0')
      return
    }

    // Find assignment for the selected location (if any)
    const locationAssignment = selectedAdjustmentLocationId
      ? assignments.find((a) => a.location_id === selectedAdjustmentLocationId)
      : null

    // Validate that location has enough assigned quantity for decreases
    if (isDecrease && locationAssignment) {
      const assignedQty = locationAssignment.quantity_assigned || 0
      if (amount > assignedQty) {
        alert(`Cannot remove ${amount} units from ${locationName}. Only ${assignedQty} units are assigned to this location.`)
        return
      }
    }

    setAdjusting(true)

    try {
      // Insert location history
      const { error: historyError } = await supabase.from('location_history').insert({
        item_id: item.id,
        user_id: profile.id,
        action: adjustmentAction,
        quantity_change: quantityChange,
        quantity_after: newQuantity,
        location_name: locationName || null,
      })

      if (historyError) throw historyError

      // Update item quantity directly
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ quantity: newQuantity })
        .eq('id', item.id)

      if (updateError) throw updateError

      // If this adjustment is from a location assignment, update that assignment's quantity
      if (locationAssignment && locationAssignment.quantity_assigned !== null) {
        const newAssignedQty = locationAssignment.quantity_assigned + quantityChange
        const { error: assignmentError } = await supabase
          .from('item_assignments')
          .update({ quantity_assigned: Math.max(0, newAssignedQty) })
          .eq('id', locationAssignment.id)

        if (assignmentError) {
          console.error('Error updating assignment:', assignmentError)
        }
      }

      // Refresh data
      await fetchItem()

      // Reset form
      setAdjustmentAmount('')
      setLocationName('')
      setSelectedAdjustmentLocationId(null)

      alert('Inventory updated successfully')
    } catch (error) {
      console.error('Error adjusting inventory:', error)
      alert('Failed to update inventory')
    } finally {
      setAdjusting(false)
    }
  }

  const handleCreateAssignment = async () => {
    if (!item || !profile) return

    const targetId = assignType === 'user' ? selectedUserId : selectedLocationId
    if (!targetId) {
      alert(`Please select a ${assignType}`)
      return
    }

    const qty = assignQuantity ? parseInt(assignQuantity, 10) : null

    // Validate quantity doesn't exceed available stock
    if (qty !== null) {
      if (qty <= 0) {
        alert('Quantity must be greater than 0')
        return
      }
      if (qty > availableToAssign) {
        alert(`Cannot assign ${qty} units. Only ${availableToAssign} available to assign (${item.quantity} in stock - ${totalAssigned} already assigned).`)
        return
      }
    } else {
      // If no quantity specified, warn if nothing available
      if (availableToAssign <= 0) {
        alert(`No units available to assign. All ${item.quantity} units are already assigned.`)
        return
      }
    }

    setAssigning(true)
    try {
      const { error } = await supabase.from('item_assignments').insert({
        item_id: item.id,
        user_id: assignType === 'user' ? targetId : null,
        location_id: assignType === 'location' ? targetId : null,
        assigned_by: profile.id,
        quantity_assigned: qty,
        notes: assignNotes.trim() || null,
      })

      if (error) throw error

      alert('Assignment created successfully')
      setAssignModalVisible(false)
      resetAssignmentForm()
      await fetchItem()
    } catch (error) {
      console.error('Error creating assignment:', error)
      alert('Failed to create assignment: ' + (error as Error).message)
    } finally {
      setAssigning(false)
    }
  }

  const handleRevokeAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('item_assignments')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', assignmentId)

      if (error) throw error

      alert('Assignment revoked')
      await fetchItem()
    } catch (error) {
      console.error('Error revoking assignment:', error)
      alert('Failed to revoke assignment')
    }
  }

  const resetAssignmentForm = () => {
    setAssignType('user')
    setAssignQuantity('')
    setAssignNotes('')
    setSelectedUserId(null)
    setSelectedLocationId(null)
  }

  // Calculate total assigned and available quantities
  const totalAssigned = assignments.reduce((sum, a) => sum + (a.quantity_assigned || 0), 0)
  const availableToAssign = item ? Math.max(0, item.quantity - totalAssigned) : 0

  const handleCreateLocation = async () => {
    if (!newLocationName.trim() || !profile?.organization_id) return

    setCreatingLocation(true)
    try {
      const { data, error } = await supabase
        .from('locations')
        .insert({
          name: newLocationName.trim(),
          organization_id: profile.organization_id,
        })
        .select()
        .single()

      if (error) throw error

      // Add to available locations and select it
      setAvailableLocations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedAdjustmentLocationId(data.id)
      setLocationName(data.name)
      setCreateLocationModalVisible(false)
      setLocationPickerVisible(false)
      setNewLocationName('')
      alert('Location created!')
    } catch (error) {
      console.error('Error creating location:', error)
      alert('Failed to create location')
    } finally {
      setCreatingLocation(false)
    }
  }

  const getSelectedLocationName = () => {
    if (!selectedAdjustmentLocationId) return ''
    const location = availableLocations.find((l) => l.id === selectedAdjustmentLocationId)
    return location?.name || ''
  }

  const handleSubmitRequest = async () => {
    if (!item || !profile?.organization_id || !selectedRequestLocationId) return

    const qty = parseInt(requestQuantity, 10)
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid quantity')
      return
    }

    setSubmittingRequest(true)
    try {
      const { error } = await supabase.from('inventory_requests').insert({
        organization_id: profile.organization_id,
        location_id: selectedRequestLocationId,
        item_id: item.id,
        quantity_requested: qty,
        notes: requestNotes.trim() || null,
        requested_by: profile.id,
      })

      if (error) throw error

      const locationName = managedLocations.find((l) => l.id === selectedRequestLocationId)?.name
      alert(`Request submitted for ${qty} ${item.name} for ${locationName}`)
      setRequestModalVisible(false)
      setRequestQuantity('')
      setRequestNotes('')
    } catch (error) {
      console.error('Error submitting request:', error)
      alert('Failed to submit request: ' + (error as Error).message)
    } finally {
      setSubmittingRequest(false)
    }
  }

  // Check if user is a location manager (non-admin with managed locations)
  const isLocationManager = !isAdmin && managedLocations.length > 0

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    )
  }

  if (!item) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Item not found</Text>
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: item.name,
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
          <View style={styles.header}>
            <View style={styles.quantityDisplay}>
              <Text
                style={[
                  styles.quantity,
                  item.quantity <= 10 && styles.quantityLow,
                  item.quantity === 0 && styles.quantityZero,
                ]}
              >
                {item.quantity}
              </Text>
              <Text style={styles.quantityLabel}>in stock</Text>
            </View>

            <View style={styles.itemMeta}>
              {item.sku && (
                <Text style={styles.metaText}>SKU: {item.sku}</Text>
              )}
              {item.category && (
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adjust Quantity</Text>
            <View style={styles.adjustmentCard}>
              <View style={styles.actionButtons}>
                {(['sale', 'giveaway', 'restock', 'adjustment'] as LocationAction[]).map(
                  (action) => (
                    <TouchableOpacity
                      key={action}
                      style={[
                        styles.actionButton,
                        adjustmentAction === action && styles.actionButtonActive,
                      ]}
                      onPress={() => setAdjustmentAction(action)}
                    >
                      <Text
                        style={[
                          styles.actionButtonText,
                          adjustmentAction === action && styles.actionButtonTextActive,
                        ]}
                      >
                        {LOCATION_ACTION_LABELS[action]}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </View>

              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, styles.inputAmount]}
                  value={adjustmentAmount}
                  onChangeText={setAdjustmentAmount}
                  placeholder="Amount"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  style={[styles.input, styles.inputLocation, styles.locationPicker]}
                  onPress={() => setLocationPickerVisible(true)}
                >
                  <Text
                    style={[
                      styles.locationPickerText,
                      !selectedAdjustmentLocationId && styles.locationPickerPlaceholder,
                    ]}
                  >
                    {selectedAdjustmentLocationId
                      ? getSelectedLocationName()
                      : 'Location (optional)'}
                  </Text>
                  <Text style={styles.locationPickerChevron}>▼</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.submitButton, adjusting && styles.submitButtonDisabled]}
                onPress={handleAdjustment}
                disabled={adjusting || !adjustmentAmount}
              >
                <Text style={styles.submitButtonText}>
                  {adjusting ? 'Updating...' : 'Update Inventory'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Assignments Section (Admin Only) */}
          {isAdmin && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Assignments</Text>
                <TouchableOpacity
                  style={[styles.addButton, availableToAssign <= 0 && styles.addButtonDisabled]}
                  onPress={() => setAssignModalVisible(true)}
                  disabled={availableToAssign <= 0}
                >
                  <Text style={styles.addButtonText}>+ Assign</Text>
                </TouchableOpacity>
              </View>

              {/* Assignment Summary */}
              <View style={[styles.assignmentSummary, totalAssigned > item.quantity && styles.assignmentSummaryWarning]}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, totalAssigned > item.quantity && styles.summaryValueWarning]}>
                    {totalAssigned}
                  </Text>
                  <Text style={styles.summaryLabel}>Assigned</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={[
                    styles.summaryValue,
                    availableToAssign <= 0 && styles.summaryValueZero,
                    totalAssigned > item.quantity && styles.summaryValueWarning,
                  ]}>
                    {availableToAssign}
                  </Text>
                  <Text style={styles.summaryLabel}>Available</Text>
                </View>
              </View>

              {/* Over-assignment Warning */}
              {totalAssigned > item.quantity && (
                <View style={styles.warningBanner}>
                  <Text style={styles.warningText}>
                    ⚠️ Over-assigned by {totalAssigned - item.quantity} units! Revoke some assignments or restock.
                  </Text>
                </View>
              )}

              {assignments.length === 0 ? (
                <View style={styles.emptyAssignments}>
                  <Text style={styles.emptyAssignmentsText}>
                    No assignments yet. Assign this item to users or locations.
                  </Text>
                </View>
              ) : (
                assignments.map((assignment) => (
                  <View key={assignment.id} style={styles.assignmentCard}>
                    <View style={styles.assignmentInfo}>
                      <Text style={styles.assignmentTarget}>
                        {assignment.user
                          ? assignment.user.display_name || assignment.user.email
                          : assignment.location?.name || 'Unknown'}
                      </Text>
                      <Text style={styles.assignmentType}>
                        {assignment.user ? 'User' : 'Location'}
                        {assignment.quantity_assigned
                          ? ` - ${assignment.quantity_assigned} units`
                          : ''}
                      </Text>
                      {assignment.notes && (
                        <Text style={styles.assignmentNotes}>{assignment.notes}</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.revokeButton}
                      onPress={() => handleRevokeAssignment(assignment.id)}
                    >
                      <Text style={styles.revokeButtonText}>Revoke</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Request Inventory Section (Location Managers Only) */}
          {isLocationManager && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Request Inventory</Text>
              <View style={styles.requestCard}>
                <Text style={styles.requestCardText}>
                  Need more of this item for your location? Submit a request to the admin.
                </Text>
                {managedLocations.map((location) => (
                  <View key={location.id} style={styles.managedLocationCard}>
                    <View style={styles.managedLocationInfo}>
                      <Text style={styles.managedLocationName}>{location.name}</Text>
                      <Text style={styles.managedLocationQuantity}>
                        Currently assigned: {location.assignedQuantity} units
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.requestButton}
                      onPress={() => {
                        setSelectedRequestLocationId(location.id)
                        setRequestModalVisible(true)
                      }}
                    >
                      <Text style={styles.requestButtonText}>Request More</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {history.length === 0 ? (
              <Text style={styles.emptyHistory}>No activity recorded yet</Text>
            ) : (
              history.map((entry) => (
                <View key={entry.id} style={styles.historyItem}>
                  <View style={styles.historyIcon}>
                    <Text style={styles.historyIconText}>
                      {entry.action === 'sale'
                        ? '💰'
                        : entry.action === 'giveaway'
                        ? '🎁'
                        : entry.action === 'restock'
                        ? '📦'
                        : '📝'}
                    </Text>
                  </View>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyAction}>
                      {LOCATION_ACTION_LABELS[entry.action]}
                      {entry.location_name && ` at ${entry.location_name}`}
                    </Text>
                    <Text style={styles.historyQuantity}>
                      {entry.quantity_change > 0 ? '+' : ''}
                      {entry.quantity_change} → {entry.quantity_after} total
                    </Text>
                    <Text style={styles.historyTime}>
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

        {/* Assignment Modal */}
        <Modal
          visible={assignModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAssignModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Assign Item</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Assign to</Text>
                <View style={styles.typeSelector}>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      assignType === 'user' && styles.typeOptionActive,
                    ]}
                    onPress={() => {
                      setAssignType('user')
                      setSelectedLocationId(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        assignType === 'user' && styles.typeOptionTextActive,
                      ]}
                    >
                      User
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      assignType === 'location' && styles.typeOptionActive,
                    ]}
                    onPress={() => {
                      setAssignType('location')
                      setSelectedUserId(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.typeOptionText,
                        assignType === 'location' && styles.typeOptionTextActive,
                      ]}
                    >
                      Location
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Select {assignType === 'user' ? 'User' : 'Location'}
                </Text>
                <FlatList
                  data={assignType === 'user' ? availableUsers : availableLocations}
                  keyExtractor={(item) => item.id}
                  style={styles.optionList}
                  renderItem={({ item: option }) => (
                    <TouchableOpacity
                      style={[
                        styles.optionItem,
                        (assignType === 'user'
                          ? selectedUserId === option.id
                          : selectedLocationId === option.id) && styles.optionItemActive,
                      ]}
                      onPress={() => {
                        if (assignType === 'user') {
                          setSelectedUserId(option.id)
                        } else {
                          setSelectedLocationId(option.id)
                        }
                      }}
                    >
                      <Text style={styles.optionName}>
                        {assignType === 'user'
                          ? (option as UserProfile).display_name ||
                            (option as UserProfile).email
                          : (option as Location).name}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.noOptionsText}>
                      No {assignType === 'user' ? 'users' : 'locations'} available
                    </Text>
                  }
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Quantity ({availableToAssign} available)
                </Text>
                <TextInput
                  style={styles.modalInput}
                  value={assignQuantity}
                  onChangeText={setAssignQuantity}
                  placeholder={`Max: ${availableToAssign}`}
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.notesInput]}
                  value={assignNotes}
                  onChangeText={setAssignNotes}
                  placeholder="Add notes..."
                  placeholderTextColor={COLORS.textSecondary}
                  multiline
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setAssignModalVisible(false)
                    resetAssignmentForm()
                  }}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalAssignButton, assigning && styles.modalButtonDisabled]}
                  onPress={handleCreateAssignment}
                  disabled={assigning}
                >
                  <Text style={styles.modalAssignButtonText}>
                    {assigning ? 'Assigning...' : 'Assign'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Location Picker Modal */}
        <Modal
          visible={locationPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLocationPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Location</Text>

              <FlatList
                data={availableLocations}
                keyExtractor={(item) => item.id}
                style={styles.locationList}
                renderItem={({ item: location }) => (
                  <TouchableOpacity
                    style={[
                      styles.locationOption,
                      selectedAdjustmentLocationId === location.id && styles.locationOptionActive,
                    ]}
                    onPress={() => {
                      setSelectedAdjustmentLocationId(location.id)
                      setLocationName(location.name)
                      setLocationPickerVisible(false)
                    }}
                  >
                    <Text style={styles.locationOptionText}>{location.name}</Text>
                    {selectedAdjustmentLocationId === location.id && (
                      <Text style={styles.locationOptionCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.noLocationsText}>
                    No locations created yet. Create one below.
                  </Text>
                }
              />

              <TouchableOpacity
                style={styles.createLocationButton}
                onPress={() => setCreateLocationModalVisible(true)}
              >
                <Text style={styles.createLocationButtonText}>+ Create New Location</Text>
              </TouchableOpacity>

              <View style={styles.locationPickerActions}>
                {selectedAdjustmentLocationId && (
                  <TouchableOpacity
                    style={styles.clearLocationButton}
                    onPress={() => {
                      setSelectedAdjustmentLocationId(null)
                      setLocationName('')
                      setLocationPickerVisible(false)
                    }}
                  >
                    <Text style={styles.clearLocationButtonText}>Clear Selection</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setLocationPickerVisible(false)}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Create Location Modal */}
        <Modal
          visible={createLocationModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCreateLocationModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Create Location</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Location Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newLocationName}
                  onChangeText={setNewLocationName}
                  placeholder="e.g., Downtown Booth"
                  placeholderTextColor={COLORS.textSecondary}
                  autoFocus
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setCreateLocationModalVisible(false)
                    setNewLocationName('')
                  }}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalAssignButton,
                    (creatingLocation || !newLocationName.trim()) && styles.modalButtonDisabled,
                  ]}
                  onPress={handleCreateLocation}
                  disabled={creatingLocation || !newLocationName.trim()}
                >
                  <Text style={styles.modalAssignButtonText}>
                    {creatingLocation ? 'Creating...' : 'Create'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Request Inventory Modal (Location Managers) */}
        <Modal
          visible={requestModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRequestModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Request Inventory</Text>
              <Text style={styles.requestModalSubtitle}>
                for {managedLocations.find((l) => l.id === selectedRequestLocationId)?.name}
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Item</Text>
                <View style={styles.requestItemPreview}>
                  <Text style={styles.requestItemName}>{item?.name}</Text>
                  <Text style={styles.requestItemStock}>{item?.quantity} in stock</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Quantity Needed</Text>
                <TextInput
                  style={styles.modalInput}
                  value={requestQuantity}
                  onChangeText={setRequestQuantity}
                  placeholder="Enter quantity"
                  placeholderTextColor={COLORS.textSecondary}
                  keyboardType="number-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes (optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.notesInput]}
                  value={requestNotes}
                  onChangeText={setRequestNotes}
                  placeholder="Why do you need more?"
                  placeholderTextColor={COLORS.textSecondary}
                  multiline
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setRequestModalVisible(false)
                    setRequestQuantity('')
                    setRequestNotes('')
                  }}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalAssignButton,
                    (submittingRequest || !requestQuantity) && styles.modalButtonDisabled,
                  ]}
                  onPress={handleSubmitRequest}
                  disabled={submittingRequest || !requestQuantity}
                >
                  <Text style={styles.modalAssignButtonText}>
                    {submittingRequest ? 'Submitting...' : 'Submit Request'}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
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
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  quantityDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  quantity: {
    fontSize: 64,
    fontWeight: 'bold',
    color: COLORS.success,
  },
  quantityLow: {
    color: COLORS.warning,
  },
  quantityZero: {
    color: COLORS.error,
  },
  quantityLabel: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  itemMeta: {
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  categoryBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryText: {
    fontSize: 14,
    color: COLORS.text,
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
    marginBottom: 12,
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
  addButtonDisabled: {
    opacity: 0.5,
  },
  // Assignment summary styles
  assignmentSummary: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4,
  },
  summaryValueZero: {
    color: COLORS.textSecondary,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },
  summaryValueWarning: {
    color: COLORS.error,
  },
  assignmentSummaryWarning: {
    borderColor: COLORS.error,
    backgroundColor: COLORS.error + '10',
  },
  warningBanner: {
    backgroundColor: COLORS.warning + '20',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  warningText: {
    color: COLORS.warning,
    fontSize: 13,
    fontWeight: '500',
  },
  adjustmentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  actionButtonText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  actionButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputAmount: {
    width: 100,
  },
  inputLocation: {
    flex: 1,
  },
  locationPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationPickerText: {
    fontSize: 16,
    color: COLORS.text,
    flex: 1,
  },
  locationPickerPlaceholder: {
    color: COLORS.textSecondary,
  },
  locationPickerChevron: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginLeft: 8,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Assignments styles
  emptyAssignments: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  emptyAssignmentsText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  assignmentCard: {
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
  assignmentInfo: {
    flex: 1,
  },
  assignmentTarget: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  assignmentType: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  assignmentNotes: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.error + '20',
  },
  revokeButtonText: {
    color: COLORS.error,
    fontSize: 12,
    fontWeight: '600',
  },
  // History styles
  emptyHistory: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyIconText: {
    fontSize: 18,
  },
  historyContent: {
    flex: 1,
  },
  historyAction: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.text,
    marginBottom: 2,
  },
  historyQuantity: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  historyTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  typeOptionTextActive: {
    color: COLORS.primary,
  },
  optionList: {
    maxHeight: 150,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  optionItemActive: {
    backgroundColor: COLORS.primary + '20',
  },
  optionName: {
    fontSize: 14,
    color: COLORS.text,
  },
  noOptionsText: {
    padding: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
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
  modalAssignButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalAssignButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  // Location picker modal styles
  locationList: {
    maxHeight: 200,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  locationOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationOptionActive: {
    backgroundColor: COLORS.primary + '20',
  },
  locationOptionText: {
    fontSize: 15,
    color: COLORS.text,
  },
  locationOptionCheck: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  noLocationsText: {
    padding: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 14,
  },
  createLocationButton: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  createLocationButtonText: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  locationPickerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  clearLocationButton: {
    flex: 1,
    backgroundColor: COLORS.error + '10',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.error + '30',
  },
  clearLocationButtonText: {
    color: COLORS.error,
    fontSize: 16,
    fontWeight: '600',
  },
  // Request inventory styles (location managers)
  requestCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requestCardText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  managedLocationCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  managedLocationInfo: {
    flex: 1,
  },
  managedLocationName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  managedLocationQuantity: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  requestButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  requestModalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: -8,
    marginBottom: 16,
  },
  requestItemPreview: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  requestItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  requestItemStock: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
})
