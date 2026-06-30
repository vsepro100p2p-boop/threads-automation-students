/*
  # Add Account Folders and Timezone Support

  1. New Table: account_folders
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `name` (text) - folder name
    - `color` (text) - folder color for UI (hex code)
    - `created_at` (timestamp)

  2. Threads Accounts Update
    - Add `folder_id` (uuid, nullable) - references account_folders

  3. Profiles Update
    - Add `timezone` (text, default 'UTC') - user's timezone for scheduling

  4. AI Autoposting Schedules Update
    - Add `start_hour` (integer 0-23, nullable) - start of posting window
    - Add `end_hour` (integer 0-23, nullable) - end of posting window

  5. Security
    - Enable RLS on account_folders
    - Add policies for authenticated users to manage their own folders

  Important Notes:
  - Folders are optional (folder_id can be NULL)
  - Time intervals are optional (NULL = 24/7)
  - Timezone is used for all time-based operations
  - Users can organize accounts into folders for better management
*/

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

-- Add timezone to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'timezone'
  ) THEN
    ALTER TABLE profiles ADD COLUMN timezone text DEFAULT 'UTC';
  END IF;
END $$;

-- Add time intervals to ai_autoposting_schedules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'start_hour'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN start_hour integer CHECK (start_hour IS NULL OR (start_hour >= 0 AND start_hour <= 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'end_hour'
  ) THEN
    ALTER TABLE ai_autoposting_schedules ADD COLUMN end_hour integer CHECK (end_hour IS NULL OR (end_hour >= 0 AND end_hour <= 23));
  END IF;
END $$;

-- Enable RLS on account_folders
ALTER TABLE account_folders ENABLE ROW LEVEL SECURITY;

-- Policies for account_folders
CREATE POLICY "Users can view own account folders"
  ON account_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own account folders"
  ON account_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own account folders"
  ON account_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own account folders"
  ON account_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_account_folders_user_id ON account_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_accounts_folder ON threads_accounts(folder_id);

-- Add helpful comments
COMMENT ON TABLE account_folders IS 'Folders for organizing Threads accounts';
COMMENT ON COLUMN threads_accounts.folder_id IS 'Optional folder for organizing accounts';
COMMENT ON COLUMN profiles.timezone IS 'User timezone for scheduling operations (e.g., America/New_York, Europe/London, UTC)';
COMMENT ON COLUMN ai_autoposting_schedules.start_hour IS 'Start hour for posting window in user timezone (0-23), NULL means always active';
COMMENT ON COLUMN ai_autoposting_schedules.end_hour IS 'End hour for posting window in user timezone (0-23), NULL means always active';
