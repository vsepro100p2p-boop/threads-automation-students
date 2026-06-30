/*
  # Demo (test) accounts — пользоваться функционалом без подключения Threads

  1. Changes
    - `threads_accounts.is_demo` (boolean, default false)
      Демо-аккаунт открывает весь рабочий интерфейс (шаблоны, генерация, карусели),
      но публикация в Threads для него заблокирована на бэкенде.

  2. Notes
    - Демо-аккаунт создаётся из приложения одной кнопкой с placeholder-данными
      (threads_user_id/username/access_token = 'demo'). Реальные токены не нужны.
    - RLS не меняется: пользователь по-прежнему видит только свои аккаунты.
*/

ALTER TABLE threads_accounts
  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
