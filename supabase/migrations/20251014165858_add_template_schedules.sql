/*
  # Добавление таблицы для множественных расписаний шаблонов

  ## Новая таблица
    - `template_schedules`
      - `id` (uuid, primary key)
      - `template_id` (uuid, foreign key to thread_templates)
      - `scheduled_for` (timestamptz) - дата и время публикации
      - `status` (text) - pending/published/failed/cancelled
      - `published_at` (timestamptz) - когда был опубликован
      - `error_message` (text) - сообщение об ошибке если есть
      - `created_at` (timestamptz)

  ## Изменения
    - Удаляем `next_use_at` из `thread_templates` (устарело)
    - Добавляем RLS политики для новой таблицы

  ## Безопасность
    - RLS включен
    - Пользователи могут управлять только своими расписаниями
*/

-- Создаем новую таблицу для расписаний
CREATE TABLE IF NOT EXISTS template_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES thread_templates(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed', 'cancelled')),
  published_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Включаем RLS
ALTER TABLE template_schedules ENABLE ROW LEVEL SECURITY;

-- Политики для template_schedules
CREATE POLICY "Users can view own template schedules"
  ON template_schedules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM thread_templates
      WHERE thread_templates.id = template_schedules.template_id
      AND thread_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own template schedules"
  ON template_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM thread_templates
      WHERE thread_templates.id = template_schedules.template_id
      AND thread_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own template schedules"
  ON template_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM thread_templates
      WHERE thread_templates.id = template_schedules.template_id
      AND thread_templates.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM thread_templates
      WHERE thread_templates.id = template_schedules.template_id
      AND thread_templates.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own template schedules"
  ON template_schedules FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM thread_templates
      WHERE thread_templates.id = template_schedules.template_id
      AND thread_templates.user_id = auth.uid()
    )
  );

-- Индекс для быстрого поиска предстоящих расписаний
CREATE INDEX IF NOT EXISTS idx_template_schedules_pending 
  ON template_schedules(scheduled_for) 
  WHERE status = 'pending';

-- Индекс для поиска по шаблону
CREATE INDEX IF NOT EXISTS idx_template_schedules_template 
  ON template_schedules(template_id);
