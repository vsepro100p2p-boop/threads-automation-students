/*
  # Add Meta Apps Management

  1. New Tables
    - `meta_apps`
      - `id` (uuid, primary key) - Unique identifier for the app
      - `user_id` (uuid, foreign key) - References auth.users
      - `name` (text) - Friendly name for the app (e.g., "Production App", "Test App")
      - `app_id` (text) - Meta App ID
      - `app_secret` (text) - Meta App Secret (encrypted)
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `meta_apps` table
    - Add policy for authenticated users to manage their own Meta apps
    - Users can only see and manage their own apps

  3. Changes
    - Adds a centralized place to store Meta App credentials
    - Eliminates the need to enter App ID and Secret for each account
*/

CREATE TABLE IF NOT EXISTS meta_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  app_id text NOT NULL,
  app_secret text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE meta_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meta apps"
  ON meta_apps
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meta apps"
  ON meta_apps
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meta apps"
  ON meta_apps
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meta apps"
  ON meta_apps
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS meta_apps_user_id_idx ON meta_apps(user_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_meta_apps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_meta_apps_updated_at
  BEFORE UPDATE ON meta_apps
  FOR EACH ROW
  EXECUTE FUNCTION update_meta_apps_updated_at();