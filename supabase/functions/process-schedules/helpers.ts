// Helper'ы process-schedules: генерация контента, публикация в Threads,
// расчёт окна расписания. Вынесены из index.ts, чтобы там осталась только
// оркестрация. Зависят лишь от decryptSecret (токены в БД зашифрованы).
import { decryptSecret } from '../_shared/crypto.ts';

export function getUserHour(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  });
  const hourStr = formatter.format(now);
  return parseInt(hourStr, 10);
}

export function calculateNextPostInWindow(frequencyMinutes: number, startHour: number, endHour: number, timezone: string): Date {
  const now = new Date();
  const currentHour = getUserHour(timezone);

  let isInWindow = false;
  if (startHour <= endHour) {
    isInWindow = currentHour >= startHour && currentHour < endHour;
  } else {
    isInWindow = currentHour >= startHour || currentHour < endHour;
  }

  if (isInWindow) {
    return new Date(now.getTime() + frequencyMinutes * 60000);
  }

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = tzFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';

  const tzYear = parseInt(getPart('year'), 10);
  const tzMonth = parseInt(getPart('month'), 10) - 1;
  const tzDay = parseInt(getPart('day'), 10);

  let targetDate = new Date(Date.UTC(tzYear, tzMonth, tzDay, startHour, 0, 0));

  if (currentHour >= endHour || currentHour < startHour) {
    if (startHour <= endHour) {
      if (currentHour >= endHour) {
        targetDate = new Date(Date.UTC(tzYear, tzMonth, tzDay + 1, startHour, 0, 0));
      }
    } else {
      if (currentHour < startHour && currentHour >= endHour) {
        targetDate = new Date(Date.UTC(tzYear, tzMonth, tzDay, startHour, 0, 0));
      }
    }
  }

  const tzOffset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime();
  return new Date(targetDate.getTime() + tzOffset);
}

/**
 * Следующее время публикации для режима «точное время».
 * times — список 'HH:MM' в часовом поясе пользователя (например 10:00, 12:00…).
 * Возвращает ближайший будущий момент среди этих времён (сегодня, если ещё не
 * наступил; иначе самое раннее завтра), как UTC-Date.
 */
export function calculateNextExactTime(times: string[], timezone: string): Date {
  const now = new Date();

  // Парсим в «минуты от полуночи», валидируем, сортируем, убираем дубликаты.
  const mins = Array.from(
    new Set(
      (times || [])
        .map((t) => {
          const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
          if (!m) return NaN;
          const h = parseInt(m[1], 10);
          const mm = parseInt(m[2], 10);
          if (h < 0 || h > 23 || mm < 0 || mm > 59) return NaN;
          return h * 60 + mm;
        })
        .filter((v) => Number.isFinite(v)) as number[],
    ),
  ).sort((a, b) => a - b);

  // Нет валидных времён — подстраховка: через час.
  if (mins.length === 0) {
    return new Date(now.getTime() + 60 * 60000);
  }

  // Текущие «минуты от полуночи» в часовом поясе пользователя.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  const year = get('year');
  const month = get('month') - 1;
  const day = get('day');
  let hour = get('hour');
  if (hour === 24) hour = 0; // некоторые среды дают '24' в полночь
  const minute = get('minute');
  const curMinutes = hour * 60 + minute;

  // Ближайшее время строго позже текущей минуты; иначе — первое завтра.
  let target = mins.find((v) => v > curMinutes);
  let dayOffset = 0;
  if (target === undefined) {
    target = mins[0];
    dayOffset = 1;
  }
  const th = Math.floor(target / 60);
  const tm = target % 60;

  // Целевое «локальное» время трактуем как UTC, затем сдвигаем на смещение TZ.
  const targetAsUTC = new Date(Date.UTC(year, month, day + dayOffset, th, tm, 0));
  const tzOffset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: timezone })).getTime();
  return new Date(targetAsUTC.getTime() + tzOffset);
}

export function analyzeFormatting(posts: string[]): string {
  const combined = posts.join(' ');
  const features: string[] = [];

  const hasLineBreaks = posts.some(p => p.includes('\n\n'));
  const hasSingleBreaks = posts.some(p => /[^\n]\n[^\n]/.test(p));

  if (hasLineBreaks) features.push('абзацы (двойные переносы)');
  if (hasSingleBreaks) features.push('переносы строк');

  const hasBullets = /^[\-\•\*\→\►]\s/m.test(combined);
  const hasNumberedList = /^\d+[\.\)]\s/m.test(combined);
  if (hasBullets) features.push('маркированные списки');
  if (hasNumberedList) features.push('нумерованные списки');

  const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(combined);
  if (hasEmoji) features.push('эмодзи');

  return features.length > 0 ? features.join(', ') : 'простой текст';
}

