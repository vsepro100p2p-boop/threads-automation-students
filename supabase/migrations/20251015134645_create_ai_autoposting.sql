/*
  # Create AI Autoposting System

  1. New Tables
    - `ai_autoposting_schedules`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `threads_account_id` (uuid, references threads_accounts)
      - `template_id` (uuid, references thread_templates)
      - `frequency_minutes` (integer) - Interval between posts
      - `is_enabled` (boolean) - Whether schedule is active
      - `next_post_at` (timestamptz) - When next post should be generated
      - `last_post_at` (timestamptz) - When last post was published
      - `total_posts_generated` (integer) - Counter of generated posts
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `ai_autoposting_schedules` table
    - Add policies for authenticated users to manage their own schedules
*/

CREATE TABLE IF NOT EXISTS ai_autoposting_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  threads_account_id uuid REFERENCES threads_accounts(id) ON DELETE CASCADE NOT NULL,
  template_id uuid REFERENCES thread_templates(id) ON DELETE CASCADE NOT NULL,
  frequency_minutes integer NOT NULL DEFAULT 60,
  is_enabled boolean DEFAULT true,
  next_post_at timestamptz,
  last_post_at timestamptz,
  total_posts_generated integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_autoposting_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI autoposting schedules"
  ON ai_autoposting_schedules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own AI autoposting schedules"
  ON ai_autoposting_schedules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI autoposting schedules"
  ON ai_autoposting_schedules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own AI autoposting schedules"
  ON ai_autoposting_schedules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);