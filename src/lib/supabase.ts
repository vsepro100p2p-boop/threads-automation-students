import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export function getSupabaseUrl(): string {
  return supabaseUrl;
}

/**
 * Сохранить секрет(ы) через Edge Function save-secret. Фронтенд НЕ пишет секреты
 * (access_token, app_secret, AI-ключи) в БД напрямую — функция шифрует их перед
 * записью (см. supabase/functions/_shared/crypto.ts). Возвращает вставленную
 * строку при INSERT (когда id не передан).
 */
export async function saveSecret(params: {
  table: 'ai_settings' | 'meta_apps' | 'threads_accounts';
  id?: string;
  values: Record<string, string | null>;
  extra?: Record<string, unknown>;
}): Promise<{ success: boolean; row?: any; id?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${supabaseUrl}/functions/v1/save-secret`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось сохранить секрет');
  }
  return data;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  let session: any = null;

  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session;
  } catch (e: any) {
    // Session token might be corrupted ("Invalid JWT structure")
    // Try to refresh it
    console.warn('getSession failed, attempting refresh:', e.message);
  }

  // If no session or token is missing, try refreshing
  if (!session?.access_token) {
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      session = refreshData?.session;
    } catch (refreshErr: any) {
      console.error('Session refresh failed:', refreshErr.message);
      // Auto sign out so user can re-login cleanly
      await supabase.auth.signOut().catch(() => {});
      throw new Error('Сессия истекла. Страница будет перезагружена для повторного входа.');
    }
  }

  if (!session?.access_token) {
    await supabase.auth.signOut().catch(() => {});
    throw new Error('Сессия истекла. Страница будет перезагружена для повторного входа.');
  }

  const token = String(session.access_token).trim();

  if (!/^[\x00-\x7F]*$/.test(token)) {
    throw new Error('Invalid token format');
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey,
  };
}