export function detectAuthorGender(posts: string[]): string {
  const combined = posts.join(' ').toLowerCase();

  const femaleMarkers = [
    /\bя\s+(сделала|написала|поняла|узнала|нашла|увидела|решила|начала|пошла|взяла|получила|работала|училась|жила|была|стала|смогла|хотела|думала|создала|открыла|построила|запустила|заработала|потеряла|научилась|попробовала|рассказала|показала|помогла|встретила|влюбилась|вышла|родила|вырастила)\b/i,
    /\bмоя\s+(история|жизнь|работа|карьера|ошибка|победа)\b/i,
    /\bкогда\s+я\s+была\b/i,
    /\bсама\s+(себе|по себе|того)\b/i,
    /\bуверена\b/i,
    /\bсчастлива\b/i,
    /\bготова\b/i,
    /\bрада\b/i,
  ];

  const maleMarkers = [
    /\bя\s+(сделал|написал|понял|узнал|нашёл|нашел|увидел|решил|начал|пошёл|пошел|взял|получил|работал|учился|жил|был|стал|смог|хотел|думал|создал|открыл|построил|запустил|заработал|потерял|научился|попробовал|рассказал|показал|помог|встретил|влюбился|вышел)\b/i,
    /\bмой\s+(опыт|путь|бизнес|проект|успех|провал)\b/i,
    /\bкогда\s+я\s+был\b/i,
    /\bсам\s+(себе|по себе|того)\b/i,
    /\bуверен\b/i,
    /\bсчастлив\b/i,
    /\bготов\b/i,
    /\bрад\b/i,
  ];

  let femaleScore = 0;
  let maleScore = 0;

  for (const marker of femaleMarkers) {
    if (marker.test(combined)) femaleScore++;
  }
  for (const marker of maleMarkers) {
    if (marker.test(combined)) maleScore++;
  }

  if (femaleScore > maleScore) return 'ЖЕНСКИЙ (она, делала, была, смогла)';
  if (maleScore > femaleScore) return 'МУЖСКОЙ (он, делал, был, смог)';
  return 'нейтральный';
}
export async function generateSinglePost(aiSettings: any): Promise<string> {
  const templates = [
    "Просто осознал, что {topic} гораздо интереснее, чем я думал. 🤔",
    "Горячее мнение: {topic} не получает достаточно внимания.",
    "Три вещи о {topic}, которые взорвали мой мозг...",
    "Почему никто не говорит о {topic}? 🤔",
    "Честно: {topic} недооценен, и вот почему.",
  ];

  const topics = aiSettings.topics && aiSettings.topics.length > 0
    ? aiSettings.topics
    : ['продуктивность', 'технологии', 'личный рост', 'творчество'];

  const template = templates[Math.floor(Math.random() * templates.length)];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  return template.replace('{topic}', topic);
}

export async function generateThread(aiSettings: any, count: number): Promise<string[]> {
  const thread: string[] = [];
  const topics = aiSettings.topics && aiSettings.topics.length > 0
    ? aiSettings.topics
    : ['технологии', 'образование', 'творчество', 'бизнес'];

  const topic = topics[Math.floor(Math.random() * topics.length)];

  thread.push(`Тред о ${topic} 🧵`);

  for (let i = 1; i < count - 1; i++) {
    thread.push(`${i}/ Важная мысль о ${topic}, которую стоит рассмотреть.`);
  }

  if (count > 1) {
    thread.push(`Вот и все! Что думаете? 💭`);
  }

  return thread.slice(0, count);
}

export async function publishSinglePost(
  userId: string,
  accessToken: string,
  text: string
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  accessToken = (await decryptSecret(accessToken)) as string;
  try {
    console.log('Creating single post container for user:', userId);
    const createResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: 'TEXT',
          text,
          access_token: accessToken,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Container creation failed:', errorText);
      return { success: false, error: `Failed to create: ${errorText}` };
    }

    const { id: containerId } = await createResponse.json();
    console.log('Container created:', containerId);

    const statusCheck = await checkContainerStatus(userId, containerId, accessToken);
    if (!statusCheck.success) {
      return { success: false, error: statusCheck.error };
    }

    console.log('Publishing container:', containerId);
    const publishResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      console.error('Publish failed:', errorText);
      return { success: false, error: `Failed to publish: ${errorText}` };
    }

    const { id: postId } = await publishResponse.json();
    const url = `https://www.threads.net/t/${postId}`;
    console.log('Post published successfully:', postId);

    return { success: true, postId, url };
  } catch (error) {
    console.error('Unexpected error in publishSinglePost:', error);
    return { success: false, error: error.message };
  }
}

