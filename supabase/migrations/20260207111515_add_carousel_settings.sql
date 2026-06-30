/*
  # Add carousel settings table

  1. New Tables
    - `carousel_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users, unique)
      - `display_name` (text) - Name shown on carousel slides
      - `handle` (text) - Username/handle shown on slides
      - `custom_cta_text` (text) - Saved custom CTA text for carousel final slide
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `carousel_settings`
    - Users can only read/write their own settings
*/

CREATE TABLE IF NOT EXISTS carousel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  display_name text NOT NULL DEFAULT '',
  handle text NOT NULL DEFAULT '',
  custom_cta_text text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE carousel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own carousel settings"
  ON carousel_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own carousel settings"
  ON carousel_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own carousel settings"
  ON carousel_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
