// Default categories for campaign inventory
export const DEFAULT_CATEGORIES = [
  'Apparel',
  'Signs',
  'Promotional',
  'Literature',
  'Accessories',
] as const

export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number]

// Location action labels
export const LOCATION_ACTION_LABELS = {
  sale: 'Sold',
  giveaway: 'Given Away',
  transfer: 'Transferred',
  restock: 'Restocked',
  adjustment: 'Adjusted',
} as const

// User role labels
export const USER_ROLE_LABELS = {
  admin: 'Admin',
  user: 'User',
} as const

// App colors (dark theme)
export const COLORS = {
  primary: '#6366f1', // Indigo
  primaryDark: '#4f46e5',
  secondary: '#8b5cf6', // Purple
  background: '#1a1a2e',
  surface: '#16213e',
  surfaceLight: '#1f2937',
  text: '#f3f4f6',
  textSecondary: '#9ca3af',
  border: '#374151',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
} as const

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth-token',
  USER_PROFILE: 'user-profile',
  ORGANIZATION: 'organization',
} as const
