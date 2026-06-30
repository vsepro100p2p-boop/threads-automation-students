import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callAI, hasAIKey, missingKeyError, AI_SETTINGS_COLUMNS } from '../_shared/ai.ts';

import { buildCors } from '../_shared/cors.ts';

function analyzeFormatting(posts: string[]): string {
  const combined = posts.join(' ');
  const features: string[] = [];

  const hasLineBreaks = posts.some(p => p.includes('\n\n'));
  const hasSingleBreaks = posts.some(p => /[^\n]\n[^\n]/.test(p));

  if (hasLineBreaks) features.push('двойные переносы строк (абзацы)');
  if (hasSingleBreaks) features.push('одинарные переносы строк');

  const hasBullets = /^[\-\•\*\→\►]\s/m.test(combined);
  const hasNumberedList = /^\d+[\.\)]\s/m.test(combined);
  if (hasBullets) features.push('маркированные списки');
  if (hasNumberedList) features.push('нумерованные списки');

  const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(combined);
  if (hasEmoji) features.push('эмодзи');

  const hasQuotes = /[«»""„]/.test(combined);
  if (hasQuotes) features.push('кавычки для цитат');

  const hasDash = /\s[—–]\s/.test(combined);
  if (hasDash) features.push('тире для пауз');

  return features.length > 0 ? features.join(', ') : 'простой текст';
}

