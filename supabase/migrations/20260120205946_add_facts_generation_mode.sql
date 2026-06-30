/*
  # Add Facts Generation Mode

  1. Changes
    - Add new generation type 'facts_with_intro' to ai_autoposting_schedules
    - Add 'intro_text' column to store the introductory text (e.g., "Я клинический психолог...")
    - The system will generate posts in format: [intro_text] + "Факт [1-1000]:" + [AI-generated fact]
  
  2. Security
    - No RLS changes needed, existing policies apply
*/

-- Add intro_text column for storing the introductory part
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'intro_text'
  ) THEN
    ALTER TABLE ai_autoposting_schedules 
    ADD COLUMN intro_text text;
  END IF;
END $$;

-- Add generation_mode column to specify the type of AI generation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'generation_mode'
  ) THEN
    ALTER TABLE ai_autoposting_schedules 
    ADD COLUMN generation_mode text DEFAULT 'creative' CHECK (generation_mode IN ('creative', 'facts_with_intro'));
  END IF;
END $$;