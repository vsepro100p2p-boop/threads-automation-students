/*
  # Threads Automation Platform Schema

  ## Overview
  Complete database schema for AI-powered Threads.net automation platform

  ## New Tables
  
  ### `profiles`
  User profile and account settings
  - `id` (uuid, FK to auth.users)
  - `email` (text)
  - `full_name` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `threads_accounts`
  Connected Threads accounts via Meta API
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to profiles)
  - `threads_user_id` (text) - Meta Threads user ID
  - `username` (text)
  - `access_token` (text, encrypted)
  - `token_expires_at` (timestamptz)
  - `is_active` (boolean)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `ai_settings`
  AI configuration for content generation
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to profiles)
  - `ai_provider` (text) - openai, anthropic, etc.
  - `model_name` (text)
  - `temperature` (numeric)
  - `tone` (text) - casual, professional, funny, etc.
  - `topics` (jsonb) - array of topics
  - `language` (text)
  - `custom_instructions` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `post_schedules`
  Automated posting schedules
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to profiles)
  - `threads_account_id` (uuid, FK to threads_accounts)
  - `is_enabled` (boolean)
  - `frequency_minutes` (integer) - posting interval
  - `next_post_at` (timestamptz)
  - `last_post_at` (timestamptz)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `posts`
  Generated and published posts history
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to profiles)
  - `threads_account_id` (uuid, FK to threads_accounts)
  - `content` (text)
  - `status` (text) - draft, scheduled, published, failed
  - `threads_post_id` (text) - ID from Threads API
  - `threads_post_url` (text)
  - `generated_by_ai` (boolean)
  - `scheduled_for` (timestamptz)
  - `published_at` (timestamptz)
  - `error_message` (text)
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Users can only access their own data
  - Authenticated access required for all operations
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create threads_accounts table
CREATE TABLE IF NOT EXISTS threads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  threads_user_id text NOT NULL,
  username text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, threads_user_id)
);

ALTER TABLE threads_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own threads accounts"
  ON threads_accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own threads accounts"
  ON threads_accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own threads accounts"
  ON threads_accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own threads accounts"
  ON threads_accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create ai_settings table
CREATE TABLE IF NOT EXISTS ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ai_provider text DEFAULT 'openai',
  model_name text DEFAULT 'gpt-4',
  temperature numeric DEFAULT 0.7,
  tone text DEFAULT 'casual',
  topics jsonb DEFAULT '[]'::jsonb,
  language text DEFAULT 'en',
  custom_instructions text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai settings"
  ON ai_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai settings"
  ON ai_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai settings"
  ON ai_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai settings"
  ON ai_settings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create post_schedules table
CREATE TABLE IF NOT EXISTS post_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  threads_account_id uuid NOT NULL REFERENCES threads_accounts(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  frequency_minutes integer DEFAULT 120,
  next_post_at timestamptz DEFAULT now(),
  last_post_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(threads_account_id)
);

ALTER TABLE post_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedules"
  ON post_schedules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schedules"
  ON post_schedules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedules"
  ON post_schedules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedules"
  ON post_schedules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create posts table
CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  threads_account_id uuid NOT NULL REFERENCES threads_accounts(id) ON DELETE CASCADE,
  content text NOT NULL,
  status text DEFAULT 'draft',
  threads_post_id text,
  threads_post_url text,
  generated_by_ai boolean DEFAULT true,
  scheduled_for timestamptz,
  published_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own posts"
  ON posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_threads_accounts_user_id ON threads_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_post_schedules_user_id ON post_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_post_schedules_next_post ON post_schedules(next_post_at) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);