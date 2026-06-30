/*
  # Add 'rewrite' to generation_mode CHECK constraint

  The existing CHECK constraint on ai_autoposting_schedules.generation_mode 
  only allows 'creative' and 'facts_with_intro'. 
  This migration adds 'rewrite' as a valid option.
*/

-- Drop the old CHECK constraint and add a new one with 'rewrite' included
ALTER TABLE ai_autoposting_schedules 
  DROP CONSTRAINT IF EXISTS ai_autoposting_schedules_generation_mode_check;

ALTER TABLE ai_autoposting_schedules 
  ADD CONSTRAINT ai_autoposting_schedules_generation_mode_check 
  CHECK (generation_mode IN ('creative', 'facts_with_intro', 'rewrite'));
