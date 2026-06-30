/*
  # Add Claude API Key to AI Settings

  1. Changes
    - Add `claude_api_key` column to `ai_settings` table
  
  2. Notes
    - Encrypted text field for storing Claude API key
    - Optional field, can be null
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'claude_api_key'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN claude_api_key text;
  END IF;
END $$;