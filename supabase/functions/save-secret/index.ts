// Запись секретов с фронтенда.
//
// Фронтенд НЕ должен писать секреты (access_token, app_secret, AI-ключи) напрямую
// в БД — иначе они снова окажутся там открытым текстом. Вместо этого он шлёт
// плейнтекст сюда: функция под service_role шифрует значения (_shared/crypto.ts)
// и пишет их в БД, предварительно проверив, что строка принадлежит вызывающему.
//
// Тело запроса:
//   { table, id?, values: { <секретные колонки> }, extra?: { <несекретные колонки> } }
//   - table: 'ai_settings' | 'meta_apps' | 'threads_accounts'
//   - id: для update существующей строки (meta_apps / threads_accounts)
//   - values: только разрешённые секретные колонки (будут зашифрованы)
//   - extra: несекретные колонки для INSERT (имя, app_id и т.п.) — по白списку
//
// Для ai_settings строка одна на пользователя — делаем upsert по user_id.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';
import { encryptSecret } from '../_shared/crypto.ts';

// Только эти колонки можно писать через функцию — защита от произвольной записи.
const SECRET_COLUMNS: Record<string, string[]> = {
  ai_settings: ['deepseek_api_key', 'grok_api_key'],
  meta_apps: ['app_secret'],
  threads_accounts: ['access_token', 'app_secret'],
};

// Несекретные колонки, разрешённые при создании строки (INSERT).
const EXTRA_COLUMNS: Record<string, string[]> = {
  ai_settings: ['ai_provider', 'deepseek_model', 'grok_model'],
  meta_apps: ['name', 'app_id'],
  threads_accounts: ['threads_user_id', 'username', 'app_id', 'is_active', 'meta_app_id', 'folder_id'],
};

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

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token!);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json() as {
      table?: string;
      id?: string;
      values?: Record<string, string>;
      extra?: Record<string, unknown>;
    };

    const table = body.table ?? '';
    const allowedSecret = SECRET_COLUMNS[table];
    const allowedExtra = EXTRA_COLUMNS[table] ?? [];
    if (!allowedSecret) return json({ error: 'Invalid table' }, 400);
    if (!body.values || typeof body.values !== 'object') {
      return json({ error: 'values required' }, 400);
    }

    // Шифруем переданные секретные колонки (только из белого списка).
    const payload: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(body.values)) {
      if (!allowedSecret.includes(col)) {
        return json({ error: `Column not allowed: ${col}` }, 400);
      }
      const clean = typeof val === 'string' ? val.trim() : val;
      payload[col] = await encryptSecret(clean as string | null);
    }
    // Несекретные колонки для INSERT — только из белого списка.
    for (const [col, val] of Object.entries(body.extra ?? {})) {
      if (allowedExtra.includes(col)) payload[col] = val;
    }
    payload.updated_at = new Date().toISOString();

    if (table === 'ai_settings') {
      // Одна строка на пользователя — upsert по user_id.
      const { data: existing } = await supabase
        .from('ai_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase
          .from('ai_settings')
          .update(payload)
          .eq('user_id', user.id);
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await supabase
          .from('ai_settings')
          .insert({ user_id: user.id, ...payload });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ success: true });
    }

    // meta_apps / threads_accounts
    if (body.id) {
      // UPDATE существующей строки с проверкой владения.
      const { data, error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', body.id)
        .eq('user_id', user.id)
        .select('id');
      if (error) return json({ error: error.message }, 500);
      if (!data || data.length === 0) return json({ error: 'Not found' }, 404);
      return json({ success: true, id: body.id });
    } else {
      // INSERT новой строки от имени пользователя.
      const { data, error } = await supabase
        .from(table)
        .insert({ user_id: user.id, ...payload })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, row: data });
    }
  } catch (error: any) {
    console.error('save-secret error:', error);
    return json({ error: error.message }, 500);
  }
});
