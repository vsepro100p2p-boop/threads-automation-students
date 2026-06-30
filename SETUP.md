# Развёртывание своей копии Threads Automation

Эта инструкция — для тех, кто хочет поднять **собственный** экземпляр платформы: свой бэкенд (Supabase), свой фронтенд и свои ключи. Всё изолировано: ваши аккаунты, шаблоны и токены не пересекаются ни с кем.

> Уровень: нужен базовый навык работы с терминалом. Время: ~30–40 минут.

---

## Что понадобится

| Сервис | Зачем | Стоимость |
|--------|-------|-----------|
| [Supabase](https://supabase.com) | База данных, авторизация, бэкенд-функции, cron | Free tier хватает для старта |
| [Meta for Developers](https://developers.facebook.com) | Доступ к Threads API (публикация) | Бесплатно |
| AI-провайдер ([Google AI Studio](https://aistudio.google.com/apikey) / OpenAI / Anthropic) | Генерация постов | По тарифу провайдера |
| Хостинг фронтенда ([Firebase](https://firebase.google.com) / [Vercel](https://vercel.com) / [Netlify](https://netlify.com)) | Раздача собранного сайта | Free tier |
| [Node.js 20+](https://nodejs.org) и [Supabase CLI](https://supabase.com/docs/guides/cli) | Локальная сборка и деплой | Бесплатно |

---

## Шаг 1. Клонировать репозиторий

```bash
git clone https://github.com/<ВАШ-АККАУНТ>/threads-automation.git
cd threads-automation
npm install
```

## Шаг 2. Создать проект Supabase

1. Зайдите на [supabase.com](https://supabase.com) → **New project**.
2. Запомните пароль БД, дождитесь готовности проекта.
3. **Project Settings → API** — скопируйте:
   - `Project URL` (вид `https://xxxx.supabase.co`)
   - `anon public` ключ
   - `service_role` ключ (секретный! никому не показывать)

## Шаг 3. Настроить фронтенд `.env`

```bash
cp .env.example .env
```

Откройте `.env` и впишите свои `Project URL` и `anon public` ключ:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> `.env` уже в `.gitignore` — он не попадёт в репозиторий. Это нормально, anon-ключ публичный, но привычка не коммитить `.env` правильная.

## Шаг 4. Применить миграции и развернуть бэкенд

Залогиньтесь в Supabase CLI и привяжите проект (ref — это `xxxx` из URL):

```bash
supabase login
supabase link --project-ref xxxx
```

Накатите схему БД (таблицы, RLS, storage-бакеты, cron-задание):

```bash
supabase db push
```

Задайте **ключ шифрования** (им функции шифруют токены Threads — без него
подключение аккаунта Threads будет падать). Сгенерируйте один раз и сохраните:

```bash
supabase secrets set SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)" --project-ref xxxx
```

> ⚠️ Меняете ключ позже — уже сохранённые зашифрованные токены станут нечитаемыми.
> Поэтому генерируйте его один раз. (Скрипт `scripts/deploy.sh` делает это
> автоматически и хранит ключ в `.deploy.env`.)

Задеплойте Edge Functions:

```bash
supabase functions deploy
```

> Кроме `SECRET_ENCRYPTION_KEY`, функции используют только автоматические переменные
> Supabase (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — их задавать не нужно.
> Если фронтенд хостится не на localhost — задайте ещё секрет `ALLOWED_ORIGINS`
> (origin'ы через запятую), иначе браузер упрётся в CORS.

## Шаг 5. Включить автопостинг (cron + Vault)

Cron-задание (`process-schedules` раз в минуту) читает URL и `service_role`-ключ из **Supabase Vault** — чтобы секреты не лежали в коде. Добавьте два секрета.

**Dashboard → SQL Editor**, выполните (подставьте свои значения):

```sql
select vault.create_secret('https://xxxx.supabase.co', 'project_url');
select vault.create_secret('ВАШ-SERVICE-ROLE-КЛЮЧ',     'service_role_key');
```

Проверьте, что cron-задание создано:

```sql
select * from cron.job where jobname = 'process-scheduled-posts';
```

Через минуту посмотрите историю запусков:

```sql
select * from public.get_cron_job_runs();
```

`status = succeeded` — всё работает.

## Шаг 6. Подключить Threads (Meta App)

> ⚠️ **Это самый частый источник проблем.** Дело не в коде проекта (он рабочий), а в
> правильной настройке вашего приложения в Meta. Пройдите шаги внимательно.

### 6.1. Создать приложение

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**.
2. Выберите use case с доступом к **Threads API** (Threads API / «Access the Threads API»).
3. В приложении добавьте продукт **Threads** (Use cases → Threads).

### 6.2. Выдать разрешения (permissions)

В настройках Threads use case включите как минимум:

| Permission | Зачем |
|------------|-------|
| `threads_basic` | базовый доступ к профилю и публикациям |
| `threads_content_publish` | **публикация постов** (без неё автопостинг не работает) |

(`threads_manage_replies`, `threads_read_replies` и т.п. — по необходимости, не обязательны для постинга.)

### 6.3. Настроить OAuth Redirect URI

В разделе Threads → Settings укажите **Redirect Callback URL** — это адрес вашего
задеплоенного фронтенда (из Шага 7), например:

```
https://your-app.web.app/
```

Адрес должен **точно совпадать** с тем, что используется при подключении аккаунта в
приложении, иначе авторизация Threads вернёт ошибку.

### 6.4. Взять App ID и App Secret

**App settings → Basic**: скопируйте `App ID` и `App Secret`. Эти данные **вводятся в
самом приложении** при добавлении аккаунта Threads и хранятся в вашей БД (не в коде).

### 6.5. Режим разработки vs App Review (важно!)

- Пока приложение в **Development mode**, публиковать можно **только от аккаунтов,
  явно добавленных в приложение** (Roles → добавить себя/тестовый Threads-аккаунт как
  tester, принять приглашение в Threads).
- Чтобы публиковать от **любых** аккаунтов (например, аккаунтов студентов или клиентов),
  приложение нужно перевести в **Live** и пройти **App Review** для `threads_content_publish`.
  Это проверка со стороны Meta: понадобится описание, скринкаст использования и т.д.

> Для обучения/теста достаточно Development mode + добавленный тестовый аккаунт.
> Для продакшена под реальных пользователей — обязательно App Review.

> Технические детали публикации, обмена и продления токена — в
> [ARCHITECTURE_AUTOPOSTING.md](./ARCHITECTURE_AUTOPOSTING.md).

## Шаг 7. Собрать и опубликовать фронтенд

Локальная проверка:

```bash
npm run dev      # http://localhost:5173
```

Продакшен-сборка:

```bash
npm run build    # результат в dist/
```

Деплой (на выбор):

- **Firebase:** `npm i -g firebase-tools && firebase login && firebase deploy`
  (в репозитории уже есть `firebase.json`; замените проект в `.firebaserc` на свой)
- **Vercel / Netlify:** подключите репозиторий, framework — Vite, добавьте переменные `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` в настройках проекта.

## Шаг 8. Первый вход и AI-ключ

1. Откройте задеплоенный сайт, зарегистрируйтесь.
2. Настройки → вкладка AI: выберите **провайдера генерации** и введите свой ключ.
   - **DeepSeek** (дешевле за токен) — ключ с [platform.deepseek.com](https://platform.deepseek.com/api_keys),
     модель `deepseek-v4-pro` (по умолчанию) или `deepseek-v4-flash`.
   - **Grok (xAI)** — ключ с [console.x.ai](https://console.x.ai), модель `grok-4.3` (по умолчанию).
   Модель выбирается из списка. Ключ хранится в вашей БД и используется только вашими генерациями.
3. Добавьте аккаунт Threads, создайте шаблон и расписание.

> 💡 Не хотите сразу возиться с Meta App? На стартовом экране нажмите
> **«Попробовать без подключения»** — откроется демо-аккаунт, где работают генерация,
> шаблоны и карусели. Публикация в Threads в демо-режиме отключена.

> Провайдера можно переключать в любой момент — на бэкенде генерация маршрутизируется
> автоматически (см. `supabase/functions/_shared/ai.ts`).

---

## Безопасность (обязательно прочитать)

- **`service_role`-ключ — это полный доступ к вашей БД.** Никогда не коммитьте его, не вставляйте в код фронтенда и не пересылайте. Он живёт только в секретах Supabase и в Vault.
- Каждый пользователь видит только свои данные — это обеспечивает Row Level Security (RLS), включённый на всех таблицах.
- AI-ключи и токены Threads хранятся в БД под RLS и доступны бэкенд-функциям через `service_role`. На клиент их выдавать не нужно.

## Частые проблемы

| Симптом | Причина / решение |
|---------|-------------------|
| Посты не публикуются по расписанию | Не добавлены Vault-секреты (Шаг 5) или cron-задание не создано |
| `get_cron_job_runs()` показывает `failed` | Проверьте, что `project_url` без слэша в конце и `service_role_key` верный |
| Белый экран фронтенда | Не заполнен `.env` / переменные не проброшены в хостинг |
| Ошибка авторизации Threads | Redirect URI в Meta App не совпадает с адресом фронтенда, либо неверные App ID / App Secret |
| Пост не публикуется, хотя токен есть | Нет разрешения `threads_content_publish`, или приложение в Development mode, а аккаунт не добавлен как tester (Шаг 6.5) |
| «Работает у меня, но не у клиента» | Приложение не прошло App Review — в Development mode постинг доступен только добавленным тестовым аккаунтам |
