-- Migration: 005_item_assignments
-- Description: Links items to users (Admin assigns items to Users)

CREATE TABLE IF NOT EXISTS item_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),

  -- Assignment details
  quantity_assigned INTEGER, -- Optional: subset of total quantity
  notes TEXT,

  -- Timestamps
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE -- NULL means still assigned
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assignments_user ON item_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_item ON item_assignments(item_id);
CREATE INDEX IF NOT EXISTS idx_assignments_active ON item_assignments(user_id) WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE item_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own assignments
CREATE POLICY "Users can see own assignments"
  ON item_assignments FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Admins can see all assignments in their org
CREATE POLICY "Admins can see org assignments"
  ON item_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN inventory_items ii ON ii.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND ii.id = item_assignments.item_id
    )
  );

-- Policy: Only admins can create assignments
CREATE POLICY "Admins can create assignments"
  ON item_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN inventory_items ii ON ii.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND ii.id = item_assignments.item_id
    )
  );

-- Policy: Only admins can update assignments
CREATE POLICY "Admins can update assignments"
  ON item_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN inventory_items ii ON ii.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND ii.id = item_assignments.item_id
    )
  );

-- Policy: Only admins can delete assignments
CREATE POLICY "Admins can delete assignments"
  ON item_assignments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN inventory_items ii ON ii.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND ii.id = item_assignments.item_id
    )
  );

COMMENT ON TABLE item_assignments IS 'Tracks which items are assigned to which users';
