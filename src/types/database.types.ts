export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'admin' | 'user'
export type FieldType = 'text' | 'number' | 'select' | 'boolean' | 'date'
export type LocationAction = 'sale' | 'giveaway' | 'transfer' | 'restock' | 'adjustment'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string
          updated_at?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          organization_id: string
          email: string
          display_name: string | null
          role: UserRole
          created_at: string
          updated_at: string
          last_active: string
        }
        Insert: {
          id: string
          organization_id: string
          email: string
          display_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
          last_active?: string
        }
        Update: {
          id?: string
          organization_id?: string
          email?: string
          display_name?: string | null
          role?: UserRole
          created_at?: string
          updated_at?: string
          last_active?: string
        }
      }
      field_definitions: {
        Row: {
          id: string
          organization_id: string
          name: string
          label: string
          field_type: FieldType
          options: Json | null
          is_required: boolean
          is_core: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          label: string
          field_type?: FieldType
          options?: Json | null
          is_required?: boolean
          is_core?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          label?: string
          field_type?: FieldType
          options?: Json | null
          is_required?: boolean
          is_core?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      inventory_items: {
        Row: {
          id: string
          organization_id: string
          name: string
          sku: string | null
          category: string | null
          quantity: number
          custom_fields: Json
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          sku?: string | null
          category?: string | null
          quantity?: number
          custom_fields?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          sku?: string | null
          category?: string | null
          quantity?: number
          custom_fields?: Json
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
      }
      item_assignments: {
        Row: {
          id: string
          item_id: string
          user_id: string | null
          location_id: string | null
          assigned_by: string
          quantity_assigned: number | null
          notes: string | null
          assigned_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          item_id: string
          user_id?: string | null
          location_id?: string | null
          assigned_by: string
          quantity_assigned?: number | null
          notes?: string | null
          assigned_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string | null
          location_id?: string | null
          assigned_by?: string
          quantity_assigned?: number | null
          notes?: string | null
          assigned_at?: string
          revoked_at?: string | null
        }
      }
      location_history: {
        Row: {
          id: string
          item_id: string
          user_id: string
          action: LocationAction
          quantity_change: number
          quantity_after: number
          location_name: string | null
          address: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          user_id: string
          action: LocationAction
          quantity_change: number
          quantity_after: number
          location_name?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          item_id?: string
          user_id?: string
          action?: LocationAction
          quantity_change?: number
          quantity_after?: number
          location_name?: string | null
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          created_at?: string
        }
      }
      locations: {
        Row: {
          id: string
          organization_id: string
          name: string
          address: string | null
          latitude: number | null
          longitude: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          address?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      location_managers: {
        Row: {
          id: string
          location_id: string
          user_id: string
          assigned_by: string
          assigned_at: string
          revoked_at: string | null
        }
        Insert: {
          id?: string
          location_id: string
          user_id: string
          assigned_by: string
          assigned_at?: string
          revoked_at?: string | null
        }
        Update: {
          id?: string
          location_id?: string
          user_id?: string
          assigned_by?: string
          assigned_at?: string
          revoked_at?: string | null
        }
      }
      inventory_requests: {
        Row: {
          id: string
          organization_id: string
          location_id: string
          item_id: string
          quantity_requested: number
          status: 'pending' | 'approved' | 'denied'
          notes: string | null
          requested_by: string
          requested_at: string
          responded_by: string | null
          responded_at: string | null
          response_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          location_id: string
          item_id: string
          quantity_requested: number
          status?: 'pending' | 'approved' | 'denied'
          notes?: string | null
          requested_by: string
          requested_at?: string
          responded_by?: string | null
          responded_at?: string | null
          response_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          location_id?: string
          item_id?: string
          quantity_requested?: number
          status?: 'pending' | 'approved' | 'denied'
          notes?: string | null
          requested_by?: string
          requested_at?: string
          responded_by?: string | null
          responded_at?: string | null
          response_notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Enums: {
      user_role: UserRole
      field_type: FieldType
      location_action: LocationAction
    }
  }
}

// Convenience types
export type Organization = Database['public']['Tables']['organizations']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type FieldDefinition = Database['public']['Tables']['field_definitions']['Row']
export type InventoryItem = Database['public']['Tables']['inventory_items']['Row']
export type ItemAssignment = Database['public']['Tables']['item_assignments']['Row']
export type LocationHistory = Database['public']['Tables']['location_history']['Row']
export type Location = Database['public']['Tables']['locations']['Row']
export type LocationManager = Database['public']['Tables']['location_managers']['Row']

// Insert types
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert']
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert']
export type InventoryItemInsert = Database['public']['Tables']['inventory_items']['Insert']
export type LocationHistoryInsert = Database['public']['Tables']['location_history']['Insert']
export type LocationInsert = Database['public']['Tables']['locations']['Insert']
export type LocationManagerInsert = Database['public']['Tables']['location_managers']['Insert']
export type InventoryRequest = Database['public']['Tables']['inventory_requests']['Row']
export type InventoryRequestInsert = Database['public']['Tables']['inventory_requests']['Insert']
