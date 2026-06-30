/*
  # Add Thread Support

  ## Changes
  
  ### Update `ai_settings` table
  - Add `reference_text` (text) - Example text for AI to match style
  - Add `thread_count` (integer) - Number of posts in thread (1-10)

  ### Update `posts` table
  - Add `thread_content` (jsonb) - Array of thread posts
  - Add `is_thread` (boolean) - Whether this is a thread
  - Add `thread_position` (integer) - Position in thread (for individual posts)

  ## Notes
  All changes use IF NOT EXISTS to be idempotent
*/

-- Add columns to ai_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'reference_text'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN reference_text text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'thread_count'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN thread_count integer DEFAULT 1;
  END IF;
END $$;

-- Add columns to posts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'thread_content'
  ) THEN
    ALTER TABLE posts ADD COLUMN thread_content jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'is_thread'
  ) THEN
    ALTER TABLE posts ADD COLUMN is_thread boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'thread_position'
  ) THEN
    ALTER TABLE posts ADD COLUMN thread_position integer DEFAULT 0;
  END IF;
END $$;