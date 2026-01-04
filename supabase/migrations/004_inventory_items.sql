-- Migration: 004_inventory_items
-- Description: Core inventory items table

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Core fields (always present)
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,

  -- Dynamic fields stored as JSONB
  custom_fields JSONB DEFAULT '{}',

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Soft delete support
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_org ON inventory_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON inventory_items(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_items_sku ON inventory_items(organization_id, sku);
CREATE INDEX IF NOT EXISTS idx_items_name ON inventory_items(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_items_not_deleted ON inventory_items(organization_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can see all items in their org
CREATE POLICY "Admins read all org items"
  ON inventory_items FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = inventory_items.organization_id
    )
  );

-- Policy: Users can only see items assigned to them
CREATE POLICY "Users read assigned items"
  ON inventory_items FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM item_assignments
      WHERE item_id = inventory_items.id
      AND user_id = auth.uid()
      AND revoked_at IS NULL
    )
  );

-- Policy: Only admins can create items
CREATE POLICY "Admins can create items"
  ON inventory_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = inventory_items.organization_id
    )
  );

-- Policy: Admins can update any item in their org
CREATE POLICY "Admins can update items"
  ON inventory_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = inventory_items.organization_id
    )
  );

-- Policy: Users can update assigned items (quantity only enforced at app level)
CREATE POLICY "Users can update assigned items"
  ON inventory_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM item_assignments
      WHERE item_id = inventory_items.id
      AND user_id = auth.uid()
      AND revoked_at IS NULL
    )
  );

-- Policy: Only admins can delete (soft delete)
CREATE POLICY "Admins can delete items"
  ON inventory_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = inventory_items.organization_id
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_inventory_items_timestamp
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE inventory_items IS 'Inventory items with dynamic custom fields';
