#!/usr/bin/env bash
#
# Автоматическое развёртывание Threads Automation.
# Запускается человеком или ИИ-агентом. Идемпотентен — можно гонять повторно.
#
# Требуемые переменные окружения (передайте через env или .deploy.env):
#   SUPABASE_ACCESS_TOKEN   personal access token (supabase.com/dashboard/account/tokens)
#   SUPABASE_PROJECT_REF    ref проекта (xxxx из https://xxxx.supabase.co)
#   SUPABASE_DB_PASSWORD    пароль БД проекта (задан при создании проекта)
#
# Необязательные:
#   SKIP_BUILD=1            не собирать фронтенд
#
set -euo pipefail

log()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- 0. Подхватить .deploy.env, если есть (он в .gitignore) -------------------
if [[ -f .deploy.env ]]; then
  log "Читаю .deploy.env"
  set -a; # shellcheck disable=SC1091
  source .deploy.env; set +a
fi

: "${SUPABASE_ACCESS_TOKEN:?нужен SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?нужен SUPABASE_PROJECT_REF}"
: "${SUPABASE_DB_PASSWORD:?нужен SUPABASE_DB_PASSWORD}"

export SUPABASE_ACCESS_TOKEN
PROJECT_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

command -v npx >/dev/null || die "нужен Node.js 20+ (npx не найден)"
SUPA="npx --yes supabase"

# --- 1. Зависимости фронтенда ------------------------------------------------
log "Устанавливаю npm-зависимости"
npm install
ok "Зависимости установлены"

# --- 2. Привязка проекта -----------------------------------------------------
log "Привязываю проект $SUPABASE_PROJECT_REF"
$SUPA link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
ok "Проект привязан"

# --- 3. Достаём ключи проекта ------------------------------------------------
log "Получаю API-ключи проекта"
KEYS_JSON="$($SUPA projects api-keys --project-ref "$SUPABASE_PROJECT_REF" -o json)"
ANON_KEY="$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log((a.find(k=>k.name==="anon")||{}).api_key||"")})')"
SERVICE_KEY="$(printf '%s' "$KEYS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log((a.find(k=>k.name==="service_role")||{}).api_key||"")})')"
[[ -n "$ANON_KEY" ]]    || die "не удалось получить anon-ключ"
[[ -n "$SERVICE_KEY" ]] || die "не удалось получить service_role-ключ"
ok "Ключи получены"

# --- 4. Пишем .env для фронтенда ---------------------------------------------
log "Пишу .env"
cat > .env <<EOF
VITE_SUPABASE_URL=${PROJECT_URL}
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
EOF
ok ".env готов"

# --- 5. Миграции БД ----------------------------------------------------------
log "Накатываю миграции (supabase db push)"
$SUPA db push
ok "Схема БД развёрнута"

# --- 5b. Ключ шифрования секретов (SECRET_ENCRYPTION_KEY) ---------------------
# Функции шифруют токены Threads этим ключом (см. supabase/functions/_shared/crypto.ts).
# Без него подключение/обмен токена Threads падает с ошибкой. Генерируем ОДИН раз и
# сохраняем в .deploy.env, чтобы повторные запуски брали тот же ключ — иначе уже
# зашифрованные токены станут нечитаемыми.
if [[ -z "${SECRET_ENCRYPTION_KEY:-}" ]]; then
  log "Генерирую SECRET_ENCRYPTION_KEY (AES-256)"
  if command -v openssl >/dev/null; then
    SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)"
  else
    SECRET_ENCRYPTION_KEY="$(head -c 32 /dev/urandom | base64)"
  fi
  printf "\nSECRET_ENCRYPTION_KEY='%s'\n" "$SECRET_ENCRYPTION_KEY" >> .deploy.env
  ok "SECRET_ENCRYPTION_KEY сгенерирован и сохранён в .deploy.env"
