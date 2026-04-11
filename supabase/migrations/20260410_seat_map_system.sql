-- ============================================================================
-- SEAT MAP SYSTEM — Database Migration
-- ============================================================================
-- Run this in Supabase SQL editor (or via CLI migration)
-- Creates: venue_templates, template_sections, event_seat_maps,
--          event_sections, seats, seat_holds
-- Modifies: events (add seating_type, max_seats_per_order),
--           tickets (add seat_id)
-- ============================================================================

-- 1. Events table additions
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS seating_type text NOT NULL DEFAULT 'general_admission'
    CHECK (seating_type IN ('general_admission', 'assigned_seating')),
  ADD COLUMN IF NOT EXISTS max_seats_per_order int DEFAULT 10;

-- 2. Venue Template Library (admin-built)
CREATE TABLE IF NOT EXISTS venue_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  venue_name text NOT NULL,
  venue_address text,
  thumbnail_url text,
  canvas_data jsonb NOT NULL DEFAULT '{}',
  canvas_width int NOT NULL DEFAULT 1400,
  canvas_height int NOT NULL DEFAULT 900,
  total_capacity int,
  tags text[] DEFAULT '{}',
  is_published boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Template Sections (sections within a template)
CREATE TABLE IF NOT EXISTS template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES venue_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  polygon_points float[] NOT NULL,
  arc_config jsonb,
  row_count int NOT NULL DEFAULT 0,
  seats_per_row int NOT NULL DEFAULT 0,
  seat_orientation text DEFAULT 'straight'
    CHECK (seat_orientation IN ('straight', 'arc')),
  default_color text DEFAULT '#6366f1',
  section_type text DEFAULT 'general'
    CHECK (section_type IN ('vip', 'general', 'floor', 'box', 'balcony', 'standing')),
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. Event Seat Maps (per-event configuration)
CREATE TABLE IF NOT EXISTS event_seat_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE UNIQUE,
  template_id uuid REFERENCES venue_templates(id),
  canvas_data jsonb NOT NULL DEFAULT '{}',
  canvas_width int NOT NULL DEFAULT 1400,
  canvas_height int NOT NULL DEFAULT 900,
  pricing_mode text NOT NULL DEFAULT 'per_section'
    CHECK (pricing_mode IN ('per_section', 'per_seat')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 5. Event Sections (organizer's configured sections for an event)
CREATE TABLE IF NOT EXISTS event_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_map_id uuid NOT NULL REFERENCES event_seat_maps(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_section_id uuid REFERENCES template_sections(id),
  label text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  polygon_points float[] NOT NULL,
  arc_config jsonb,
  tier_id uuid REFERENCES ticket_tiers(id),
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 6. Individual Seats
CREATE TABLE IF NOT EXISTS seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES event_sections(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  row_label text NOT NULL,
  seat_number int NOT NULL,
  label text NOT NULL,
  x float NOT NULL,
  y float NOT NULL,
  custom_price numeric(10,2),
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'booked', 'disabled')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(section_id, row_label, seat_number)
);

CREATE INDEX IF NOT EXISTS idx_seats_event ON seats(event_id);
CREATE INDEX IF NOT EXISTS idx_seats_section ON seats(section_id);
CREATE INDEX IF NOT EXISTS idx_seats_status ON seats(event_id, status);

-- 7. Seat Holds (12-min temporary locks during checkout)
CREATE TABLE IF NOT EXISTS seat_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id uuid NOT NULL REFERENCES seats(id) ON DELETE CASCADE UNIQUE,
  session_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '12 minutes'),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seat_holds_expires ON seat_holds(expires_at);
CREATE INDEX IF NOT EXISTS idx_seat_holds_session ON seat_holds(session_id);

-- 8. Link tickets to seats
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS seat_id uuid REFERENCES seats(id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE venue_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_seat_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_holds ENABLE ROW LEVEL SECURITY;

-- Venue Templates: anyone can read published, admin can CRUD
CREATE POLICY "venue_templates_public_read" ON venue_templates
  FOR SELECT USING (is_published = true);

CREATE POLICY "venue_templates_admin_all" ON venue_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Template Sections: follows parent template access
CREATE POLICY "template_sections_public_read" ON template_sections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM venue_templates WHERE id = template_id AND is_published = true
    )
  );

CREATE POLICY "template_sections_admin_all" ON template_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Event Seat Maps: organizer CRUD own, public read
CREATE POLICY "event_seat_maps_public_read" ON event_seat_maps
  FOR SELECT USING (true);

CREATE POLICY "event_seat_maps_organizer_all" ON event_seat_maps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN partners p ON e.organizer_id = p.id
      WHERE e.id = event_id AND p.user_id = auth.uid()
    )
  );

-- Event Sections: organizer CRUD own, public read
CREATE POLICY "event_sections_public_read" ON event_sections
  FOR SELECT USING (true);

CREATE POLICY "event_sections_organizer_all" ON event_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN partners p ON e.organizer_id = p.id
      WHERE e.id = event_id AND p.user_id = auth.uid()
    )
  );

-- Seats: organizer CRUD own, public read
CREATE POLICY "seats_public_read" ON seats
  FOR SELECT USING (true);

CREATE POLICY "seats_organizer_all" ON seats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN partners p ON e.organizer_id = p.id
      WHERE e.id = event_id AND p.user_id = auth.uid()
    )
  );

-- Seat Holds: anyone can read/insert/delete
CREATE POLICY "seat_holds_read" ON seat_holds
  FOR SELECT USING (true);

CREATE POLICY "seat_holds_insert" ON seat_holds
  FOR INSERT WITH CHECK (true);

CREATE POLICY "seat_holds_delete" ON seat_holds
  FOR DELETE USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Cleanup expired holds (called lazily)
CREATE OR REPLACE FUNCTION cleanup_expired_seat_holds()
RETURNS void AS $$
BEGIN
  DELETE FROM seat_holds WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hold a seat atomically (returns true if held, false if already taken)
CREATE OR REPLACE FUNCTION hold_seat(
  p_seat_id uuid,
  p_session_id text,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_held boolean;
BEGIN
  -- Clean expired holds first
  DELETE FROM seat_holds WHERE expires_at < now();

  -- Check seat is available
  IF NOT EXISTS (
    SELECT 1 FROM seats WHERE id = p_seat_id AND status = 'available'
  ) THEN
    RETURN false;
  END IF;

  -- Try to insert hold (UNIQUE constraint prevents doubles)
  INSERT INTO seat_holds (seat_id, session_id, user_id)
  VALUES (p_seat_id, p_session_id, p_user_id)
  ON CONFLICT (seat_id) DO NOTHING;

  -- Check if WE got the hold
  SELECT EXISTS (
    SELECT 1 FROM seat_holds
    WHERE seat_id = p_seat_id AND session_id = p_session_id
  ) INTO v_held;

  RETURN v_held;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

