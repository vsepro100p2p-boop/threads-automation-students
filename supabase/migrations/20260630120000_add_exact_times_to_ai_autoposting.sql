/*
  # Точное время публикаций для AI-автопостинга

  Добавляет режим расписания «по конкретным временам суток» (в часовом поясе
  пользователя) в дополнение к существующему интервальному.

  ## Новые колонки ai_autoposting_schedules
  - `schedule_type` ('interval' | 'exact_times') — режим расписания.
    По умолчанию 'interval' → полная обратная совместимость со старыми строками.
  - `daily_times` (text[]) — список времён суток 'HH:MM' (например
    {'10:00','12:00','14:00','16:00','18:00','20:00'}). Публикация происходит
    в эти времена каждый день. Используется только при schedule_type='exact_times'.

  «5 постов в течение часа» выражается тем же списком, например
  {'10:00','10:12','10:24','10:36','10:48'} — UI умеет генерировать такие наборы.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'schedule_type'
  ) THEN
    ALTER TABLE ai_autoposting_schedules
      ADD COLUMN schedule_type text NOT NULL DEFAULT 'interval'
      CHECK (schedule_type IN ('interval', 'exact_times'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_autoposting_schedules' AND column_name = 'daily_times'
  ) THEN
    ALTER TABLE ai_autoposting_schedules
      ADD COLUMN daily_times text[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

COMMENT ON COLUMN ai_autoposting_schedules.schedule_type IS
  'interval = каждые frequency_minutes в окне start_hour-end_hour; exact_times = в конкретные времена daily_times';
COMMENT ON COLUMN ai_autoposting_schedules.daily_times IS
  'Список времён суток HH:MM (часовой пояс профиля) для режима exact_times';
