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
import { COLORS, DEFAULT_CATEGORIES } from '@/lib/constants'
import { InventoryItem, Location } from '@/types/database.types'

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

export default function AdminItemsScreen() {
  const { profile } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!profile?.organization_id) {
      setLoading(false)
      return
    }

    try {
      // Fetch items (including soft-deleted for admin view)
      const { data: itemsData, error: itemsError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('name')

      if (itemsError) throw itemsError

      // Fetch locations
      const { data: locationsData } = await supabase
        .from('locations')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name')

      setItems(itemsData || [])
      setFilteredItems(itemsData || [])
      setLocations(locationsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [profile?.organization_id])

  useFocusEffect(
    useCallback(() => {
      fetchData()
    }, [fetchData])
  )

  // Filter items when search or category changes
  const applyFilters = useCallback(() => {
    let filtered = items

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.sku?.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query)
      )
    }

    if (selectedCategory) {
      filtered = filtered.filter(item => item.category === selectedCategory)
    }

    setFilteredItems(filtered)
  }, [items, searchQuery, selectedCategory])

  // Apply filters when dependencies change
  useFocusEffect(
    useCallback(() => {
      applyFilters()
    }, [applyFilters])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const handleItemPress = (item: InventoryItem) => {
    router.push(`/(app)/item/${item.id}`)
  }

  const handleDeletePress = (item: InventoryItem) => {
    setItemToDelete(item)
    setDeleteModalVisible(true)
  }

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return

    setDeleting(true)
    try {
      // Hard delete - permanently remove from database
      const { error } = await supabase
        .from('inventory_items')
        .delete()
        .eq('id', itemToDelete.id)

      if (error) throw error

      alert('Item deleted successfully')
      setDeleteModalVisible(false)
      setItemToDelete(null)
      await fetchData()
    } catch (error) {
      console.error('Error deleting item:', error)
      alert('Failed to delete item: ' + (error as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const renderItem = ({ item }: { item: InventoryItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => handleItemPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        {item.sku && <Text style={styles.itemSku}>SKU: {item.sku}</Text>}
        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{item.category}</Text>
          </View>
        )}
      </View>
      <View style={styles.itemActions}>
        <View style={styles.quantityContainer}>
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
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeletePress(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )

  const categories = ['All', ...DEFAULT_CATEGORIES]

  return (
    <>
      <Stack.Screen
        options={{
          title: 'All Items',
          headerLeft: () => <BackButton />,
        }}
      />
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search items..."
          placeholderTextColor={COLORS.textSecondary}
        />
      </View>

      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          renderItem={({ item: category }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                (category === 'All' ? !selectedCategory : selectedCategory === category) &&
                  styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategory(category === 'All' ? null : category)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  (category === 'All' ? !selectedCategory : selectedCategory === category) &&
                    styles.filterChipTextActive,
                ]}
              >
                {category}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.filterList}
        />
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          {selectedCategory ? ` in ${selectedCategory}` : ''}
        </Text>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>
              {loading ? 'Loading...' : 'No items found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {loading ? '' : 'Try adjusting your filters or add new items'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/(admin)/items/create')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Delete Item</Text>
            <Text style={styles.modalText}>
              Are you sure you want to permanently delete "{itemToDelete?.name}"? This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setDeleteModalVisible(false)
                  setItemToDelete(null)
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
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterContainer: {
    paddingBottom: 8,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  statsRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  statsText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  itemCard: {
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
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  itemSku: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  categoryBadge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  categoryBadgeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  itemActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  quantityContainer: {
    alignItems: 'center',
    minWidth: 60,
  },
  quantity: {
    fontSize: 24,
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
    fontSize: 11,
    color: COLORS.textSecondary,
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
    marginBottom: 12,
  },
  modalText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
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