function detectAuthorGender(posts: string[]): { gender: string; instruction: string; examples: string } {
  const combined = posts.join(' ').toLowerCase();

  const femaleMarkers = [
    /\bя\s+(сделала|написала|поняла|узнала|нашла|увидела|решила|начала|пошла|взяла|получила|работала|училась|жила|была|стала|смогла|хотела|думала|создала|открыла|построила|запустила|заработала|потеряла|научилась|попробовала|рассказала|показала|помогла|встретила|влюбилась|вышла|родила|вырастила|столкнулась|задумалась|заметила|почувствовала|испугалась|обрадовалась|расстроилась|удивилась|осознала|поверила|ошиблась|исправила|изменила|выросла|повзрослела|влюбилась|разочаровалась|вдохновилась|загорелась|выгорела|устала|отдохнула|вернулась|ушла|пришла|приехала|уехала|переехала|осталась|согласилась|отказалась|призналась|солгала|обманула|простила|извинилась|поблагодарила|попросила|ответила|спросила|сказала|промолчала|закричала|заплакала|засмеялась|улыбнулась|нахмурилась|задумалась|мечтала|надеялась|верила|сомневалась|боялась|рисковала|выиграла|проиграла|победила|сдалась|продолжила|остановилась|бросила|подняла|опустила|держала|отпустила|обняла|оттолкнула|приняла|отвергла|выбрала|отказалась|доверилась|разочаровалась)\b/i,
    /\bмоя\s+(история|жизнь|работа|карьера|ошибка|победа|проблема|задача|цель|мечта|идея|мысль|теория|практика|методика)\b/i,
    /\bкогда\s+я\s+была\b/i,
    /\bсама\s+(себе|по себе|того|справилась|разобралась|поняла|нашла|сделала)\b/i,
    /\bуверена\b/i,
    /\bсчастлива\b/i,
    /\bготова\b/i,
    /\bрада\b/i,
    /\bдовольна\b/i,
    /\bблагодарна\b/i,
    /\bгорда\b/i,
    /\bразочарована\b/i,
    /\bудивлена\b/i,
    /\bвзволнована\b/i,
    /\bрасстроена\b/i,
    /\bнапугана\b/i,
    /\bвдохновлена\b/i,
    /\bзамужем\b/i,
    /\bмама\b/i,
    /\bдочь\b/i,
    /\bсестра\b/i,
    /\bженщина\b/i,
    /\bдевушка\b/i,
    /\bподруга\b/i,
    /\bжена\b/i,
    /\bмать\b/i,
    /\bбабушка\b/i,
  ];

  const maleMarkers = [
    /\bя\s+(сделал|написал|понял|узнал|нашёл|нашел|увидел|решил|начал|пошёл|пошел|взял|получил|работал|учился|жил|был|стал|смог|хотел|думал|создал|открыл|построил|запустил|заработал|потерял|научился|попробовал|рассказал|показал|помог|встретил|влюбился|вышел|столкнулся|задумался|заметил|почувствовал|испугался|обрадовался|расстроился|удивился|осознал|поверил|ошибся|исправил|изменил|вырос|повзрослел|влюбился|разочаровался|вдохновился|загорелся|выгорел|устал|отдохнул|вернулся|ушёл|пришёл|приехал|уехал|переехал|остался|согласился|отказался|признался|солгал|обманул|простил|извинился|поблагодарил|попросил|ответил|спросил|сказал|промолчал|закричал|заплакал|засмеялся|улыбнулся|нахмурился|задумался|мечтал|надеялся|верил|сомневался|боялся|рисковал|выиграл|проиграл|победил|сдался|продолжил|остановился|бросил|поднял|опустил|держал|отпустил|обнял|оттолкнул|принял|отверг|выбрал|отказался|доверился|разочаровался)\b/i,
    /\bмой\s+(опыт|путь|бизнес|проект|успех|провал|план|метод|способ|подход)\b/i,
    /\bкогда\s+я\s+был\b/i,
    /\bсам\s+(себе|по себе|того|справился|разобрался|понял|нашёл|сделал)\b/i,
    /\bуверен\b/i,
    /\bсчастлив\b/i,
    /\bготов\b/i,
    /\bрад\b/i,
    /\bдоволен\b/i,
    /\bблагодарен\b/i,
    /\bгорд\b/i,
    /\bразочарован\b/i,
    /\bудивлён\b/i,
    /\bвзволнован\b/i,
    /\bрасстроен\b/i,
    /\bнапуган\b/i,
    /\bвдохновлён\b/i,
    /\bженат\b/i,
    /\bпапа\b/i,
    /\bсын\b/i,
    /\bбрат\b/i,
    /\bмужчина\b/i,
    /\bпарень\b/i,
    /\bдруг\b/i,
    /\bмуж\b/i,
    /\bотец\b/i,
    /\bдедушка\b/i,
  ];

  let femaleScore = 0;
  let maleScore = 0;

  for (const marker of femaleMarkers) {
    const matches = combined.match(new RegExp(marker.source, 'gi'));
    if (matches) femaleScore += matches.length;
  }
  for (const marker of maleMarkers) {
    const matches = combined.match(new RegExp(marker.source, 'gi'));
    if (matches) maleScore += matches.length;
  }

  console.log(`Gender detection - Female: ${femaleScore}, Male: ${maleScore}`);

  if (femaleScore > maleScore) {
    return {
      gender: 'ЖЕНСКИЙ',
      instruction: `АВТОР — ЖЕНЩИНА! Пиши ТОЛЬКО в женском роде:
- "я поняла", "я сделала", "я была", "я смогла", "я решила"
- "мне было страшно", "я почувствовала", "я осознала"
- НИКОГДА не используй мужской род: "понял", "сделал", "был", "смог"`,
      examples: 'Примеры: "Я поняла это, когда...", "Однажды я решила...", "Я была уверена, что...", "Мне удалось...", "Я столкнулась с..."'
    };
  }

  if (maleScore > femaleScore) {
    return {
      gender: 'МУЖСКОЙ',
      instruction: `АВТОР — МУЖЧИНА! Пиши ТОЛЬКО в мужском роде:
- "я понял", "я сделал", "я был", "я смог", "я решил"
- "мне было страшно", "я почувствовал", "я осознал"
- НИКОГДА не используй женский род: "поняла", "сделала", "была", "смогла"`,
      examples: 'Примеры: "Я понял это, когда...", "Однажды я решил...", "Я был уверен, что...", "Мне удалось...", "Я столкнулся с..."'
    };
  }

  return {
    gender: 'НЕЙТРАЛЬНЫЙ',
    instruction: 'Пол автора не определён. Используй нейтральные конструкции: "мне удалось", "получилось", "оказалось", "стало понятно".',
    examples: 'Примеры: "Мне удалось понять...", "Получилось найти...", "Стало ясно, что..."'
  };
}

