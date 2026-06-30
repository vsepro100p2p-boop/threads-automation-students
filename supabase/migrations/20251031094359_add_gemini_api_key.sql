/*
  # Add Gemini API Key

  1. Changes
    - Add `gemini_api_key` column to `ai_settings` table to store Google Gemini API key
  
  2. Security
    - Column is encrypted at rest by default
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_settings' AND column_name = 'gemini_api_key'
  ) THEN
    ALTER TABLE ai_settings ADD COLUMN gemini_api_key text;
  END IF;
END $$;