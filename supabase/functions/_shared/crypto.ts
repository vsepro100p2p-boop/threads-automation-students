// Шифрование секретов на уровне приложения (envelope encryption).
//
// Мастер-ключ хранится в СЕКРЕТАХ Edge Functions (SECRET_ENCRYPTION_KEY), а НЕ в
// базе. Поэтому дамп БД или SQL-инъекция дают только шифротекст — без ключа из
// окружения функций его не расшифровать. Это и есть защита, которой не хватало:
// раньше access_token / app_secret / AI-ключи лежали в БД открытым текстом.
//
// Формат хранимого значения:  "enc:v1:" + base64( iv(12 байт) || ciphertext+tag )
// Алгоритм: AES-256-GCM (WebCrypto, доступен в Deno-рантайме Edge Functions).
//
// Обратная совместимость: decryptSecret() к значению БЕЗ префикса "enc:v1:"
// возвращает его как есть. Значит старые плейнтекст-строки продолжают читаться,
// и шифрование можно катить без простоя: сначала включаем дешифровку на чтении
// (ничего не ломается), потом — шифрование на записи, потом мигрируем старые строки.
//
// Как сгенерировать ключ и положить в секреты:
//   KEY=$(openssl rand -base64 32)
//   npx supabase secrets set SECRET_ENCRYPTION_KEY="$KEY" --project-ref <ref>
// Ключ нельзя терять и нельзя менять без перешифровки данных.

const PREFIX = 'enc:v1:';

let keyPromise: Promise<CryptoKey> | null = null;

function decodeBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function getKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  const raw = Deno.env.get('SECRET_ENCRYPTION_KEY');
  if (!raw || !raw.trim()) {
    throw new Error(
      'SECRET_ENCRYPTION_KEY не задан в секретах функций. ' +
        'Сгенерируйте: openssl rand -base64 32 и положите через supabase secrets set.',
    );
  }
  const bytes = decodeBase64(raw.trim());
  if (bytes.length !== 32) {
    throw new Error('SECRET_ENCRYPTION_KEY должен быть base64 от 32 байт (AES-256).');
  }
  keyPromise = crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  return keyPromise;
}

/** Уже зашифрованное значение нашего формата? */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/**
 * Шифрует строку. Идемпотентна: уже зашифрованное и пустое/`null` значение
 * возвращаются без изменений (безопасно вызывать повторно при перешифровке).
 */
export async function encryptSecret(
  plain: string | null | undefined,
): Promise<string | null> {
  if (plain == null || plain === '') return plain ?? null;
  if (isEncrypted(plain)) return plain;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plain);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return PREFIX + encodeBase64(packed);
}

/**
 * Расшифровывает строку. Значение без нашего префикса считается легаси-плейнтекстом
 * и возвращается как есть — это и обеспечивает бесшовный переход.
 */
export async function decryptSecret(
  value: string | null | undefined,
): Promise<string | null> {
  if (value == null || value === '') return value ?? null;
  if (!isEncrypted(value)) return value;
  const key = await getKey();
  const packed = decodeBase64(value.slice(PREFIX.length));
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}
