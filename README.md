# Threads Automation

SaaS-платформа для автоматизации публикаций в [Threads](https://www.threads.net) (Meta): подключение нескольких аккаунтов, шаблоны тредов, AI-генерация контента и постинг по расписанию.

## Возможности

- **Подключение аккаунтов Threads** через Meta Graph API (long-lived токены, авто-refresh)
- **Шаблоны тредов** с папками, расписаниями и счётчиком использования
- **Обычный автопостинг** — публикация готовых шаблонов по расписанию
- **AI-автопостинг** — генерация уникальных постов на основе шаблонов (DeepSeek / Grok) с ротацией шаблонов и временными окнами
- **Виральные треды** — отдельный генератор по нескольким режимам (creative / facts / rewrite)
- **Карусели** — 4 дизайна слайдов (Journal, Notes, Notes Dark, Influencer) с рендером в изображение
- **Медиабиблиотека**, кросс-публикация между аккаунтами, активити-лог
- **Демо-режим** — можно попробовать генерацию, шаблоны и карусели без подключения Threads (публикация при этом отключена)

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, lucide-react |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions на Deno) |
| Планировщик | `pg_cron` + `pg_net` → Edge Function `process-schedules` (раз в минуту) |
| AI | DeepSeek, Grok (xAI) — выбирается в настройках |
| Хостинг | Firebase Hosting |

## Архитектура

Подробное описание движка автопостинга — в [ARCHITECTURE_AUTOPOSTING.md](./ARCHITECTURE_AUTOPOSTING.md).

```
React (Vite) ──► Supabase (Postgres + RLS + Auth)
                      │
                      │  pg_cron каждую минуту
                      ▼
              Edge Function: process-schedules
                ├─ batch_publishes        (пакетная публикация шаблонов)
                ├─ draft_posts            (отложенные черновики)
                ├─ template_schedules     (разовое расписание шаблона)
                ├─ post_schedules         (AI single/thread по интервалу)
                └─ ai_autoposting_schedules (AI с ротацией шаблонов и окнами)
                      │
                      ▼
              Threads Graph API (publishThread / publishCarousel)
```

### Edge Functions

| Функция | Назначение |
|---------|-----------|
| `process-schedules` | Главный обработчик расписаний (cron) |
| `publish-to-threads` | Ручная публикация |
| `generate-viral-threads` | Генерация виральных тредов |
| `generate-post` / `generate-carousel` | Генерация поста / карусели |
| `parse-text-ai` | Разбор текста в треды через AI |
| `exchange-long-lived-token` / `refresh-token` / `update-token-manual` | Управление токенами Meta |
| `publish-thread-test` | Тестовая публикация |

## 🚀 Развернуть свою копию

**Способ 1 — через ИИ (рекомендуется).** Откройте проект в ИИ-агенте (например, Claude Code) и скажите: «разверни проект». Агент прочитает [CLAUDE.md](./CLAUDE.md), спросит у вас доступы к Supabase и сам всё развернёт: зависимости, миграции, Edge Functions, cron, сборку. Под капотом — [scripts/deploy.sh](./scripts/deploy.sh).

**Способ 2 — вручную.** Пошаговая инструкция для самостоятельного развёртывания — в **[SETUP.md](./SETUP.md)**.

В обоих случаях останется три ручных действия (их нельзя автоматизировать): захостить собранный фронт, создать Meta App для Threads API и ввести свой AI-ключ в приложении.

### 👩‍🎓 Для студентов (раздача через template)

Этот репозиторий — **GitHub template**. Чтобы сделать свою копию: нажмите **«Use this template» → Create a new repository**, затем клонируйте её к себе.

Дальше — откройте проект в Claude Code и скажите «разверни проект». Важно:

- У **каждого студента — свой проект Supabase** (бесплатного тарифа достаточно). Свои три доступа (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`) вводите при развёртывании — **не переиспользуйте чужие**.
- Деплой создаёт `.deploy.env` с вашим `SECRET_ENCRYPTION_KEY` (ключ шифрования токенов). **Не теряйте и не публикуйте его** — потеря = нечитаемые токены Threads. Файл уже в `.gitignore`.
- `.env`, `.deploy.env`, ключи и `service_role` **никогда не коммитятся** — это уже настроено в `.gitignore`.

## Локальный запуск

```bash
npm install
npm run dev          # Vite dev server
npm run build        # production-сборка
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

### Переменные окружения (`.env`)

```
VITE_SUPABASE_URL=<supabase project url>
VITE_SUPABASE_ANON_KEY=<anon key>
```

> ⚠️ `.env` содержит только **публичный** anon-ключ. `service_role`-ключи и API-ключи AI-провайдеров хранятся в секретах Supabase и в таблице `ai_settings` — **никогда не коммитьте их в репозиторий и не отдавайте на клиент.**

## База данных

Схема разворачивается миграциями из `supabase/migrations/`. RLS включён на всех таблицах — пользователь видит только свои данные. Применить миграции:

```bash
supabase db push
```

## Структура

```
src/
  components/        UI-компоненты (Dashboard, шаблоны, расписания, карусели)
  contexts/          AuthContext, ToastContext
  lib/               supabase-клиент, типы БД, логгер активности
supabase/
  functions/         Edge Functions (Deno)
  migrations/        SQL-миграции
```
