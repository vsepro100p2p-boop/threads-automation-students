-- Align status CHECK constraints with process-schedules publishing lifecycle.

ALTER TABLE draft_posts
  DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE draft_posts
  ADD CONSTRAINT valid_status
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'));

ALTER TABLE template_schedules
  DROP CONSTRAINT IF EXISTS template_schedules_status_check;

ALTER TABLE template_schedules
  ADD CONSTRAINT template_schedules_status_check
  CHECK (status IN ('pending', 'publishing', 'published', 'failed', 'cancelled'));
