-- Fix profiles insert policy to allow insertion during signup
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Fix ai_settings insert policy to allow insertion during signup
DROP POLICY IF EXISTS "Users can insert own ai settings" ON ai_settings;
CREATE POLICY "Users can insert own ai settings"
  ON ai_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
