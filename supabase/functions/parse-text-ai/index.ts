import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callAI, hasAIKey, missingKeyError, AI_SETTINGS_COLUMNS } from '../_shared/ai.ts';

import { buildCors } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError?.message);
      return new Response(
        JSON.stringify({ error: authError?.message || 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { text } = await req.json();

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select(AI_SETTINGS_COLUMNS)
      .eq('user_id', user.id)
      .single();

    if (!hasAIKey(aiSettings)) {
      return new Response(
        JSON.stringify({ error: missingKeyError(aiSettings) }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cleanedText = text
      .replace(/```code\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/\bcode\b/gi, '')
      .trim();

    const systemPrompt = `Ты эксперт по парсингу тредов из социальных сетей. Твоя задача - извлечь чистый контент постов из скопированного текста.

ФОРМАТ ВХОДНЫХ ДАННЫХ:
Текст скопирован из Threads/Twitter и содержит:
- Номера постов: "1/8", "2/8", "1.", "2)" и т.д.
- Имя пользователя (например: nikidrawsfeels)
- Время публикации (например: "20 ч.", "2 д.")
- Сам контент поста

ТВОЯ ЗАДАЧА:

1. УДАЛИ метаданные:
   - Имена пользователей
   - Время публикации ("20 ч.", "2 д.", "5 мин" и т.д.)
   - Номера типа "1/8", "2/8" (это техническая нумерация постов в треде)
   - Отдельно стоящие числа-разделители

2. ИЗВЛЕКИ чистый контент каждого поста

3. СОХРАНИ ВСЁ форматирование внутри постов:
   - Переносы строк
   - Пробелы между абзацами
   - Списки с тире/буллетами (-, •)
   - Эмодзи
   - ЗАГЛАВНЫЕ буквы
   - Пунктуацию
   - НУМЕРАЦИЮ ВНУТРИ КОНТЕНТА (если автор пишет "1.", "2.", "Совет 1:", "Пункт 204:" и т.д. - ЭТО ЧАСТЬ КОНТЕНТА, СОХРАНИ!)

4. ОПРЕДЕЛИ границы постов по:
   - Номерам "N/M" (1/8, 2/8...)
   - Повторяющемуся имени пользователя
   - Времени публикации после контента

ВАЖНО: Различай техническую нумерацию треда (1/8, 2/8) от авторской нумерации в контенте (Совет 1:, Пункт 204:, 1., 2.)
- Техническую нумерацию УДАЛЯЙ
- Авторскую нумерацию СОХРАНЯЙ

ФОРМАТ ОТВЕТА: ТОЛЬКО JSON массив строк, без пояснений!`;

    const userPrompt = `Распарси этот тред. Извлеки ТОЛЬКО чистый контент постов, удали метаданные (имена, время, номера типа 1/8).
СОХРАНИ авторскую нумерацию внутри текста если она есть (например "Совет 204:", "Пункт 1:" и т.д.)

ТЕКСТ:
${cleanedText}

Верни ТОЛЬКО JSON массив: ["пост 1", "пост 2", ...]`;

    let content = await callAI(aiSettings, {
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 1.0,
      maxTokens: 8192,
      json: true,
    });

    if (!content) {
      throw new Error('No content in AI response');
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
      if (parsed.posts) parsed = parsed.posts;
      if (!Array.isArray(parsed)) {
        const keys = Object.keys(parsed);
        for (const key of keys) {
          if (Array.isArray(parsed[key])) {
            parsed = parsed[key];
            break;
          }
        }
      }
    } catch {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse AI response');
      }
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('AI returned empty result');
    }

    const validatedPosts = [];
    for (const post of parsed) {
      if (typeof post !== 'string') continue;

      if (post.length <= 500) {
        validatedPosts.push(post);
      } else {
        const sentences = post.split(/(?<=\.)\s+/);
        let currentPost = '';

        for (const sentence of sentences) {
          if (sentence.length > 500) {
            if (currentPost) {
              validatedPosts.push(currentPost.trim());
              currentPost = '';
            }

            const parts = sentence.split(/,\s+/);
            for (const part of parts) {
              if ((currentPost + part).length <= 500) {
                currentPost += (currentPost ? ', ' : '') + part;
              } else {
                if (currentPost) validatedPosts.push(currentPost.trim());
                currentPost = part;
              }
            }
          } else if ((currentPost + sentence).length <= 500) {
            currentPost += (currentPost ? ' ' : '') + sentence;
          } else {
            if (currentPost) validatedPosts.push(currentPost.trim());
            currentPost = sentence;
          }
        }

        if (currentPost) validatedPosts.push(currentPost.trim());
      }
    }

    return new Response(
      JSON.stringify({ posts: validatedPosts }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