else
  log "Использую существующий SECRET_ENCRYPTION_KEY из .deploy.env"
fi
$SUPA secrets set "SECRET_ENCRYPTION_KEY=${SECRET_ENCRYPTION_KEY}" --project-ref "$SUPABASE_PROJECT_REF"
ok "SECRET_ENCRYPTION_KEY установлен в секретах функций"

# --- 6. Edge Functions -------------------------------------------------------
# CORS: функции пускают только origin'ы из ALLOWED_ORIGINS. Если переменная задана
# (через env или .deploy.env) — кладём её в секреты функций. Иначе действует
# дефолтный список в supabase/functions/_shared/cors.ts (localhost + Firebase).
if [[ -n "${ALLOWED_ORIGINS:-}" ]]; then
  log "Устанавливаю секрет ALLOWED_ORIGINS"
  $SUPA secrets set "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" --project-ref "$SUPABASE_PROJECT_REF"
  ok "ALLOWED_ORIGINS установлен"
fi

log "Деплою Edge Functions"
$SUPA functions deploy
ok "Функции задеплоены"

# --- 6b. Миграция секретов в шифрованный вид ---------------------------------
# Шифрует токены/ключи, которые уже лежат в БД открытым текстом. Идемпотентно:
# уже зашифрованные значения пропускаются. Требует service_role-ключ.
log "Шифрую существующие секреты (migrate-secrets)"
if command -v curl >/dev/null; then
  MIG_HTTP="$(curl -s -o /tmp/migrate-secrets.out -w '%{http_code}' -X POST \
    "${PROJECT_URL}/functions/v1/migrate-secrets" \
    -H "Authorization: Bearer ${SERVICE_KEY}" || true)"
  if [[ "$MIG_HTTP" == "200" ]]; then
    ok "Секреты зашифрованы: $(cat /tmp/migrate-secrets.out)"
  else
    printf '\033[1;33m! migrate-secrets вернул %s. Запустите вручную позже:\n  curl -X POST %s/functions/v1/migrate-secrets -H "Authorization: Bearer <SERVICE_ROLE_KEY>"\033[0m\n' "$MIG_HTTP" "$PROJECT_URL"
  fi
else
  printf '\033[1;33m! curl недоступен — запустите migrate-secrets вручную.\033[0m\n'
fi

# --- 7. Vault-секреты для cron ----------------------------------------------
# Cron-задание читает project_url и service_role_key из Vault.
log "Настраиваю Vault-секреты (project_url, service_role_key)"
VAULT_SQL=$(cat <<SQL
delete from vault.secrets where name in ('project_url','service_role_key');
select vault.create_secret('${PROJECT_URL}', 'project_url');
select vault.create_secret('${SERVICE_KEY}', 'service_role_key');
SQL
)
if command -v psql >/dev/null && [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  printf '%s' "$VAULT_SQL" | psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1
  ok "Vault-секреты установлены через psql"
else
  printf '%s\n' "$VAULT_SQL" > .vault-setup.sql
  printf '\033[1;33m! psql/SUPABASE_DB_URL недоступны. Выполните .vault-setup.sql в Dashboard → SQL Editor.\033[0m\n'
fi

# --- 8. Сборка фронтенда -----------------------------------------------------
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  log "Собираю фронтенд (npm run build)"
  npm run build
  ok "Сборка готова: ./dist"
fi

printf '\n\033[1;32m=== Бэкенд развёрнут ===\033[0m\n'
echo "Project URL: $PROJECT_URL"
echo
echo "Осталось вручную (это нельзя автоматизировать):"
echo "  1. Если показано выше — выполнить .vault-setup.sql в SQL Editor."
echo "  2. Захостить ./dist (Firebase / Vercel / Netlify)."
echo "  3. Создать Meta App (Threads API) и AI-ключ — вводятся уже в самом приложении."
echo "Проверка cron: select * from public.get_cron_job_runs();"
