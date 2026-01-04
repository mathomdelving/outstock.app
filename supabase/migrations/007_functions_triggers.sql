-- Migration: 007_functions_triggers
-- Description: Helper functions and triggers

-- Function: Create default field definitions when org is created
CREATE OR REPLACE FUNCTION create_default_fields()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO field_definitions (organization_id, name, label, field_type, is_core, display_order)
  VALUES
    (NEW.id, 'name', 'Item Name', 'text', TRUE, 1),
    (NEW.id, 'sku', 'SKU', 'text', TRUE, 2),
    (NEW.id, 'category', 'Category', 'text', TRUE, 3),
    (NEW.id, 'quantity', 'Quantity', 'number', TRUE, 4);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_default_fields();

-- Function: Sync item quantity from location_history
CREATE OR REPLACE FUNCTION sync_item_quantity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_items
  SET quantity = NEW.quantity_after,
      updated_at = NOW()
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_quantity_on_location
  AFTER INSERT ON location_history
  FOR EACH ROW
  EXECUTE FUNCTION sync_item_quantity();

-- Function: Generate slug from name
CREATE OR REPLACE FUNCTION generate_slug(name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(REGEXP_REPLACE(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g'));
END;
$$ LANGUAGE plpgsql;

-- Function: Handle new user registration (create org if first user)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  -- Check if this is the first user (create organization)
  -- This is determined by checking metadata passed during signup
  org_name := NEW.raw_user_meta_data->>'organization_name';

  IF org_name IS NOT NULL THEN
    -- Create new organization
    org_slug := generate_slug(org_name) || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);

    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO org_id;

    -- Create user profile as admin (organization creator)
    INSERT INTO user_profiles (id, organization_id, email, display_name, role)
    VALUES (
      NEW.id,
      org_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      'admin'
    );
  ELSE
    -- User is joining existing org (via invite)
    org_id := (NEW.raw_user_meta_data->>'organization_id')::UUID;

    IF org_id IS NOT NULL THEN
      INSERT INTO user_profiles (id, organization_id, email, display_name, role)
      VALUES (
        NEW.id,
        org_id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'user'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to handle new user signups
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE item_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE location_history;

COMMENT ON FUNCTION handle_new_user() IS 'Handles new user registration, creating org if needed';
COMMENT ON FUNCTION sync_item_quantity() IS 'Syncs inventory quantity when location history is logged';
COMMENT ON FUNCTION create_default_fields() IS 'Creates default field definitions for new organizations';
