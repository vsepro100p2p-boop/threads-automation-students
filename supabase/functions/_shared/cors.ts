// Общий CORS-хелпер для всех Edge Functions.
//
// Раньше каждая функция отдавала `Access-Control-Allow-Origin: *` — то есть
// принимала запросы с любого сайта. JWT-проверка защищает данные, но открытый
// CORS позволяет любому стороннему origin дёргать функции от имени залогиненного
// пользователя (CSRF-подобные сценарии). Теперь origin сверяется с белым списком.
//
// Список задаётся секретом функций ALLOWED_ORIGINS (origin'ы через запятую):
//   npx supabase secrets set ALLOWED_ORIGINS="https://your-app.web.app,http://localhost:5173"
// Если секрет не задан — разрешаем только локальную разработку.

// Дефолт на случай, если секрет ALLOWED_ORIGINS не задан: только локальная
// разработка (Vite dev/preview). Когда захостите фронтенд (Firebase/Vercel/
// Netlify), задайте секрет ALLOWED_ORIGINS со своим прод-origin'ом — он
// полностью переопределит этот список:
//   npx supabase secrets set ALLOWED_ORIGINS="https://ваш-домен" --project-ref <ref>
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (raw && raw.trim()) {
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return DEFAULT_ORIGINS;
}

/**
 * Возвращает CORS-заголовки для конкретного запроса. Если Origin запроса есть в
 * белом списке — эхо-отдаём именно его; иначе подставляем первый разрешённый
 * (браузер чужого origin'а всё равно заблокирует ответ).
 */
export function buildCors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowList = allowedOrigins();
  const allowOrigin = allowList.includes(origin) ? origin : (allowList[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Vary': 'Origin',
  };
}
