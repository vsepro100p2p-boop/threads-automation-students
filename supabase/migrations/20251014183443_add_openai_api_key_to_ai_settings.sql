/*
  # Add OpenAI API Key to AI Settings

  1. Changes
    - Add `openai_api_key` column to `ai_settings` table
    - This allows users to use their own OpenAI API key for real AI generation
  
  2. Security
    - Column is only accessible by the user who owns it via existing RLS policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'openai_api_key'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN openai_api_key TEXT DEFAULT '';
  END IF;
END $$;