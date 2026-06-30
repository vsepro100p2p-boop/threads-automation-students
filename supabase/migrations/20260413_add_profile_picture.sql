-- Add profile_picture_url column to threads_accounts
ALTER TABLE threads_accounts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
