-- Migration: 006_location_history
-- Description: Tracks where items were sold/given away

CREATE TYPE location_action AS ENUM ('sale', 'giveaway', 'transfer', 'restock', 'adjustment');

CREATE TABLE IF NOT EXISTS location_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Action details
  action location_action NOT NULL,
  quantity_change INTEGER NOT NULL, -- Positive or negative
  quantity_after INTEGER NOT NULL, -- Running total after this action

  -- Location data (flexible)
  location_name TEXT, -- Named location: "State Fair Booth", "Downtown Rally"
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),

  -- Additional context
  notes TEXT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_location_item ON location_history(item_id);
CREATE INDEX IF NOT EXISTS idx_location_user ON location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_location_time ON location_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_coords ON location_history(latitude, longitude)
  WHERE latitude IS NOT NULL;

-- Enable RLS
ALTER TABLE location_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see history for items they created or have assigned
CREATE POLICY "Users can see own item history"
  ON location_history FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM item_assignments
      WHERE item_id = location_history.item_id
      AND user_id = auth.uid()
      AND revoked_at IS NULL
    )
  );

-- Policy: Admins can see all history in their org
CREATE POLICY "Admins can see org history"
  ON location_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN inventory_items ii ON ii.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND ii.id = location_history.item_id
    )
  );

-- Policy: Users can create history entries for their assigned items
CREATE POLICY "Users can log location"
  ON location_history FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- User has the item assigned
      EXISTS (
        SELECT 1 FROM item_assignments
        WHERE item_id = location_history.item_id
        AND user_id = auth.uid()
        AND revoked_at IS NULL
      )
      -- Or user is an admin in the org
      OR EXISTS (
        SELECT 1 FROM user_profiles up
        JOIN inventory_items ii ON ii.organization_id = up.organization_id
        WHERE up.id = auth.uid() AND up.role = 'admin'
        AND ii.id = location_history.item_id
      )
    )
  );

COMMENT ON TABLE location_history IS 'Tracks item movements and location data';
