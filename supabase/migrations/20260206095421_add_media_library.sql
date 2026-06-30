/*
  # Media Library Feature

  1. New Tables
    - `media_library`
      - `id` (uuid, primary key) - Unique identifier for media item
      - `user_id` (uuid, references auth.users) - Owner of the media
      - `name` (text) - Display name of the file
      - `file_path` (text) - Path in storage bucket
      - `public_url` (text) - Public URL for the media
      - `file_size` (bigint) - File size in bytes
      - `mime_type` (text) - MIME type of the file
      - `width` (integer) - Image width in pixels (optional)
      - `height` (integer) - Image height in pixels (optional)
      - `folder` (text) - Logical folder for organization
      - `created_at` (timestamptz) - When the media was uploaded
      - `updated_at` (timestamptz) - Last modification time

  2. Security
    - Enable RLS on `media_library` table
    - Add policies for authenticated users to manage their own media

  3. Indexes
    - Index on user_id for faster lookups
    - Index on folder for filtering
*/

CREATE TABLE IF NOT EXISTS media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  public_url text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  width integer,
  height integer,
  folder text DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media"
  ON media_library FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media"
  ON media_library FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media"
  ON media_library FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media"
  ON media_library FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_media_library_user_id ON media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_media_library_folder ON media_library(folder);
CREATE INDEX IF NOT EXISTS idx_media_library_created_at ON media_library(created_at DESC);
