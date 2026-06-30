/*
  # Add AI-only Publishing Mode

  1. Changes
    - Add `ai_only_mode` boolean to `template_schedules` table
    - When true, system will alternate between template posts and AI-generated posts
  
  2. Notes
    - Default false for backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'template_schedules' AND column_name = 'ai_only_mode'
  ) THEN
    ALTER TABLE template_schedules ADD COLUMN ai_only_mode boolean DEFAULT false;
  END IF;
END $$;