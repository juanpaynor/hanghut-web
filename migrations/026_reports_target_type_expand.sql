-- Migration: Expand reports target_type constraint to include 'post' and 'app'
-- The mobile team is currently mapping these to 'other' with metadata.original_target_type.
-- This lets them send the actual type directly and enables clean admin filtering.

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;

ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
    CHECK (target_type = ANY (ARRAY[
        'user'::text,
        'post'::text,
        'table'::text,
        'message'::text,
        'app'::text,
        'other'::text
    ]));
