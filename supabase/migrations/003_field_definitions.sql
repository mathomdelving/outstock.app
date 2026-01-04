-- Migration: 003_field_definitions
-- Description: Dynamic field definitions per organization

CREATE TYPE field_type AS ENUM ('text', 'number', 'select', 'boolean', 'date');

CREATE TABLE IF NOT EXISTS field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type field_type NOT NULL DEFAULT 'text',
  options JSONB, -- For select type: ["Option 1", "Option 2"]
  is_required BOOLEAN DEFAULT FALSE,
  is_core BOOLEAN DEFAULT FALSE, -- Core fields cannot be deleted
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, name)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_field_definitions_org ON field_definitions(organization_id);

-- Enable RLS
ALTER TABLE field_definitions ENABLE ROW LEVEL SECURITY;

-- Policy: Users in org can read field definitions
CREATE POLICY "Org users can read fields"
  ON field_definitions FOR SELECT
  USING (
    organization_id = (
      SELECT organization_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Policy: Only admins can modify field definitions
CREATE POLICY "Admins can insert fields"
  ON field_definitions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = field_definitions.organization_id
    )
  );

CREATE POLICY "Admins can update fields"
  ON field_definitions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = field_definitions.organization_id
    )
  );

CREATE POLICY "Admins can delete non-core fields"
  ON field_definitions FOR DELETE
  USING (
    is_core = FALSE
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = field_definitions.organization_id
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_field_definitions_timestamp
  BEFORE UPDATE ON field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE field_definitions IS 'Dynamic field definitions configurable per organization';
