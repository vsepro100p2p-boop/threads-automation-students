/*
  # Add Template Folders and Time Intervals for Template Schedules

  1. New Table: template_folders
    - `id` (uuid, primary key)
    - `user_id` (uuid, references auth.users)
    - `name` (text) - folder name
    - `color` (text) - folder color for UI (hex code)
    - `created_at` (timestamp)

  2. Thread Templates Update
    - Add `folder_id` (uuid, nullable) - references template_folders

  3. Template Schedules Update
    - Add `start_hour` (integer 0-23, nullable) - start of posting window
    - Add `end_hour` (integer 0-23, nullable) - end of posting window
    - NULL values mean 24/7 operation

  4. Security
    - Enable RLS on template_folders
    - Add policies for authenticated users to manage their own folders

  Important Notes:
  - Folders are optional (folder_id can be NULL)
  - Time intervals are optional (NULL = 24/7)
  - Users can organize templates into folders for better management
*/

-- Create template_folders table
CREATE TABLE IF NOT EXISTS template_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);

-- Add folder_id to thread_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'thread_templates' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE thread_templates ADD COLUMN folder_id uuid REFERENCES template_folders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add time intervals to template_schedules
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_schedules' AND column_name = 'start_hour'
  ) THEN
    ALTER TABLE template_schedules ADD COLUMN start_hour integer CHECK (start_hour IS NULL OR (start_hour >= 0 AND start_hour <= 23));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_schedules' AND column_name = 'end_hour'
  ) THEN
    ALTER TABLE template_schedules ADD COLUMN end_hour integer CHECK (end_hour IS NULL OR (end_hour >= 0 AND end_hour <= 23));
  END IF;
END $$;

-- Enable RLS on template_folders
ALTER TABLE template_folders ENABLE ROW LEVEL SECURITY;

-- Policies for template_folders
CREATE POLICY "Users can view own template folders"
  ON template_folders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own template folders"
  ON template_folders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own template folders"
  ON template_folders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own template folders"
  ON template_folders FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_template_folders_user_id ON template_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_templates_folder ON thread_templates(folder_id);

-- Add helpful comments
COMMENT ON TABLE template_folders IS 'Folders for organizing thread templates';
COMMENT ON COLUMN thread_templates.folder_id IS 'Optional folder for organizing templates';
COMMENT ON COLUMN template_schedules.start_hour IS 'Start hour for posting window (0-23), NULL means always active';
COMMENT ON COLUMN template_schedules.end_hour IS 'End hour for posting window (0-23), NULL means always active';