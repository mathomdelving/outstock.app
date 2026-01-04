import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput } from 'react-native'
import { useState, useEffect, useCallback } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useFocusEffect } from 'expo-router'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { COLORS, DEFAULT_CATEGORIES } from '@/lib/constants'
import { InventoryItem } from '@/types/database.types'

export default function InventoryScreen() {
  const { profile, isAdmin } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    console.log('fetchItems called, profile:', profile)

    if (!profile?.organization_id) {
      console.log('No organization_id, skipping fetch')
      setLoading(false)
      return
    }

    try {
      console.log('Fetching items for org:', profile.organization_id)

      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .is('deleted_at', null)
        .order('name')

      console.log('Fetch result:', { data, error })

      if (error) throw error

      setItems(data || [])
      setFilteredItems(data || [])
    } catch (error) {
      console.error('Error fetching items:', error)
    } finally {
      setLoading(false)
    }
  }, [profile?.organization_id])

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchItems()
    }, [fetchItems])
  )

  // Filter items when search or category changes
  useEffect(() => {
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

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchItems()
    setRefreshing(false)
  }

  const handleItemPress = (item: InventoryItem) => {
    router.push(`/(app)/item/${item.id}`)
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
    </TouchableOpacity>
  )

  const categories = ['All', ...DEFAULT_CATEGORIES]

  return (
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
              {loading
                ? ''
                : isAdmin
                ? 'Add your first inventory item to get started'
                : 'No items have been assigned to you yet'}
            </Text>
          </View>
        }
      />

      {isAdmin && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/(app)/(admin)/items/create')}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
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
})