export async function publishThread(
  userId: string,
  accessToken: string,
  texts: string[]
): Promise<{ success: boolean; postId?: string; url?: string; error?: string; publishedCount?: number }> {
  accessToken = (await decryptSecret(accessToken)) as string;
  let firstPostId: string | null = null;
  let lastPublishedPostId: string | null = null;
  let publishedCount = 0;

  try {
    console.log(`Creating thread with ${texts.length} posts for user:`, userId);

    for (let i = 0; i < texts.length; i++) {
      const body: any = {
        media_type: 'TEXT',
        text: texts[i],
        access_token: accessToken,
      };

      if (i > 0 && lastPublishedPostId) {
        body.reply_to_id = lastPublishedPostId;
      }

      console.log(`Creating container ${i + 1}/${texts.length}`);
      const createResponse = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error(`Container ${i + 1} creation failed:`, errorText);
        return {
          success: false,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Failed to create post ${i + 1}/${texts.length}: ${errorText} (${publishedCount}/${texts.length} posts published)`,
          publishedCount,
        };
      }

      const { id: containerId } = await createResponse.json();
      console.log(`Container ${i + 1} created:`, containerId);

      const statusCheck = await checkContainerStatus(userId, containerId, accessToken);
      if (!statusCheck.success) {
        return {
          success: false,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Post ${i + 1}/${texts.length} status failed: ${statusCheck.error} (${publishedCount}/${texts.length} posts published)`,
          publishedCount,
        };
      }

      console.log(`Publishing container ${i + 1}:`, containerId);
      const publishResponse = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads_publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
          }),
        }
      );

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        console.error(`Publish ${i + 1} failed:`, errorText);
        return {
          success: false,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Failed to publish post ${i + 1}/${texts.length}: ${errorText} (${publishedCount}/${texts.length} posts published)`,
          publishedCount,
        };
      }

      const { id: publishedPostId } = await publishResponse.json();
      publishedCount++;
      console.log(`Post ${i + 1} published:`, publishedPostId);

      if (i === 0) {
        firstPostId = publishedPostId;
      }
      lastPublishedPostId = publishedPostId;

      if (i < texts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const url = `https://www.threads.net/t/${firstPostId}`;
    console.log('Thread completed successfully. First post:', firstPostId);

    return { success: true, postId: firstPostId!, url, publishedCount };
  } catch (error) {
    console.error('Unexpected error in publishThread:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      postId: firstPostId || undefined,
      url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
      error: `${errorMessage} (${publishedCount}/${texts.length} posts published)`,
      publishedCount,
    };
  }
}

