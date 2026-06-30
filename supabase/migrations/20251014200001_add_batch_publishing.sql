/*
  # Add Batch Publishing System

  1. New Tables
    - `batch_publishes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `account_id` (uuid, references threads_accounts)
      - `template_ids` (uuid[], array of template IDs to publish)
      - `interval_minutes` (integer, minutes between each post)
      - `status` (text, 'pending'|'in_progress'|'completed'|'failed')
      - `current_index` (integer, which template is being published)
      - `next_publish_at` (timestamptz, when to publish next template)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Changes
    - Remove schedule-related columns from templates table
    - Templates become simple content templates without scheduling

  3. Security
    - Enable RLS on `batch_publishes` table
    - Add policies for authenticated users to manage their own batches
*/

-- Create batch_publishes table
CREATE TABLE IF NOT EXISTS batch_publishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES threads_accounts(id) ON DELETE CASCADE NOT NULL,
  template_ids uuid[] NOT NULL,
  interval_minutes integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  current_index integer NOT NULL DEFAULT 0,
  next_publish_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE batch_publishes ENABLE ROW LEVEL SECURITY;

-- Policies for batch_publishes
CREATE POLICY "Users can view own batches"
  ON batch_publishes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own batches"
  ON batch_publishes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own batches"
  ON batch_publishes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own batches"
  ON batch_publishes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Drop schedule-related columns from templates (if they exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'schedule_enabled'
  ) THEN
    ALTER TABLE templates DROP COLUMN schedule_enabled;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'schedule_time'
  ) THEN
    ALTER TABLE templates DROP COLUMN schedule_time;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'schedule_days'
  ) THEN
    ALTER TABLE templates DROP COLUMN schedule_days;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'next_scheduled_at'
  ) THEN
    ALTER TABLE templates DROP COLUMN next_scheduled_at;
  END IF;
END $$;

-- Index for processing batches
CREATE INDEX IF NOT EXISTS idx_batch_publishes_next_publish 
  ON batch_publishes(next_publish_at) 
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_batch_publishes_user 
  ON batch_publishes(user_id, created_at DESC);