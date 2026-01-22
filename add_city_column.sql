-- Add city column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS city text;

COMMENT ON COLUMN events.city IS 'City extracted from Google Places address for filtering';

-- Index for faster filtering by city
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
