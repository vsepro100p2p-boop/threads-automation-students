/*
  # Add Multiple Templates Support to AI Autoposting

  1. Changes
    - Drop existing template_id column
    - Add template_ids array column to store multiple template references
    - Add current_template_index to track which template to use next
  
  2. Security
    - No RLS changes needed (already configured)
  
  3. Notes
    - Users can now select multiple templates for AI autoposting
    - System will rotate through templates in order for each post
    - Index resets to 0 when reaching the end of the array
*/

-- Add new columns for multiple templates
ALTER TABLE ai_autoposting_schedules 
  ADD COLUMN IF NOT EXISTS template_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_template_index integer DEFAULT 0;

-- Migrate existing data: move template_id to template_ids array
UPDATE ai_autoposting_schedules 
SET template_ids = ARRAY[template_id]
WHERE template_id IS NOT NULL;

-- Drop the old single template_id column
ALTER TABLE ai_autoposting_schedules DROP COLUMN IF EXISTS template_id;