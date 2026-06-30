# Архитектура автопостинга в приложении Threads Automation

> ⚠️ **Про AI-провайдера.** Ниже по тексту в примерах фигурирует Gemini — это
> историческое описание. Сейчас генерация идёт через **DeepSeek** или **Grok (xAI)**
> (выбор в настройках), а вся логика вызова вынесена в единый модуль
> `supabase/functions/_shared/ai.ts` (оба провайдера — OpenAI-совместимый API).
> Принципы анализа шаблона, ротации и публикации остаются прежними.

## Обзор системы

Приложение имеет **два типа автопостинга**:

1. **Обычный автопостинг шаблонов** - публикация существующих готовых шаблонов по расписанию
2. **AI-автопостинг** - генерация новых уникальных постов на основе шаблонов с помощью AI и их публикация

Оба типа обрабатываются через **Edge Function `process-schedules`**, которая запускается по cron каждую минуту.

---

## 1. Обычный автопостинг шаблонов

### Таблица: `template_schedules`

```sql
CREATE TABLE template_schedules (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  template_id uuid REFERENCES thread_templates,
  scheduled_for timestamptz NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'published', 'failed'
  created_at timestamptz DEFAULT now()
);
```

### Как работает:

1. **Пользователь создает расписание:**
   - Выбирает готовый шаблон из `thread_templates`
   - Указывает время публикации `scheduled_for`
   - Статус устанавливается в `pending`

2. **Cron запускает `process-schedules` каждую минуту:**
   ```sql
   SELECT * FROM template_schedules
   WHERE status = 'pending'
   AND scheduled_for <= NOW()
   ```

3. **Функция обрабатывает каждое расписание:**
   - Берет контент из `thread_templates.content` (массив строк)
   - Публикует в Threads API через `publishThread()`
   - Сохраняет результат в таблицу `posts`
   - Обновляет статус в `published` или `failed`

4. **Публикация:**
   - Первый пост публикуется как обычный пост
   - Остальные посты публикуются как replies (тред)

---

## 2. AI-автопостинг

### Таблица: `ai_autoposting_schedules`

```sql
CREATE TABLE ai_autoposting_schedules (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users,
  threads_account_id uuid REFERENCES threads_accounts,
  template_ids uuid[] NOT NULL, -- МАССИВ ID шаблонов
  current_template_index integer DEFAULT 0,
  interval_hours integer NOT NULL,
  is_active boolean DEFAULT true,
  last_posted_at timestamptz,
  next_post_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

### Как работает:

1. **Пользователь создает AI-расписание:**
   - Выбирает **несколько шаблонов** (массив `template_ids`)
   - Указывает интервал в часах (например, каждые 24 часа)
   - Устанавливает `is_active = true`
   - Система вычисляет `next_post_at`

2. **Cron запускает `process-schedules` каждую минуту:**
   ```sql
   SELECT * FROM ai_autoposting_schedules
   WHERE is_active = true
   AND next_post_at <= NOW()
   ```

3. **Функция генерирует новый пост:**

   a) **Выбирает шаблон из rotation:**
   ```javascript
   const currentIndex = schedule.current_template_index || 0;
   const templateId = templateIds[currentIndex % templateIds.length];
   ```

   b) **Анализирует шаблон:**
   ```javascript
   const formatting = analyzeFormatting(templateContent);
   // Определяет: абзацы, переносы строк, списки, эмодзи

   const authorGender = detectAuthorGender(templateContent);
   // Определяет пол автора: женский/мужской/нейтральный
   ```

   c) **Создает промт для AI (Gemini):**
   ```javascript
   const systemPrompt = `
   АНАЛИЗ ВИРАЛЬНОСТИ:
   1. КРЮЧОК первого поста
   2. ЭКСПЕРТНАЯ ПОЗИЦИЯ
   3. ТРИГГЕРЫ
   4. СТРУКТУРА
   5. ТОН

   КРИТИЧЕСКИ ВАЖНО - СОХРАНИ:
   - ПОЛ АВТОРА: ${authorGender}
   - ФОРМАТИРОВАНИЕ: ${formatting}
   - Абзацы и переносы строк ТОЧНО как в оригинале
   - Количество абзацев в каждом посте ТАКОЕ ЖЕ

   ГЕНЕРАЦИЯ:
   - Та же тема и экспертиза
   - Новые факты/истории/примеры
   - Текст ЛОГИЧНЫЙ и ЧИТАБЕЛЬНЫЙ
   `;
   ```

   d) **Отправляет запрос к Gemini API:**
   ```javascript
   const response = await fetch(
     `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
     {
       method: 'POST',
       body: JSON.stringify({
         contents: [{ parts: [{ text: fullPrompt }] }],
         generationConfig: {
           temperature: 1.0,
           responseMimeType: 'application/json',
         },
       }),
     }
   );
   ```

   e) **Получает JSON-массив постов:**
   ```json
   {
     "variants": [
       ["пост 1", "пост 2", "пост 3"]
     ]
   }
   ```

4. **Публикация сгенерированного поста:**
   - Берет первый вариант из `variants[0]`
   - Публикует через `publishThread()` в Threads API
   - Сохраняет в таблицу `posts`

