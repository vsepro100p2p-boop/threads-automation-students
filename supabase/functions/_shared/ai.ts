// Общий слой генерации для всех Edge Functions.
// Провайдер выбирается полем ai_settings.ai_provider:
//   'grok'     -> xAI Grok
//   иначе      -> DeepSeek (значение по умолчанию)
//
// Оба провайдера используют OpenAI-совместимый API, поэтому вызов единый.
// Модель настраивается (deepseek_model / grok_model); поставьте точный id из
// документации провайдера.

import { decryptSecret } from './crypto.ts';

export type Provider = 'deepseek' | 'grok';

export interface AISettings {
  ai_provider?: string | null;
  deepseek_api_key?: string | null;
  deepseek_model?: string | null;
  grok_api_key?: string | null;
  grok_model?: string | null;
}

export interface AIOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

interface ProviderConfig {
  label: string;
  endpoint: string;
  apiKey: (s: AISettings) => string | null | undefined;
  model: (s: AISettings) => string;
  defaultModel: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  deepseek: {
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    apiKey: (s) => s.deepseek_api_key,
    model: (s) => (s.deepseek_model || 'deepseek-v4-pro').trim(),
    defaultModel: 'deepseek-v4-pro',
  },
  grok: {
    label: 'Grok',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    apiKey: (s) => s.grok_api_key,
    model: (s) => (s.grok_model || 'grok-4.3').trim(),
    defaultModel: 'grok-4.3',
  },
};

/** Колонки ai_settings, которые нужно выбирать для генерации. */
export const AI_SETTINGS_COLUMNS =
  'ai_provider, deepseek_api_key, deepseek_model, grok_api_key, grok_model';

export function getProvider(s: AISettings): Provider {
  return s?.ai_provider === 'grok' ? 'grok' : 'deepseek';
}

/** Есть ли валидный ключ для выбранного провайдера. */
export function hasAIKey(s: AISettings | null | undefined): boolean {
  if (!s) return false;
  return !!PROVIDERS[getProvider(s)].apiKey(s);
}

/** Человекочитаемая ошибка про отсутствующий ключ. */
export function missingKeyError(s: AISettings | null | undefined): string {
  const p = PROVIDERS[getProvider(s ?? {})];
  return `${p.label} API key not configured`;
}

/** Единая точка вызова AI. Возвращает текст ответа (часто JSON-строку). */
export async function callAI(s: AISettings, opts: AIOptions): Promise<string> {
  const cfg = PROVIDERS[getProvider(s)];
  // Ключ в БД хранится зашифрованным (см. _shared/crypto.ts). Расшифровываем
  // перед вызовом провайдера; легаси-плейнтекст decryptSecret вернёт как есть.
  const apiKey = await decryptSecret(cfg.apiKey(s));
  if (!apiKey) throw new Error(`${cfg.label} API key not configured`);

  // Видно в логах функции (Dashboard → Edge Functions → Logs) — для проверки,
  // что генерация реально пошла через выбранные провайдера и модель.
  console.log(`AI generate via ${cfg.label}, model=${cfg.model(s)}`);

  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: opts.prompt });

  // Reasoning-модели (deepseek-v4-pro, grok-4.x) тратят часть бюджета на
  // chain-of-thought ПЕРЕД ответом. При слишком малом лимите весь бюджет уходит
  // в reasoning, а content приходит пустым. Держим нижний порог, чтобы на ответ
  // всегда оставалось место.
  const REASONING_FLOOR = 2048;
  const body: Record<string, unknown> = {
    model: cfg.model(s),
    messages,
    temperature: opts.temperature ?? 1.0,
    max_tokens: Math.max(opts.maxTokens ?? 8192, REASONING_FLOOR),
  };
  // JSON-режим требует слово "json" в промте — оно есть в наших промтах.
  if (opts.json) body.response_format = { type: 'json_object' };

  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`${cfg.label} API error:`, errText);
    throw new Error(`${cfg.label} API error: ${errText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`No content in ${cfg.label} response`);
  return content;
}
