/*
  # Setup CRON Automation for Scheduled Posts

  1. Extensions
    - Enable `pg_cron` for task scheduling
    - Enable `pg_net` for HTTP requests to edge functions
  
  2. CRON Job Configuration
    - Job name: `process-scheduled-posts`
    - Schedule: Every minute (`* * * * *`)
    - Action: Calls `process-schedules` edge function
    - Authentication: Uses service role key
  
  3. Helper Functions
    - `get_cron_job_status()` - View CRON job status
    - `get_cron_job_runs()` - View recent job execution history
  
  4. How It Works
    - CRON runs every minute
    - Checks `post_schedules` table for due posts
    - Generates AI content if needed
    - Publishes to Threads
    - Updates `next_post_at` based on frequency
  
  5. Security
    - CRON runs with postgres user privileges
    - Edge function requires service role authentication
    - Users can only view their own schedules
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Remove existing job if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-scheduled-posts') THEN
    PERFORM cron.unschedule('process-scheduled-posts');
  END IF;
END $$;

-- Create CRON job that runs every minute.
--
-- IMPORTANT: project URL and service_role key are NOT hardcoded here. They are
-- read at run time from Supabase Vault, so every self-hosted copy uses its own
-- values and no secrets are committed to the repository.
--
-- Before automation works you MUST add two secrets to Vault (see SETUP.md):
--   project_url        e.g. https://YOUR-REF.supabase.co
--   service_role_key   your project's service_role key
--
-- Add them via SQL (Dashboard → SQL Editor):
--   select vault.create_secret('https://YOUR-REF.supabase.co', 'project_url');
--   select vault.create_secret('YOUR-SERVICE-ROLE-KEY',        'service_role_key');
SELECT cron.schedule(
  'process-scheduled-posts',  -- Job name
  '* * * * *',                 -- Every minute
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
           || '/functions/v1/process-schedules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Function to view CRON job status
CREATE OR REPLACE FUNCTION public.get_cron_job_status()
RETURNS TABLE (
  jobid bigint,
  schedule text,
  command text,
  active boolean,
  jobname text
) 
SECURITY DEFINER
SET search_path = extensions, public
LANGUAGE sql
AS $$
  SELECT 
    jobid,
    schedule,
    command,
    active,
    jobname
  FROM cron.job
  WHERE jobname = 'process-scheduled-posts';
$$;

-- Function to view recent CRON job runs
CREATE OR REPLACE FUNCTION public.get_cron_job_runs()
RETURNS TABLE (
  runid bigint,
  jobid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
) 
SECURITY DEFINER
SET search_path = extensions, public
LANGUAGE sql
AS $$
  SELECT 
    jr.runid,
    jr.jobid,
    jr.status,
    jr.return_message,
    jr.start_time,
    jr.end_time
  FROM cron.job_run_details jr
  JOIN cron.job j ON jr.jobid = j.jobid
  WHERE j.jobname = 'process-scheduled-posts'
  ORDER BY jr.start_time DESC
  LIMIT 20;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_runs() TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION public.get_cron_job_status() IS 'View the status and configuration of the automated post scheduling job';
COMMENT ON FUNCTION public.get_cron_job_runs() IS 'View the 20 most recent executions of the scheduling job';
