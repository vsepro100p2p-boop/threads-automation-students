/*
  # Add Time Intervals, Alternating Mode, and Account Folders

  1. AI Autoposting Enhancements
    - Add `start_hour` (integer 0-23) - start of posting window
    - Add `end_hour` (integer 0-23) - end of posting window
    - Add `posting_mode` (text) - 'creative', 'facts', or 'alternating'
    - Add `last_post_was_template` (boolean) - for alternating mode tracking

  2. New Table: account_folders
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `name` (text) - folder name
    - `color` (text) - folder color for UI
    - `created_at` (timestamp)

  3. Threads Accounts Update
    - Add `folder_id` (uuid, nullable) - references account_folders

  4. Security
    - Enable RLS on account_folders
    - Add policies for authenticated users
*/

-- Add time interval and alternating mode to ai_autoposting_schedules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'start_hour'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN start_hour integer DEFAULT 0 CHECK (start_hour >= 0 AND start_hour <= 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'end_hour'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN end_hour integer DEFAULT 23 CHECK (end_hour >= 0 AND end_hour <= 23);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'posting_mode'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN posting_mode text DEFAULT 'creative' CHECK (posting_mode IN ('creative', 'facts', 'alternating'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'last_post_was_template'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN last_post_was_template boolean DEFAULT false;
  END IF;
END $$;

-- Create account_folders table
CREATE TABLE IF NOT EXISTS account_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);

-- Add folder_id to threads_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'threads_accounts' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE threads_accounts ADD COLUMN folder_id uuid REFERENCES account_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Enable RLS on account_folders
ALTER TABLE account_folders ENABLE ROW LEVEL SECURITY;

-- Policies for account_folders
CREATE POLICY "Users can view own folders"
  ON account_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own folders"
  ON account_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own folders"
  ON account_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own folders"
  ON account_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);