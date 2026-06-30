/*
  # Add Time Intervals to Batch Publishes

  1. Batch Publishes Update
    - Add `start_hour` (integer 0-23, nullable) - start of publishing window
    - Add `end_hour` (integer 0-23, nullable) - end of publishing window
    - NULL values mean 24/7 operation (publish at any time)

  Important Notes:
  - Time intervals are optional (NULL = 24/7)
  - When set, batch publishing will only proceed during specified hours
  - Helps simulate human posting patterns by limiting activity to certain hours
*/

-- Add time intervals to batch_publishes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_publishes' AND column_name = 'start_hour'
  ) THEN
    ALTER TABLE batch_publishes ADD COLUMN start_hour integer CHECK (start_hour IS NULL OR (start_hour >= 0 AND start_hour <= 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'batch_publishes' AND column_name = 'end_hour'
  ) THEN
    ALTER TABLE batch_publishes ADD COLUMN end_hour integer CHECK (end_hour IS NULL OR (end_hour >= 0 AND end_hour <= 23));
  END IF;
END $$;

-- Add helpful comments
COMMENT ON COLUMN batch_publishes.start_hour IS 'Start hour for publishing window (0-23), NULL means always active';
COMMENT ON COLUMN batch_publishes.end_hour IS 'End hour for publishing window (0-23), NULL means always active';