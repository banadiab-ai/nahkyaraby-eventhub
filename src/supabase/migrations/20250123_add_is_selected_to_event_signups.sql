-- Add is_selected column to event_signups table
-- This column tracks which staff members were selected/confirmed by admin for a closed event

ALTER TABLE event_signups 
ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster queries on selected staff
CREATE INDEX IF NOT EXISTS idx_event_signups_is_selected ON event_signups(event_id, is_selected);

-- Add comment to document the column
COMMENT ON COLUMN event_signups.is_selected IS 'Indicates whether the staff member was selected/confirmed by admin for a closed event';
