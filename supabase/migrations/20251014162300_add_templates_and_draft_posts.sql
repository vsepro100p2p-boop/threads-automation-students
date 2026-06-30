/*
  # Add Thread Templates and Draft Posts System

  1. New Tables
    - `thread_templates`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `threads_account_id` (uuid, foreign key to threads_accounts)
      - `name` (text) - Template name for user reference
      - `content` (jsonb) - Array of thread posts with placeholders
      - `frequency_days` (integer) - How often to repeat (in days)
      - `last_used_at` (timestamptz) - Last time this template was used
      - `next_use_at` (timestamptz) - Next scheduled use
      - `is_active` (boolean) - Whether template is enabled
      - `use_count` (integer) - How many times template has been used
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `draft_posts`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `threads_account_id` (uuid, foreign key to threads_accounts)
      - `content` (text) - First post content for preview
      - `thread_content` (jsonb) - Full thread content array
      - `is_thread` (boolean) - Whether this is a thread
      - `scheduled_for` (timestamptz) - When to publish (NULL = not scheduled)
      - `generated_by_ai` (boolean) - Whether AI generated this
      - `template_id` (uuid, nullable) - Reference to template if used
      - `status` (text) - 'draft', 'scheduled', 'published', 'cancelled'
      - `preview_generated_at` (timestamptz) - When preview was created
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on both tables
    - Users can only access their own templates and drafts
    - Separate policies for SELECT, INSERT, UPDATE, DELETE
  
  3. Indexes
    - Index on user_id for fast filtering
    - Index on scheduled_for for calendar queries
    - Index on next_use_at for template scheduling
  
  4. Features Enabled
    - Custom thread templates with placeholders like {topic}, {date}, etc.
    - Recurring templates with frequency control
    - AI-generated draft previews
    - Calendar-based scheduling
    - Draft management (edit, reschedule, delete)
*/

-- Create thread_templates table
CREATE TABLE IF NOT EXISTS thread_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  threads_account_id uuid NOT NULL REFERENCES threads_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  frequency_days integer DEFAULT 7,
  last_used_at timestamptz,
  next_use_at timestamptz,
  is_active boolean DEFAULT true,
  use_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_frequency CHECK (frequency_days > 0),
  CONSTRAINT valid_content CHECK (jsonb_array_length(content) > 0)
);

-- Create draft_posts table
CREATE TABLE IF NOT EXISTS draft_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  threads_account_id uuid NOT NULL REFERENCES threads_accounts(id) ON DELETE CASCADE,
  content text NOT NULL,
  thread_content jsonb DEFAULT '[]'::jsonb,
  is_thread boolean DEFAULT false,
  scheduled_for timestamptz,
  generated_by_ai boolean DEFAULT false,
  template_id uuid REFERENCES thread_templates(id) ON DELETE SET NULL,
  status text DEFAULT 'draft',
  preview_generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'scheduled', 'published', 'cancelled'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_thread_templates_user_id ON thread_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_templates_next_use ON thread_templates(next_use_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_thread_templates_account ON thread_templates(threads_account_id);

CREATE INDEX IF NOT EXISTS idx_draft_posts_user_id ON draft_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_posts_scheduled ON draft_posts(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_draft_posts_status ON draft_posts(status);
CREATE INDEX IF NOT EXISTS idx_draft_posts_account ON draft_posts(threads_account_id);

-- Enable RLS
ALTER TABLE thread_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_posts ENABLE ROW LEVEL SECURITY;

-- Policies for thread_templates
CREATE POLICY "Users can view own templates"
  ON thread_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON thread_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON thread_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON thread_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for draft_posts
CREATE POLICY "Users can view own drafts"
  ON draft_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own drafts"
  ON draft_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON draft_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own drafts"
  ON draft_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_thread_templates_updated_at ON thread_templates;
CREATE TRIGGER update_thread_templates_updated_at
  BEFORE UPDATE ON thread_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_draft_posts_updated_at ON draft_posts;
CREATE TRIGGER update_draft_posts_updated_at
  BEFORE UPDATE ON draft_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE thread_templates IS 'Reusable thread templates that can be scheduled to post periodically';
COMMENT ON TABLE draft_posts IS 'AI-generated or manual draft posts with calendar scheduling';
COMMENT ON COLUMN thread_templates.content IS 'Array of strings with optional placeholders like {topic}, {date}';
COMMENT ON COLUMN thread_templates.frequency_days IS 'How often to automatically reuse this template (in days)';
COMMENT ON COLUMN draft_posts.scheduled_for IS 'Specific date/time when post should be published';