export async function checkContainerStatus(
  userId: string,
  containerId: string,
  accessToken: string,
  maxAttempts: number = 10,
  delayMs: number = 1000
): Promise<{ success: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const statusResponse = await fetch(
        `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('Status check failed:', errorText);
        return { success: false, error: `Status check failed: ${errorText}` };
      }

      const statusData = await statusResponse.json();
      console.log(`Container ${containerId} status (attempt ${attempt}):`, statusData.status);

      if (statusData.status === 'FINISHED') {
        return { success: true };
      }

      if (statusData.status === 'ERROR') {
        const errorMsg = statusData.error_message || 'Unknown error';
        console.error('Container error:', errorMsg);
        return { success: false, error: `Container failed: ${errorMsg}` };
      }

      if (statusData.status === 'EXPIRED') {
        return { success: false, error: 'Container expired' };
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error('Error checking status:', error);
      if (attempt === maxAttempts) {
        return { success: false, error: `Status check check error: ${error.message}` };
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { success: false, error: 'Container timeout' };
}

export function processTemplate(content: string[], timezone: string = 'UTC'): string[] {
  const now = new Date();
  const tzOpts = { timeZone: timezone };
  const replacements: Record<string, string> = {
    '{date}': now.toLocaleDateString('ru', tzOpts),
    '{time}': now.toLocaleTimeString('ru', { ...tzOpts, hour: '2-digit', minute: '2-digit' }),
    '{day}': now.toLocaleDateString('ru', { ...tzOpts, weekday: 'long' }),
    '{month}': now.toLocaleDateString('ru', { ...tzOpts, month: 'long' }),
    '{year}': new Intl.DateTimeFormat('en', { ...tzOpts, year: 'numeric' }).format(now),
  };

  return content.map(post => {
    let processed = post;
    for (const [key, value] of Object.entries(replacements)) {
      processed = processed.replace(new RegExp(key, 'g'), value);
    }
    return processed;
  });
}

export async function publishSingleImage(
  userId: string,
  accessToken: string,
  text: string,
  imageUrl: string
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  accessToken = (await decryptSecret(accessToken)) as string;
  try {
    console.log('Creating single image post for user:', userId);

    const body: any = {
      media_type: 'IMAGE',
      image_url: imageUrl,
      access_token: accessToken,
    };
    if (text && text.trim()) {
      body.text = text;
    }

    const createResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return { success: false, error: `Failed to create image post: ${errorText}` };
    }

    const { id: containerId } = await createResponse.json();
    const statusCheck = await checkContainerStatus(userId, containerId, accessToken, 30, 2000);
    if (!statusCheck.success) {
      return { success: false, error: `Image processing failed: ${statusCheck.error}` };
    }

    const publishResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      return { success: false, error: `Failed to publish image post: ${errorText}` };
    }

    const { id: postId } = await publishResponse.json();
    return { success: true, postId, url: `https://www.threads.net/t/${postId}` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function publishCarousel(
  userId: string,
  accessToken: string,
  text: string,
  imageUrls: string[]
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  accessToken = (await decryptSecret(accessToken)) as string;
  try {
    if (imageUrls.length === 1) {
      return publishSingleImage(userId, accessToken, text, imageUrls[0]);
    }

    console.log(`Creating carousel with ${imageUrls.length} images for user:`, userId);

    if (imageUrls.length > 20) {
      return { success: false, error: 'Maximum 20 images allowed in carousel' };
    }

    const itemContainerIds: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      console.log(`Creating carousel item ${i + 1}/${imageUrls.length}`);

      const createItemResponse = await fetch(
        `https://graph.threads.net/v1.0/${userId}/threads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            media_type: 'IMAGE',
            image_url: imageUrls[i],
            is_carousel_item: true,
            access_token: accessToken,
          }),
        }
      );

      if (!createItemResponse.ok) {
        const errorText = await createItemResponse.text();
        console.error(`Carousel item ${i + 1} creation failed:`, errorText);
        return { success: false, error: `Failed to create carousel item ${i + 1}: ${errorText}` };
      }

      const { id: itemContainerId } = await createItemResponse.json();
      console.log(`Carousel item ${i + 1} container created:`, itemContainerId);

      const statusCheck = await checkContainerStatus(userId, itemContainerId, accessToken, 30, 2000);
      if (!statusCheck.success) {
        return { success: false, error: `Carousel item ${i + 1} failed: ${statusCheck.error}` };
      }

      itemContainerIds.push(itemContainerId);
    }

    console.log('Creating carousel container with items:', itemContainerIds);

    const carouselBody: any = {
      media_type: 'CAROUSEL',
      children: itemContainerIds.join(','),
      access_token: accessToken,
    };

    if (text && text.trim()) {
      carouselBody.text = text;
    }

    const createCarouselResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carouselBody),
      }
    );

    if (!createCarouselResponse.ok) {
      const errorText = await createCarouselResponse.text();
      console.error('Carousel container creation failed:', errorText);
      return { success: false, error: `Failed to create carousel: ${errorText}` };
    }

    const { id: carouselContainerId } = await createCarouselResponse.json();
    console.log('Carousel container created:', carouselContainerId);

    const carouselStatusCheck = await checkContainerStatus(userId, carouselContainerId, accessToken, 30, 2000);
    if (!carouselStatusCheck.success) {
      return { success: false, error: `Carousel processing failed: ${carouselStatusCheck.error}` };
    }

    console.log('Publishing carousel:', carouselContainerId);
    const publishResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselContainerId,
          access_token: accessToken,
        }),
      }
    );

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      console.error('Carousel publish failed:', errorText);
      return { success: false, error: `Failed to publish carousel: ${errorText}` };
    }

    const { id: postId } = await publishResponse.json();
    const url = `https://www.threads.net/t/${postId}`;
    console.log('Carousel published successfully:', postId);

    return { success: true, postId, url };
  } catch (error: any) {
    console.error('Unexpected error in publishCarousel:', error);
    return { success: false, error: error.message };
  }
}
