/*
  # Add Grok (xAI) as an AI provider option; default provider -> DeepSeek

  1. Changes
    - `ai_settings.grok_api_key` (text) — ключ xAI Grok API
    - `ai_settings.grok_model` (text, default 'grok-4') — id модели Grok
      (настраивается; поставьте точный id из документации xAI)
    - Провайдер выбирается полем `ai_settings.ai_provider` ('deepseek' | 'grok').
    - Значение по умолчанию изменено на 'deepseek' (Gemini больше не используется
      в приложении — поле gemini_api_key остаётся в таблице, но не задействовано).

  2. Notes
    - Существующие строки с ai_provider = 'gemini' стоит перевести на 'deepseek'
      или 'grok' и задать соответствующий ключ (см. ниже).
*/

ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS grok_api_key text,
  ADD COLUMN IF NOT EXISTS grok_model text DEFAULT 'grok-4.3';

ALTER TABLE ai_settings
  ALTER COLUMN ai_provider SET DEFAULT 'deepseek';

-- Старое значение 'gemini' больше не поддерживается приложением.
-- Переводим такие строки на DeepSeek (ключ нужно будет задать в настройках).
UPDATE ai_settings SET ai_provider = 'deepseek' WHERE ai_provider = 'gemini';
