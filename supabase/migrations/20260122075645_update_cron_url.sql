/*
  # Update CRON Job (no-op under Vault-based setup)

  Originally this migration re-pointed the CRON job to a hardcoded project URL
  to fix a typo left over from a project migration. Under the Vault-based setup
  (see 20251014161826_setup_cron_automation.sql) the URL and service_role key are
  read from Supabase Vault at run time, so there is no hardcoded URL to fix and
  no secret to commit.

  This migration is intentionally kept as a no-op so the migration history /
  ordering stays intact for anyone who already applied earlier versions. Fresh
  installs can ignore it.

  To (re)configure the job, set the Vault secrets `project_url` and
  `service_role_key` and re-run the cron.schedule from the setup migration.
  See SETUP.md.
*/

-- No-op: cron job is configured in 20251014161826_setup_cron_automation.sql
SELECT 1;