5. **Обновление расписания:**
   ```javascript
   const nextPostTime = new Date(schedule.next_post_at);
   nextPostTime.setHours(nextPostTime.getHours() + schedule.interval_hours);

   await supabase
     .from('ai_autoposting_schedules')
     .update({
       last_posted_at: now,
       next_post_at: nextPostTime,
       current_template_index: (currentIndex + 1) % templateIds.length
     })
     .eq('id', schedule.id);
   ```

---

## 3. Edge Function: `process-schedules`

### Основной флоу:

```javascript
Deno.serve(async (req: Request) => {
  // 1. Получить просроченные обычные расписания шаблонов
  const { data: dueTemplateSchedules } = await supabase
    .from('template_schedules')
    .select('*, thread_templates(*)')
    .eq('status', 'pending')
    .lte('scheduled_for', now);

  // 2. Получить просроченные AI-расписания
  const { data: dueSchedules } = await supabase
    .from('ai_autoposting_schedules')
    .select('*')
    .eq('is_active', true)
    .lte('next_post_at', now);

  // 3. Обработать обычные расписания
  for (const schedule of dueTemplateSchedules) {
    const content = schedule.thread_templates.content;
    const publishResult = await publishThread(
      accountId,
      accessToken,
      content
    );
    // Сохранить в posts и обновить статус
  }

  // 4. Обработать AI-расписания
  for (const schedule of dueSchedules) {
    // 4.1. Получить API ключ пользователя
    const aiSettings = await getAISettings(schedule.user_id);

    // 4.2. Выбрать текущий шаблон
    const templateId = schedule.template_ids[currentIndex];
    const template = await getTemplate(templateId);

    // 4.3. Генерировать новый пост через Gemini
    const generatedPosts = await generateWithGemini(
      template.content,
      aiSettings.gemini_api_key
    );

    // 4.4. Публиковать
    const publishResult = await publishThread(
      accountId,
      accessToken,
      generatedPosts
    );

    // 4.5. Обновить next_post_at и current_template_index
    await updateSchedule(schedule.id);
  }

  return new Response(JSON.stringify({ success: true }));
});
```

---

## 4. Публикация в Threads API

### Функция `publishThread()`

> Ниже — реальная логика из `supabase/functions/process-schedules/index.ts`.
> Ключевые моменты, которые легко сделать неправильно:
> 1. Каждый пост треда **создаётся и публикуется по отдельности**, а не «все разом
>    по первому `creation_id`». Один `threads_publish` публикует только свой контейнер.
> 2. Ответы цепляются через `reply_to_id` на **id уже опубликованного** предыдущего
>    поста (не на id контейнера).
> 3. Перед каждым `threads_publish` нужно дождаться, пока контейнер перейдёт в
>    статус `FINISHED` (Meta готовит контейнер асинхронно).

```javascript
async function publishThread(userId, accessToken, texts) {
  let firstPostId = null;        // id корневого поста — для ссылки на тред
  let lastPublishedPostId = null; // id предыдущего опубликованного поста
  let publishedCount = 0;

  for (let i = 0; i < texts.length; i++) {
    // 1. Создать контейнер. Для ответов — reply_to_id на опубликованный пред. пост
    const body = { media_type: 'TEXT', text: texts[i], access_token: accessToken };
    if (i > 0 && lastPublishedPostId) body.reply_to_id = lastPublishedPostId;

    const createRes = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!createRes.ok) return { success: publishedCount > 0, publishedCount, error: '...' };
    const { id: containerId } = await createRes.json();

    // 2. Дождаться готовности контейнера (status === 'FINISHED'), до 10 попыток
    const status = await checkContainerStatus(userId, containerId, accessToken);
    if (!status.success) return { success: publishedCount > 0, publishedCount, error: status.error };

    // 3. Опубликовать ИМЕННО этот контейнер
    const pubRes = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: containerId, access_token: accessToken }) }
    );
    if (!pubRes.ok) return { success: publishedCount > 0, publishedCount, error: '...' };

    const { id: publishedPostId } = await pubRes.json();
    if (i === 0) firstPostId = publishedPostId;
    lastPublishedPostId = publishedPostId;
    publishedCount++;
  }

  return {
    success: true,
    postId: firstPostId,
    url: `https://www.threads.net/t/${firstPostId}`,
    publishedCount,
  };
}

