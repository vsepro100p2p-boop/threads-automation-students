// Одноразовая миграция: шифрует секреты, которые уже лежат в БД открытым текстом
// (после внедрения шифрования старые строки остаются плейнтекстом, пока их не
// перезапишут). Идемпотентна — значения вида "enc:v1:" пропускаются.
//
// Запуск один раз после деплоя и установки SECRET_ENCRYPTION_KEY:
//   curl -X POST "$PROJECT_URL/functions/v1/migrate-secrets" \
//     -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
// Доступ только по service_role-ключу: функция трогает строки ВСЕХ пользователей,
// поэтому обычный пользовательский JWT сюда не пускаем.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';
import { encryptSecret, isEncrypted } from '../_shared/crypto.ts';

const TARGETS: Array<{ table: string; columns: string[] }> = [
  { table: 'ai_settings', columns: ['deepseek_api_key', 'grok_api_key'] },
  { table: 'threads_accounts', columns: ['access_token', 'app_secret'] },
  { table: 'meta_apps', columns: ['app_secret'] },
];

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const provided = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (provided !== serviceKey) {
    return json({ error: 'Forbidden: service_role key required' }, 403);
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
    const report: Record<string, number> = {};

    for (const { table, columns } of TARGETS) {
      const { data: rows, error } = await supabase
        .from(table)
        .select(['id', ...columns].join(', '));
      if (error) {
        report[`${table}_error`] = 1;
        console.error(`${table} select error:`, error.message);
        continue;
      }

      let updated = 0;
      for (const row of rows ?? []) {
        const patch: Record<string, string> = {};
        for (const col of columns) {
          const val = (row as Record<string, unknown>)[col];
          if (typeof val === 'string' && val !== '' && !isEncrypted(val)) {
            patch[col] = (await encryptSecret(val)) as string;
          }
        }
        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from(table)
            .update(patch)
            .eq('id', (row as { id: string }).id);
          if (upErr) console.error(`${table} update error:`, upErr.message);
          else updated++;
        }
      }
      report[table] = updated;
    }

    return json({ success: true, encrypted: report });
  } catch (error: any) {
    console.error('migrate-secrets error:', error);
    return json({ error: error.message }, 500);
  }
});
