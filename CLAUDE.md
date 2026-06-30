# Threads Automation — инструкция для ИИ-агента по развёртыванию

Этот файл читает ИИ-ассистент (например, Claude Code), когда пользователь просит
«разверни проект». Следуй ему как пошаговому runbook'у. Цель — поднять полностью
рабочий экземпляр (бэкенд Supabase + cron + фронтенд) с минимумом действий со
стороны человека.

## Что это за проект

React + Vite фронтенд + Supabase (Postgres, Auth, Edge Functions на Deno, pg_cron).
Полное описание — в [README.md](./README.md) и [ARCHITECTURE_AUTOPOSTING.md](./ARCHITECTURE_AUTOPOSTING.md).
Деплой автоматизирован скриптом [scripts/deploy.sh](./scripts/deploy.sh).

## Алгоритм развёртывания

### Шаг 1. Собери у человека входные данные

Спроси и дождись от пользователя три значения (без них продолжать нельзя):

1. **SUPABASE_ACCESS_TOKEN** — personal access token.
   Где взять: https://supabase.com/dashboard/account/tokens → Generate new token.
2. **SUPABASE_PROJECT_REF** — ref проекта (часть `xxxx` из `https://xxxx.supabase.co`).
   - Если проекта ещё нет — попроси создать его на https://supabase.com/dashboard
     (New project), затем взять ref из URL/настроек.
3. **SUPABASE_DB_PASSWORD** — пароль базы данных проекта (задавался при создании).

Запиши их в файл `.deploy.env` (он в `.gitignore`, в репозиторий не попадёт):

```
SUPABASE_ACCESS_TOKEN=...
SUPABASE_PROJECT_REF=...
SUPABASE_DB_PASSWORD=...
```

> Никогда не вписывай эти значения в коммиты, в код или в файлы вне `.deploy.env`.

### Шаг 2. Запусти автоматический деплой

```bash
bash scripts/deploy.sh
```

Скрипт сам: поставит npm-зависимости → привяжет проект → получит anon и
service_role ключи → создаст `.env` → накатит миграции → сгенерирует и поставит
`SECRET_ENCRYPTION_KEY` (шифрование токенов; хранит в `.deploy.env`) → задеплоит
Edge Functions → настроит Vault-секреты для cron → соберёт фронтенд (`./dist`).

Если фронт будет хоститься не на localhost — задай `ALLOWED_ORIGINS` (origin'ы через
запятую) в `.deploy.env` перед запуском, иначе браузер упрётся в CORS.

Если скрипт упал — прочитай сообщение, исправь причину (чаще всего: неверный
пароль БД, не тот ref, истёкший access token) и запусти снова. Скрипт идемпотентен.

### Шаг 3. Vault-секреты (если psql был недоступен)

Скрипт настраивает cron через Supabase Vault. Если в выводе появилось предупреждение
про `psql`, значит он сохранил SQL в `.vault-setup.sql`. Тогда:
- попроси пользователя открыть Supabase Dashboard → SQL Editor и выполнить
  содержимое `.vault-setup.sql`, **или**
- если есть строка подключения к БД, экспортируй `SUPABASE_DB_URL` и перезапусти
  `bash scripts/deploy.sh`.

Без этих секретов автопостинг по расписанию работать НЕ будет.

### Шаг 4. Проверь, что cron жив

Попроси выполнить в SQL Editor (через минуту после деплоя):

```sql
select * from public.get_cron_job_runs();
```

`status = succeeded` — автопостинг работает.

### Шаг 5. Объясни человеку, что осталось вручную

Эти шаги ИИ выполнить не может (внешние сервисы / ввод в UI приложения):

1. **Захостить фронтенд** из `./dist`. Варианты: Firebase (`firebase deploy`,
   поправив `.firebaserc` на свой проект), Vercel или Netlify (framework Vite,
   переменные `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` взять из `.env`).
   Локально проверить можно сразу: `npm run dev`.
2. **Создать Meta App** с доступом к Threads API (https://developers.facebook.com),
   получить App ID / App Secret — вводятся при добавлении аккаунта Threads.
3. **Получить AI-ключ** — вводится в Настройки → AI. Поддерживаются **DeepSeek**
   (дешевле) и **Grok (xAI)**; провайдер выбирается там же. Ключ хранится в БД, не в
   коде. Роутинг по провайдеру — в `supabase/functions/_shared/ai.ts` (оба провайдера
   по OpenAI-совместимому API).

## Важные правила для ИИ

- **Секреты.** `service_role`-ключ = полный доступ к БД. Не выводи его в чат
  целиком, не коммить, держи только в `.env` / Vault / `.deploy.env`.
- **Не правь существующие миграции** без явной просьбы — они уже применяются как есть.
- Cron намеренно читает URL и ключ из Vault, а не из кода — не хардкодь их обратно.
- Если чего-то не хватает (нет Node 20+, нет Supabase CLI) — сообщи человеку, что
  установить, не пытайся обойти.

## Полезные команды

```bash
npm run dev         # локальный фронтенд на http://localhost:5173
npm run build       # продакшен-сборка в ./dist
npm run typecheck   # проверка типов
npm run lint        # ESLint
npx supabase functions deploy <name>   # передеплой одной функции
```
