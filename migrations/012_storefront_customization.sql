-- Storefront Customization Updates
ALTER TABLE events ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS description_html TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#000000';
ALTER TABLE events ADD COLUMN IF NOT EXISTS layout_config JSONB DEFAULT '{"order": ["hero", "title", "details", "about", "gallery", "organizer"], "hidden": []}';
