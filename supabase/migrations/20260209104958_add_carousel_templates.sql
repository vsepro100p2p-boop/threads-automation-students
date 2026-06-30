/*
  # Create carousel_templates table

  1. New Tables
    - `carousel_templates`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - template name
      - `content` (jsonb) - full carousel JSON (first_page_title, content_pages, call_to_action_page)
      - `design` (text) - design style (notes, journal, influencer, notes-dark)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `carousel_templates` table
    - Add policies for authenticated users to manage their own templates
*/

CREATE TABLE IF NOT EXISTS carousel_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL DEFAULT '',
  content jsonb NOT NULL,
  design text NOT NULL DEFAULT 'influencer',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE carousel_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own carousel templates"
  ON carousel_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own carousel templates"
  ON carousel_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own carousel templates"
  ON carousel_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own carousel templates"
  ON carousel_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
