/*
  # Add DeepSeek as an AI provider option

  1. Changes
    - `ai_settings.deepseek_api_key` (text) — ключ DeepSeek API
    - `ai_settings.deepseek_model` (text, default 'deepseek-chat') — id модели DeepSeek
      (настраивается; поставьте точный id из документации DeepSeek)
    - Провайдер выбирается существующим полем `ai_settings.ai_provider`
      ('gemini' | 'deepseek'). Значение по умолчанию для новых строк — 'gemini',
      чтобы сохранить текущее поведение.

  2. Notes
    - Ключи доступны только бэкенд-функциям через service_role (RLS уже включён).
    - Существующие пользователи продолжают работать на Gemini до явного переключения.
*/

ALTER TABLE ai_settings
  ADD COLUMN IF NOT EXISTS deepseek_api_key text,
  ADD COLUMN IF NOT EXISTS deepseek_model text DEFAULT 'deepseek-v4-pro';

-- Для новых строк по умолчанию — Gemini (обратная совместимость).
ALTER TABLE ai_settings
  ALTER COLUMN ai_provider SET DEFAULT 'gemini';
