/*
  # Add Meta App Credentials to Threads Accounts

  1. Changes
    - Add `app_id` column to store Meta/Threads App ID
    - Add `app_secret` column to store Meta/Threads App Secret (client_secret)
  
  2. Notes
    - These fields are required for each user to use their own Meta app
    - App credentials are needed for exchanging short-lived tokens to long-lived tokens
    - Existing accounts will have NULL values initially and will need to be updated by users
*/

-- Add app_id and app_secret columns to threads_accounts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'threads_accounts' AND column_name = 'app_id'
  ) THEN
    ALTER TABLE threads_accounts ADD COLUMN app_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'threads_accounts' AND column_name = 'app_secret'
  ) THEN
    ALTER TABLE threads_accounts ADD COLUMN app_secret text;
  END IF;
END $$;