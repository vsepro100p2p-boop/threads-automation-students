/*
  # Fix cascade delete - keep templates when account is deleted

  1. Changes
    - Change thread_templates foreign key to SET NULL instead of CASCADE
    - Change batch_publishes foreign key to CASCADE (they should be deleted)
    - Change posts foreign key to SET NULL (keep history)
    
  2. Security
    - No changes to RLS policies
*/

-- Drop existing foreign keys
ALTER TABLE thread_templates 
DROP CONSTRAINT IF EXISTS thread_templates_threads_account_id_fkey;

ALTER TABLE batch_publishes 
DROP CONSTRAINT IF EXISTS batch_publishes_account_id_fkey;

ALTER TABLE posts 
DROP CONSTRAINT IF EXISTS posts_threads_account_id_fkey;

-- Make threads_account_id nullable in templates (so it can be SET NULL)
ALTER TABLE thread_templates 
ALTER COLUMN threads_account_id DROP NOT NULL;

-- Make threads_account_id nullable in posts (keep history)
ALTER TABLE posts 
ALTER COLUMN threads_account_id DROP NOT NULL;

-- Recreate foreign keys with proper delete behavior
ALTER TABLE thread_templates 
ADD CONSTRAINT thread_templates_threads_account_id_fkey 
FOREIGN KEY (threads_account_id) 
REFERENCES threads_accounts(id) 
ON DELETE SET NULL;

ALTER TABLE batch_publishes 
ADD CONSTRAINT batch_publishes_account_id_fkey 
FOREIGN KEY (account_id) 
REFERENCES threads_accounts(id) 
ON DELETE CASCADE;

ALTER TABLE posts 
ADD CONSTRAINT posts_threads_account_id_fkey 
FOREIGN KEY (threads_account_id) 
REFERENCES threads_accounts(id) 
ON DELETE SET NULL;
