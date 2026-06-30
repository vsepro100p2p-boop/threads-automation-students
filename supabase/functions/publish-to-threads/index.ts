import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildCors } from '../_shared/cors.ts';
import { decryptSecret } from '../_shared/crypto.ts';

interface PublishRequest {
  accountId?: string;
  content?: string | string[];
  userId?: string;
  accessToken?: string;
  texts?: string[];
  mediaUrls?: string[];
  isThread?: boolean;
  isCarousel?: boolean;
  generatedByAi?: boolean;
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

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body: PublishRequest = await req.json();

    if (body.userId && body.accessToken && body.texts) {
      let result;
      // Токен мог прийти из БД уже зашифрованным — расшифровываем (легаси-плейнтекст
      // вернётся как есть).
      const byoToken = (await decryptSecret(body.accessToken)) as string;

      if (body.mediaUrls && body.mediaUrls.length > 0) {
        result = await publishCarousel(body.userId, byoToken, body.texts[0] || '', body.mediaUrls);
      } else if (body.texts.length > 1) {
        result = await publishThread(body.userId, byoToken, body.texts);
      } else {
        result = await publishToThreads(body.userId, byoToken, body.texts[0]);
      }

      return new Response(
        JSON.stringify(result),
        {
          status: result.success ? 200 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { accountId, content, mediaUrls } = body;
    const contentArray = Array.isArray(content) ? content : (content ? [content] : []);
    const contentText = contentArray[0] || '';

    if (!accountId || (!contentText && (!mediaUrls || mediaUrls.length === 0))) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: account } = await supabase
      .from('threads_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return new Response(
        JSON.stringify({ error: 'Account not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (account.is_demo || account.access_token === 'demo') {
      return new Response(
        JSON.stringify({ error: 'Демо-аккаунт: публикация недоступна. Подключите реальный аккаунт Threads.' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // access_token хранится зашифрованным — расшифровываем перед обращением к API.
    const accountToken = (await decryptSecret(account.access_token)) as string;

    let result;
    if (mediaUrls && mediaUrls.length > 0) {
      result = await publishCarousel(
        account.threads_user_id,
        accountToken,
        contentText,
        mediaUrls
      );
    } else if (contentArray.length > 1) {
      result = await publishThread(
        account.threads_user_id,
        accountToken,
        contentArray
      );
    } else {
      result = await publishToThreads(
        account.threads_user_id,
        accountToken,
        contentText
      );
    }

    await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        threads_account_id: accountId,
        content: contentText,
        thread_content: contentArray,
        media_urls: mediaUrls || [],
        is_thread: contentArray.length > 1 && (!mediaUrls || mediaUrls.length === 0),
        status: result.success ? 'published' : 'failed',
        threads_post_id: result.postId || null,
        threads_post_url: result.url || null,
        published_at: result.success ? new Date().toISOString() : null,
        error_message: result.error || null,
        generated_by_ai: body.generatedByAi ?? false,
      });

    return new Response(
      JSON.stringify({ success: result.success, error: result.error, postId: result.postId, url: result.url }),
      {
        status: result.success ? 200 : 500,
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

async function publishSingleImage(
  userId: string,
  accessToken: string,
  text: string,
  imageUrl: string
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
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

async function publishCarousel(
  userId: string,
  accessToken: string,
  text: string,
  imageUrls: string[]
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
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

async function publishToThreads(
  userId: string,
  accessToken: string,
  text: string
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    console.log('Creating media container for user:', userId);
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
      return { success: false, error: `Failed to create container: ${errorText}` };
    }

    const createData = await createResponse.json();
    const containerId = createData.id;
    console.log('Container created:', containerId);

    const statusCheckResult = await checkContainerStatus(userId, containerId, accessToken);
    if (!statusCheckResult.success) {
      return { success: false, error: statusCheckResult.error };
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

    const publishData = await publishResponse.json();
    const postId = publishData.id;
    const url = `https://www.threads.net/t/${postId}`;
    console.log('Post published successfully:', postId);

    return { success: true, postId, url };
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return { success: false, error: error.message };
  }
}

async function checkContainerStatus(
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
        if (attempt === maxAttempts) {
          return { success: false, error: `Status check failed: ${errorText}` };
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      const statusData = await statusResponse.json();
      console.log('Container status:', statusData);

      if (statusData.status === 'FINISHED') {
        console.log('Container is ready for publishing');
        return { success: true };
      }

      if (statusData.status === 'ERROR') {
        const errorMsg = statusData.error_message || 'Unknown error during container creation';
        console.error('Container creation error:', errorMsg);
        return { success: false, error: `Container creation failed: ${errorMsg}` };
      }

      if (statusData.status === 'EXPIRED') {
        console.error('Container has expired');
        return { success: false, error: 'Container expired before publishing' };
      }

      if (attempt < maxAttempts) {
        console.log(`Container status is ${statusData.status}, waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error: any) {
      console.error('Error checking container status:', error);
      if (attempt === maxAttempts) {
        return { success: false, error: `Status check error: ${error.message}` };
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { success: false, error: 'Container did not become ready within timeout period' };
}

async function publishThread(
  userId: string,
  accessToken: string,
  texts: string[]
): Promise<{ success: boolean; postId?: string; url?: string; error?: string; publishedCount?: number }> {
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
        const partial = publishedCount > 0;
        return {
          success: partial,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Failed to create post ${i + 1}/${texts.length}: ${errorText}${partial ? ` (${publishedCount}/${texts.length} posts published)` : ''}`,
          publishedCount,
        };
      }

      const { id: containerId } = await createResponse.json();
      console.log(`Container ${i + 1} created:`, containerId);

      const statusCheck = await checkContainerStatus(userId, containerId, accessToken);
      if (!statusCheck.success) {
        const partial = publishedCount > 0;
        return {
          success: partial,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Post ${i + 1}/${texts.length} status failed: ${statusCheck.error}${partial ? ` (${publishedCount}/${texts.length} posts published)` : ''}`,
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
        const partial = publishedCount > 0;
        return {
          success: partial,
          postId: firstPostId || undefined,
          url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
          error: `Failed to publish post ${i + 1}/${texts.length}: ${errorText}${partial ? ` (${publishedCount}/${texts.length} posts published)` : ''}`,
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
  } catch (error: any) {
    console.error('Unexpected error in publishThread:', error);
    const partial = publishedCount > 0;
    return {
      success: partial,
      postId: firstPostId || undefined,
      url: firstPostId ? `https://www.threads.net/t/${firstPostId}` : undefined,
      error: `${error.message}${partial ? ` (${publishedCount}/${texts.length} posts published)` : ''}`,
      publishedCount,
    };
  }
}
