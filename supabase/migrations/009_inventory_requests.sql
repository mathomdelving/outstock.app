-- Create inventory_requests table for location managers to request more inventory
CREATE TABLE IF NOT EXISTS inventory_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_requested INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  notes TEXT,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMP WITH TIME ZONE,
  response_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inventory_requests_org ON inventory_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_location ON inventory_requests(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_status ON inventory_requests(status);
CREATE INDEX IF NOT EXISTS idx_inventory_requests_requested_at ON inventory_requests(requested_at DESC);

-- RLS Policies (disabled for now, enable later)
-- ALTER TABLE inventory_requests ENABLE ROW LEVEL SECURITY;