function detectContentType(posts: string[]): string {
  const combined = posts.join(' ');

  if (/история|рассказ|однажды|когда я|помню|случилось|произошло/i.test(combined)) return 'personal_story';
  if (/совет|шаг|метод|способ|техника|инструкция|как\s/i.test(combined)) return 'practical_tips';
  if (/факт\s*[:#№]?\d|знаете ли|оказывается|учёные|исследовани/i.test(combined)) return 'facts';
  if (/ошибк[аи]|не делай|перестань|хватит|бросай/i.test(combined)) return 'mistakes';
  if (/список|подборка|топ|лучших|рекомендую/i.test(combined)) return 'listicle';
  if (/правда|на самом деле|никто не говорит|секрет/i.test(combined)) return 'revelation';
  if (/мотивац|не сдавайся|ты можешь|верь|сила/i.test(combined)) return 'motivation';
  return 'general';
}

function extractExpertIntro(firstPost: string): string {
  const patterns = [
    /^(Я\s+[^.]+\.\s*(?:Я\s+[^.]+\.\s*)?(?:И\s+[^.]+\.\s*)?)/m,
    /^(Я\s+[^.]+\.)/m,
    /^(Мне\s+\d+[^.]+\.\s*(?:Я\s+[^.]+\.\s*)?)/m,
    /^(За\s+\d+\s+лет[^.]+\.\s*(?:Я\s+[^.]+\.\s*)?)/m,
  ];

  for (const pattern of patterns) {
    const match = firstPost.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  const lines = firstPost.split('\n');
  if (lines.length > 1) {
    const firstLine = lines[0].trim();
    if (firstLine.length < 200 && /^(Я|Мне|За|Уже|Более)/i.test(firstLine)) {
      return firstLine;
    }
  }

  return '';
}

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
    const token = authHeader?.replace('Bearer ', '') || '';

    const { templateContent, variantCount, prompt, generationMode = 'creative', userId } = await req.json();

    let user;
    if (userId) {
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      user = userData?.user;
    } else {
      const { data: { user: authUser } } = await supabase.auth.getUser(token);
      user = authUser;
    }

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!templateContent || !Array.isArray(templateContent)) {
      return new Response(
        JSON.stringify({ error: 'Template content is required' }),
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
      .maybeSingle();

    if (!hasAIKey(aiSettings)) {
      return new Response(
        JSON.stringify({ error: missingKeyError(aiSettings) }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const postLengths = templateContent.map((p: string) => p.length);
    const formatting = analyzeFormatting(templateContent);
    const authorGender = detectAuthorGender(templateContent);
    const contentType = detectContentType(templateContent);

    const hasNumbering = templateContent.some((p: string) => /^(Совет|Пункт|Правило|Шаг|Урок|Секрет|Ошибка|Миф|Истина|Факт|Лайфхак|Привычка|Принцип|Метод|Способ|Техника|Трюк|Хак)\s*[#№]?\d+/i.test(p.trim()));
    const numberingMatch = templateContent[0]?.match(/^(Совет|Пункт|Правило|Шаг|Урок|Секрет|Ошибка|Миф|Истина|Факт|Лайфхак|Привычка|Принцип|Метод|Способ|Техника|Трюк|Хак)\s*[#№]?(\d+)/i);
    const numberingPrefix = numberingMatch ? numberingMatch[1] : null;

    const linkMatches = templateContent.join(' ').match(/https?:\/\/[^\s]+/g);
    const originalLinks = linkMatches ? [...new Set(linkMatches)] : [];

    const isFactsMode = generationMode === 'facts_with_intro' || generationMode === 'facts';
    const isRewriteMode = generationMode === 'rewrite';
    const expertIntro = extractExpertIntro(templateContent[0]);

    let systemMessage: string;
    let userMessage: string;
    let apiTemperature = 1.0;

    if (isRewriteMode) {
      apiTemperature = 0.4;

      systemMessage = `Ты — профессиональный рерайтер. Твоя задача — МИНИМАЛЬНО перефразировать текст, сохраняя 90-95% оригинального смысла, структуры, фактов, примеров и тона.

!!! КРИТИЧЕСКИ ВАЖНО — ПОЛ АВТОРА: ${authorGender.gender} !!!
${authorGender.instruction}
${authorGender.examples}

ПРАВИЛА РЕРАЙТА:
1. НЕ меняй смысл, факты, числа, имена, названия книг/инструментов
2. НЕ добавляй новую информацию
3. НЕ удаляй информацию из оригинала
4. Заменяй ТОЛЬКО:
   - Порядок слов в предложениях (где возможно без потери смысла)
   - Синонимы ("использовать" → "применять", "показать" → "продемонстрировать")
   - Незначительные перестройки фраз ("Я понял, что" → "До меня дошло, что")
   - Небольшие изменения в связках между предложениями
5. Сохраняй ВСЕ эмодзи, переносы строк, форматирование ТОЧНО как в оригинале
6. Сохраняй длину постов максимально близко к оригиналу
7. Сохраняй все ссылки ДОСЛОВНО
${originalLinks.length > 0 ? `8. Ссылки ДОСЛОВНО: ${originalLinks.join(', ')}` : ''}

ЦЕЛЬ: текст должен выглядеть «свежим» для алгоритмов соцсети (не дубликат), но читатель получает ТУ ЖЕ информацию и ТОТ ЖЕ посыл.

ФОРМАТ ОТВЕТА (JSON):
{
  "variants": [
    ["пост1 треда 1", "пост2 треда 1", ...${templateContent.length} постов],
    ...всего ${variantCount} тредов
  ]
}

ВАЖНО: variants — это массив из ${variantCount} ОТДЕЛЬНЫХ тредов. Каждый тред — массив из ${templateContent.length} постов.
Для переносов строк используй: \\n`;

      userMessage = `ОРИГИНАЛЬНЫЙ ТЕКСТ для рерайта (${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'}):

${templateContent.map((post: string, i: number) => `=== ПОСТ ${i + 1} (${post.length} симв.) ===\n${post}`).join('\n\n')}

${prompt ? `\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ: ${prompt}\n` : ''}
---

ЗАДАЧА: Сделай ${variantCount} МИНИМАЛЬНЫХ рерайтов этого текста.

Каждый рерайт должен:
- Иметь РОВНО ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'}
- Сохранять 90-95% оригинального текста
- Менять ТОЛЬКО порядок слов, синонимы и мелкие формулировки
- НЕ менять факты, числа, имена, примеры, ссылки
- Сохранять ВСЁ форматирование (абзацы, эмодзи, списки)
- Длина каждого поста: ${postLengths.map((len: number, i: number) => `пост${i+1}~${len}`).join(', ')} симв.

!!! ПОЛ АВТОРА: ${authorGender.gender} !!!
${authorGender.instruction}

РЕЗУЛЬТАТ: JSON с ${variantCount} рерайтами, каждый из ${templateContent.length} постов.`;

    } else if (isFactsMode) {
      const formattingInfo = analyzeFormatting(templateContent);

      const factStyles = [
        'КОНТРИНТУИТИВНЫЙ факт — то, что противоречит ожиданиям ("Люди думают X, но на самом деле Y")',
        'ШОКИРУЮЩАЯ статистика или число ("87% людей делают X, не подозревая о Y")',
        'МАЛОИЗВЕСТНОЕ открытие учёных ("Исследователи из [университет] доказали, что...")',
        'ПАРАДОКС — два противоречащих факта, которые оба правдивы',
        'ИСТОРИЧЕСКИЙ факт с неожиданной связью с современностью',
        'ПСИХОЛОГИЧЕСКИЙ эффект с названием ("Эффект Даннинга-Крюгера", "Закон Парето")',
        'БИОЛОГИЧЕСКИЙ механизм, объясняющий поведение ("Когда вы X, мозг выделяет Y")',
        'ЭКСПЕРИМЕНТ с удивительными результатами ("В 1971 году провели эксперимент...")',
      ];

      const randomSeeds = Array.from({ length: variantCount }, () =>
        Math.floor(Math.random() * factStyles.length)
      );

      systemMessage = `Ты — создатель виральных тредов с экспертными фактами. Твои факты ВСЕГДА вызывают реакцию "ого, не знал!" и желание переслать другу.

${expertIntro ? `КРИТИЧЕСКИ ВАЖНО — ВСТУПЛЕНИЕ АВТОРА:
Скопируй ДОСЛОВНО, БЕЗ ЕДИНОГО ИЗМЕНЕНИЯ:
"${expertIntro}"

Это вступление — личность автора. НЕ МЕНЯЙ НИ СЛОВА! Если там "мне 24 года" — пиши "мне 24 года". Если "я психолог" — пиши "я психолог". ДОСЛОВНО!
` : ''}
!!! КРИТИЧЕСКИ ВАЖНО — ПОЛ АВТОРА !!!
${authorGender.instruction}
${authorGender.examples}

ПСИХОЛОГИЯ ВИРАЛЬНЫХ ФАКТОВ:
1. CURIOSITY GAP — факт должен открывать "щель любопытства": читатель хочет узнать ПОЧЕМУ
2. SELF-REFERENCE — факт должен быть про ЧИТАТЕЛЯ ("Ваш мозг прямо сейчас...", "Каждый из нас...")
3. SURPRISE — факт ОБЯЗАН удивлять, опровергать бытовое представление
4. SPECIFICITY — конкретные числа, названия, имена учёных усиливают доверие
5. EMOTIONAL HOOK — факт должен вызывать эмоцию (удивление, страх, восторг, тревогу)

КАЧЕСТВО ФАКТОВ:
- Каждый факт должен быть ПРОВЕРЯЕМЫМ и правдоподобным
- НЕ используй банальности ("вода полезна", "сон важен")
- НЕ повторяй факты из шаблона — создавай НОВЫЕ
- Факты должны быть из РАЗНЫХ областей: нейронаука, психология, биология, социология, история
- Предпочитай факты с конкретными числами и именами

СТРОГАЯ СТРУКТУРА:
- РОВНО ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'} в каждом треде — НЕ БОЛЬШЕ, НЕ МЕНЬШЕ!
- Если в оригинале 1 ветка — генерируй 1 ветку. Если 2 — генерируй 2. И т.д.
- Форматирование: ${formattingInfo}
- Каждый пост до 500 символов
- Сохрани абзацы, переносы строк, эмодзи КАК В ОРИГИНАЛЕ

ФОРМАТ ОТВЕТА (JSON):
{
  "variants": [
    ["пост1 треда 1", "пост2 треда 1", ...${templateContent.length} постов],
    ["пост1 треда 2", "пост2 треда 2", ...${templateContent.length} постов],
    ...всего ${variantCount} тредов
  ]
}

ВАЖНО: variants — это массив из ${variantCount} ОТДЕЛЬНЫХ тредов. Каждый тред — массив из ${templateContent.length} постов.
НЕ путай посты внутри треда с отдельными тредами!
Для переносов строк используй: \\n`;

      userMessage = `ОРИГИНАЛЬНЫЙ ШАБЛОН для анализа стиля (${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'}):

${templateContent.map((p: string, i: number) => `=== ПОСТ ${i + 1} (${p.length} симв.) ===\n${p}`).join('\n\n')}

---

ЗАДАЧА: Создай ${variantCount} ОТДЕЛЬНЫХ тредов с УДИВИТЕЛЬНЫМИ фактами.

Каждый тред должен:
- Иметь ТОЧНО такую же структуру как оригинал (${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'})
- Копировать стиль, тон и форматирование оригинала
- Содержать НОВЫЕ уникальные факты (не из оригинала!)

!!! ПОЛ АВТОРА: ${authorGender.gender} !!!
${authorGender.instruction}

СТИЛИ ФАКТОВ для каждого треда:
${Array.from({length: variantCount}, (_, i) => `Тред ${i+1}: ${factStyles[randomSeeds[i]]}`).join('\n')}

ОБЯЗАТЕЛЬНО:
1. ${expertIntro ? `Вступление ДОСЛОВНО: "${expertIntro}"` : 'Сохрани стиль вступления из оригинала'}
2. Структура: ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'} в КАЖДОМ из ${variantCount} тредов
3. Длина постов примерно: ${postLengths.map((len: number, i: number) => `пост${i+1}~${len}`).join(', ')} симв.
4. Форматирование (абзацы, переносы) — как в оригинале

РЕЗУЛЬТАТ: JSON с ${variantCount} отдельными тредами, каждый из ${templateContent.length} постов.`;

    } else {
      const contentTypeHints: Record<string, string> = {
        personal_story: 'Расскажи ДРУГУЮ личную историю с таким же эмоциональным накалом. Новый конфликт, новый урок, новый поворот.',
        practical_tips: 'Дай ДРУГИЕ практические советы, которые читатель может применить СЕГОДНЯ. Конкретика, шаги, результат.',
        facts: 'Приведи ДРУГИЕ удивительные факты. Каждый факт должен вызывать желание переслать другу.',
        mistakes: 'Опиши ДРУГИЕ типичные ошибки. Читатель должен узнать СЕБЯ в каждой ошибке.',
        listicle: 'Составь НОВЫЙ список с другими пунктами. Каждый пункт — микро-инсайт.',
        revelation: 'Раскрой ДРУГИЕ неочевидные истины. "На самом деле" — твой главный инструмент.',
        motivation: 'Создай НОВЫЙ мотивационный нарратив. Другая метафора, другой путь, тот же огонь.',
        general: 'Создай полностью НОВЫЙ контент на ту же тему с другого ракурса.',
      };

      const viralHooks = [
        'ОТКРЫТАЯ ПЕТЛЯ: начни с интриги, ответ на которую — в последнем посте',
        'ПАТТЕРН-ПРЕРЫВАТЕЛЬ: первое предложение должно сломать ожидание ("Я заработал миллион и потерял всё за неделю")',
        'ПРИЗНАНИЕ: начни с честного признания ("Я 5 лет делал это неправильно")',
        'ПРОВОКАЦИЯ: брось вызов убеждению аудитории ("Всё, что вы знаете о X — неправда")',
        'КОНКРЕТНОЕ ЧИСЛО: начни с числа, которое шокирует ("3 минуты. Столько нужно, чтобы...")',
        'КОНТРАСТ: покажи разрыв между ожиданием и реальностью ("Все говорят X. Реальность: Y")',
        'ВОПРОС-ТРИГГЕР: задай вопрос, на который читатель не может не ответить мысленно',
        'МИКРО-ИСТОРИЯ: начни с конкретной сцены ("Стою на кухне, 3 часа ночи, в руках телефон...")',
      ];

      const emotionalAngles = [
        'Напиши так, чтобы читатель подумал "это про меня" — используй узнаваемые ситуации',
        'Создай ощущение инсайда — будто делишься секретом, который знают только избранные',
        'Вызови лёгкую тревогу через FOMO — читатель должен почувствовать "я что-то упускаю"',
        'Построй мини-историю с конфликтом: было плохо → нашёл решение → стало хорошо',
        'Обрати внимание на деталь, мимо которой все проходят — это создаёт эффект "открытых глаз"',
        'Используй социальное доказательство — ссылки на опыт многих ("9 из 10 людей...")',
        'Создай эффект "я знал, но не мог сформулировать" — облеки интуицию в слова',
        'Используй контраст "до/после" — покажи трансформацию',
      ];

      const randomSeed = Math.floor(Math.random() * 1000000);

      systemMessage = `Ты — аналитик виральности и топовый копирайтер. Ты РАЗГАДЫВАЕШЬ секрет виральности шаблона и ПОВТОРЯЕШЬ этот успех.

ТВОЯ ЗАДАЧА В 3 ШАГА:

ШАГ 1 — АНАЛИЗ ВИРАЛЬНОСТИ:
Прочитай шаблон и определи:
- Какой ЭМОЦИОНАЛЬНЫЙ ТРИГГЕР? (узнавание себя, страх упустить, инсайт, провокация)
- Какой КРЮЧОК? (вопрос, заявление, история, число, признание)
- Какая СТРУКТУРА? (нарастание, разоблачение, перечисление, история с поворотом)
- ПОЧЕМУ люди сохраняют? (польза, эмоция, "это про меня", шок)

ШАГ 2 — СОХРАНЕНИЕ ЛИЧНОСТИ:
${expertIntro ? `ВСТУПЛЕНИЕ АВТОРА — копируй ДОСЛОВНО:\n"${expertIntro}"\nНЕ МЕНЯЙ НИ СЛОВА! Если "мне 24 года" — пиши "мне 24 года". Если "я психолог" — пиши "я психолог".\n` : ''}
!!! КРИТИЧЕСКИ ВАЖНО — ПОЛ АВТОРА: ${authorGender.gender} !!!
${authorGender.instruction}
${authorGender.examples}

- ТОН, стиль, манера речи — ТОЧНО как в оригинале

ШАГ 3 — СОЗДАНИЕ НОВОГО КОНТЕНТА:
- Используй ТОТ ЖЕ механизм виральности
- Тот же тип крючка, та же эмоциональная структура
- НОВАЯ тема/история, но ТОТ ЖЕ подход

ТИП КОНТЕНТА: ${contentType} → ${contentTypeHints[contentType] || contentTypeHints.general}

СТРОГИЕ ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ:
- РОВНО ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'} — НЕ БОЛЬШЕ, НЕ МЕНЬШЕ!
- Длина: ${postLengths.map((len: number, i: number) => `П${i+1}=${len}±30`).join(', ')} симв.
- ФОРМАТИРОВАНИЕ: ${formatting}
- Абзацы и переносы — ТОЧНО как в оригинале
- Эмодзи: только если есть в оригинале
${originalLinks.length > 0 ? `- Ссылки ДОСЛОВНО: ${originalLinks.join(', ')}` : ''}
${hasNumbering ? `- Нумерация "${numberingPrefix} N:" — формат сохрани, номера СЛУЧАЙНЫЕ` : '- БЕЗ нумерации'}

ФОРМАТ ОТВЕТА (JSON):
{
  "variants": [
    ["пост1 треда 1", "пост2 треда 1", ...${templateContent.length} постов],
    ["пост1 треда 2", "пост2 треда 2", ...${templateContent.length} постов],
    ...всего ${variantCount} тредов
  ]
}

ВАЖНО: variants — это массив из ${variantCount} ОТДЕЛЬНЫХ тредов. Каждый тред — массив из ${templateContent.length} постов.
НЕ путай посты внутри треда с отдельными тредами!
Для переносов строк используй: \\n`;

      const randomFactNumbers = Array.from({ length: variantCount }, () =>
        Math.floor(Math.random() * 900) + 100
      );

      userMessage = `ОРИГИНАЛЬНЫЙ ШАБЛОН для анализа и копирования стиля (${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'}):

${templateContent.map((post: string, i: number) => {
  const lineBreaks = (post.match(/\n/g) || []).length;
  const paragraphs = post.split(/\n\n+/).length;
  return `=== ПОСТ ${i + 1} (${post.length} симв., ${paragraphs} абзац., ${lineBreaks} переносов) ===
${post}`;
}).join('\n\n')}

${prompt ? `\nДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ: ${prompt}\n` : ''}
---

ЗАДАЧА: Создай ${variantCount} ОТДЕЛЬНЫХ тредов, копируя стиль и структуру оригинала.

Каждый тред должен:
- Иметь ТОЧНО ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'} (как в оригинале)
- Копировать стилистику, тон, манеру речи оригинала
- Содержать НОВЫЙ уникальный контент на похожую тему
- Использовать те же приёмы виральности

${expertIntro ? `ВСТУПЛЕНИЕ автора (копируй ДОСЛОВНО): "${expertIntro}"\n` : ''}
ВИРАЛЬНЫЕ ПОДХОДЫ для каждого треда:
${Array.from({length: variantCount}, (_, i) => {
  const hookIdx = (randomSeed + i * 7919) % viralHooks.length;
  const emotionIdx = (randomSeed + i * 3571) % emotionalAngles.length;
  return `Тред ${i+1}: ${viralHooks[hookIdx]}${hasNumbering ? ` (номер: ${randomFactNumbers[i]})` : ''}`;
}).join('\n')}

!!! ПОЛ АВТОРА: ${authorGender.gender} !!!
${authorGender.instruction}

ОБЯЗАТЕЛЬНО:
1. Структура: ${templateContent.length} ${templateContent.length === 1 ? 'пост' : 'поста'} в КАЖДОМ из ${variantCount} тредов
2. Форматирование (абзацы, переносы, эмодзи) — как в оригинале
3. Длина постов примерно: ${postLengths.map((len: number, i: number) => `пост${i+1}~${len}`).join(', ')} симв.

РЕЗУЛЬТАТ: JSON с ${variantCount} отдельными тредами, каждый из ${templateContent.length} постов.`;
    }

    const content = await callAI(aiSettings, {
      system: systemMessage,
      prompt: userMessage,
      temperature: apiTemperature,
      maxTokens: 8192,
      json: true,
    });

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response:', content);

    let parsed;
    try {
      const jsonData = JSON.parse(content);
      parsed = jsonData.variants || jsonData.threads || jsonData;

      if (!Array.isArray(parsed)) {
        const keys = Object.keys(jsonData);
        for (const key of keys) {
          if (Array.isArray(jsonData[key])) {
            parsed = jsonData[key];
            break;
          }
        }
      }
    } catch (parseError: any) {
      console.error('Parse error:', parseError.message, 'Content:', content.substring(0, 500));
      throw new Error('Failed to parse AI response');
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Invalid response format');
    }

    const validatedVariants = [];
    for (const variant of parsed) {
      if (!Array.isArray(variant)) continue;

      const validatedPosts = [];
      for (const post of variant) {
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
                  currentPost = part.substring(0, 495) + '...';
                }
              }
            } else if ((currentPost + ' ' + sentence).length <= 500) {
              currentPost += (currentPost ? ' ' : '') + sentence;
            } else {
              if (currentPost) validatedPosts.push(currentPost.trim());
              currentPost = sentence;
            }
          }

          if (currentPost) validatedPosts.push(currentPost.trim());
        }
      }

      if (validatedPosts.length > 0) {
        validatedVariants.push(validatedPosts);
      }
    }

    return new Response(
      JSON.stringify({ variants: validatedVariants }),
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