// Опрос статуса контейнера перед публикацией
async function checkContainerStatus(userId, containerId, accessToken, maxAttempts = 10, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`
    );
    const data = await res.json();
    if (data.status === 'FINISHED') return { success: true };
    if (data.status === 'ERROR' || data.status === 'EXPIRED')
      return { success: false, error: data.error_message || data.status };
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, delayMs));
  }
  return { success: false, error: 'timeout' };
}
```

> Частичная неудача обрабатывается: если часть постов треда опубликовалась, а
> следующий упал — функция вернёт `success: true` c `publishedCount`, а в `posts`
> запишется ссылка на корневой пост.

---

## 5. Генерация постов через AI

### Функции для анализа шаблона:

```javascript
// Анализ форматирования
function analyzeFormatting(posts: string[]): string {
  const features = [];

  if (posts.some(p => p.includes('\n\n'))) {
    features.push('двойные переносы строк (абзацы)');
  }

  if (/^[\-\•\*]\s/m.test(posts.join(' '))) {
    features.push('маркированные списки');
  }

  if (/[\u{1F300}-\u{1F9FF}]/u.test(posts.join(' '))) {
    features.push('эмодзи');
  }

  return features.join(', ');
}

// Определение пола автора
function detectAuthorGender(posts: string[]): string {
  const text = posts.join(' ').toLowerCase();

  const femaleMarkers = [
    /\bя\s+(сделала|была|смогла)\b/i,
    /\bмоя\s+(история|жизнь|работа)\b/i,
  ];

  const maleMarkers = [
    /\bя\s+(сделал|был|смог)\b/i,
    /\bмой\s+(опыт|путь|бизнес)\b/i,
  ];

  let femaleScore = 0, maleScore = 0;

  femaleMarkers.forEach(marker => {
    if (marker.test(text)) femaleScore++;
  });

  maleMarkers.forEach(marker => {
    if (marker.test(text)) maleScore++;
  });

  if (femaleScore > maleScore) return 'ЖЕНСКИЙ';
  if (maleScore > femaleScore) return 'МУЖСКОЙ';
  return 'нейтральный';
}
```

---

## 6. Ключевые отличия двух типов автопостинга

| Параметр | Обычный автопостинг | AI-автопостинг |
|----------|---------------------|----------------|
| **Контент** | Готовые шаблоны | Генерируется AI |
| **Уникальность** | Повторяющийся | Каждый раз новый |
| **Расписание** | Одноразовое (scheduled_for) | Рекуррентное (interval_hours) |
| **Rotation** | Нет | Да (по массиву template_ids) |
| **API ключи** | Не нужны | Gemini API ключ |
| **Таблица** | template_schedules | ai_autoposting_schedules |
| **Статус** | pending/published/failed | is_active true/false |

---

## 7. Безопасность и RLS

### Row Level Security включен на всех таблицах:

```sql
-- Пользователи видят только свои расписания
CREATE POLICY "Users can manage own schedules"
  ON ai_autoposting_schedules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Пользователи видят только свои шаблоны
CREATE POLICY "Users can manage own templates"
  ON thread_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Секретность API ключей:

- Gemini API ключи хранятся в `ai_settings` таблице
- Доступ только через service_role_key в Edge Functions
- Не передаются на клиент

---

## 8. Мониторинг и логирование

### Логи в Edge Function:

```javascript
console.log('Processing AI schedule:', schedule.id);
console.log('Generated posts:', generatedPosts);
console.log('Publish result:', publishResult);
```

### Таблица `posts` хранит историю:

```sql
CREATE TABLE posts (
  id uuid PRIMARY KEY,
  user_id uuid,
  threads_account_id uuid,
  threads_post_id text,
  content text,
  thread_content jsonb,
  status text, -- 'published', 'failed'
  published_at timestamptz,
  error_message text,
  generated_by_ai boolean DEFAULT false
);
```

---

## Итоговая диаграмма потока

```
┌─────────────────┐
│   User creates  │
│   schedule      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Supabase Database                  │
│  ├─ template_schedules              │
│  └─ ai_autoposting_schedules        │
└────────┬────────────────────────────┘
         │
         │ Cron: Every minute
         ▼
┌─────────────────────────────────────┐
│  Edge Function: process-schedules   │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ 1. Check due schedules       │  │
│  └──────────┬───────────────────┘  │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │ 2. AI Generation (if AI)     │  │
│  │    ├─ Analyze formatting     │  │
│  │    ├─ Detect gender          │  │
│  │    └─ Call Gemini API        │  │
│  └──────────┬───────────────────┘  │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │ 3. Publish to Threads API    │  │
│  │    ├─ Create first post      │  │
│  │    ├─ Create replies         │  │
│  │    └─ Publish thread         │  │
│  └──────────┬───────────────────┘  │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │ 4. Save to posts table       │  │
│  └──────────┬───────────────────┘  │
│             ▼                       │
│  ┌──────────────────────────────┐  │
│  │ 5. Update schedule           │  │
│  │    (next_post_at, index)     │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

---

## Советы для работы с системой

1. **AI-генерация работает лучше всего, когда:**
   - Шаблон имеет четкую структуру
   - Есть явные маркеры пола автора
   - Форматирование последовательное

2. **Rotation шаблонов:**
   - AI будет циклически использовать все шаблоны из массива
   - Каждый раз генерируется новый контент
   - Индекс увеличивается после каждой публикации

3. **Обработка ошибок:**
   - Если AI не может сгенерировать - пропускается
   - Если Threads API падает - сохраняется ошибка
   - Расписание не удаляется, только статус меняется

4. **Performance:**
   - Функция обрабатывает все просроченные расписания за один запуск
   - Максимум 1 минута задержки (cron интервал)
   - Параллельная обработка нескольких расписаний
