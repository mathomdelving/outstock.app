-- Migration: 008_locations
-- Description: Persistent locations and location managers

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for locations
CREATE INDEX IF NOT EXISTS idx_locations_org ON locations(organization_id);
CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(organization_id, name);

-- Location managers table (links users to locations they manage)
CREATE TABLE IF NOT EXISTS location_managers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE -- NULL means still active
);

-- Indexes for location_managers
CREATE INDEX IF NOT EXISTS idx_location_managers_location ON location_managers(location_id);
CREATE INDEX IF NOT EXISTS idx_location_managers_user ON location_managers(user_id);
CREATE INDEX IF NOT EXISTS idx_location_managers_active ON location_managers(user_id) WHERE revoked_at IS NULL;

-- Add location_id to item_assignments (items can be assigned to locations)
ALTER TABLE item_assignments
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id) ON DELETE CASCADE;

-- Make user_id nullable in item_assignments (can be user OR location)
ALTER TABLE item_assignments
  ALTER COLUMN user_id DROP NOT NULL;

-- Add constraint: either user_id or location_id must be set (but not both)
ALTER TABLE item_assignments
  DROP CONSTRAINT IF EXISTS check_user_or_location;
ALTER TABLE item_assignments
  ADD CONSTRAINT check_user_or_location
  CHECK (
    (user_id IS NOT NULL AND location_id IS NULL) OR
    (user_id IS NULL AND location_id IS NOT NULL)
  );

-- Enable RLS on new tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_managers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for locations

-- Admins can see all locations in their org
CREATE POLICY "Admins can view org locations"
  ON locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = locations.organization_id
    )
  );

-- Users can see locations they manage
CREATE POLICY "Users can view managed locations"
  ON locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM location_managers
      WHERE location_id = locations.id
      AND user_id = auth.uid()
      AND revoked_at IS NULL
    )
  );

-- Only admins can create locations
CREATE POLICY "Admins can create locations"
  ON locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = locations.organization_id
    )
  );

-- Only admins can update locations
CREATE POLICY "Admins can update locations"
  ON locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = locations.organization_id
    )
  );

-- Only admins can delete locations
CREATE POLICY "Admins can delete locations"
  ON locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
      AND organization_id = locations.organization_id
    )
  );

-- RLS Policies for location_managers

-- Users can see their own manager assignments
CREATE POLICY "Users can view own manager assignments"
  ON location_managers FOR SELECT
  USING (user_id = auth.uid());

-- Admins can see all manager assignments in their org
CREATE POLICY "Admins can view org manager assignments"
  ON location_managers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN locations l ON l.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND l.id = location_managers.location_id
    )
  );

-- Only admins can create manager assignments
CREATE POLICY "Admins can create manager assignments"
  ON location_managers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN locations l ON l.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND l.id = location_managers.location_id
    )
  );

-- Only admins can update manager assignments
CREATE POLICY "Admins can update manager assignments"
  ON location_managers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN locations l ON l.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND l.id = location_managers.location_id
    )
  );

-- Only admins can delete manager assignments
CREATE POLICY "Admins can delete manager assignments"
  ON location_managers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN locations l ON l.organization_id = up.organization_id
      WHERE up.id = auth.uid() AND up.role = 'admin'
      AND l.id = location_managers.location_id
    )
  );

-- Trigger for updated_at on locations
CREATE TRIGGER update_locations_timestamp
  BEFORE UPDATE ON locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE locations IS 'Persistent location entities for item distribution';
COMMENT ON TABLE location_managers IS 'Links users to locations they manage';
