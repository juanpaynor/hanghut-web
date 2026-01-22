-- Add sales_end_datetime column to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS sales_end_datetime timestamp with time zone;

COMMENT ON COLUMN events.sales_end_datetime IS 'When ticket sales automatically close';
