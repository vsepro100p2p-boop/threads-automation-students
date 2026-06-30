import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildCors } from '../_shared/cors.ts';
import { decryptSecret } from '../_shared/crypto.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');

    // Properly initialize Supabase client for a specific user request
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the user from the authorization context
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Create an admin client for database writes that might fail RLS or need service level access
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!user) {
      console.error('Auth Error details:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', authError }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { accountId, threadContent } = await req.json();

    if (!accountId || !threadContent || !Array.isArray(threadContent) || threadContent.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: accountId and threadContent array required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: account } = await supabaseAdmin
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

    console.log('Publishing thread with', threadContent.length, 'posts');
    console.log('Thread content:', threadContent);

    const result = await publishThread(
      account.threads_user_id,
      (await decryptSecret(account.access_token)) as string,
      threadContent
    );

    if (result.success) {
      await supabaseAdmin
        .from('posts')
        .insert({
          user_id: user.id,
          threads_account_id: accountId,
          content: threadContent[0],
          status: 'published',
          threads_post_id: result.postId || null,
          threads_post_url: result.url || null,
          published_at: new Date().toISOString(),
          generated_by_ai: false,
          is_thread: threadContent.length > 1,
          thread_content: threadContent,
        });
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.success ? 'Thread published successfully' : 'Failed to publish thread',
        postId: result.postId,
        url: result.url,
        error: result.error,
        threadLength: threadContent.length,
      }),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
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

async function publishThread(
  userId: string,
  accessToken: string,
  texts: string[]
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    console.log('Starting thread publication for user:', userId);
    console.log('Thread has', texts.length, 'posts');

    if (texts.length === 1) {
      return await publishSinglePost(userId, accessToken, texts[0]);
    }

    const publishedPostIds: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      console.log(`Publishing post ${i + 1}/${texts.length}`);
      
      const body: any = {
        media_type: 'TEXT',
        text: texts[i],
        access_token: accessToken,
      };

      if (i > 0) {
        body.reply_to_id = publishedPostIds[i - 1];
        console.log(`Post ${i + 1} will reply to previous published post:`, publishedPostIds[i - 1]);
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
        console.error(`Failed to create post ${i + 1}:`, errorText);
        return { success: false, error: `Failed to create thread post ${i + 1}: ${errorText}` };
      }

      const { id: containerId } = await createResponse.json();
      console.log(`Post ${i + 1} container created:`, containerId);

      console.log(`Checking container ${i + 1} status...`);
      const statusCheck = await checkContainerStatus(userId, containerId, accessToken);
      if (!statusCheck.success) {
        return { success: false, error: `Post ${i + 1} status check failed: ${statusCheck.error}` };
      }

      console.log(`Publishing post ${i + 1}...`);
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
        console.error(`Failed to publish post ${i + 1}:`, errorText);
        return { success: false, error: `Failed to publish post ${i + 1}: ${errorText}` };
      }

      const { id: postId } = await publishResponse.json();
      publishedPostIds.push(postId);
      console.log(`Post ${i + 1} published with ID:`, postId);

      if (i < texts.length - 1) {
        console.log('Waiting 2 seconds before next post...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const firstPostId = publishedPostIds[0];
    const url = `https://www.threads.net/t/${firstPostId}`;

    console.log('Thread published successfully!');
    console.log('First Post ID:', firstPostId);
    console.log('All Post IDs:', publishedPostIds);
    console.log('URL:', url);

    return { success: true, postId: firstPostId, url };
  } catch (error) {
    console.error('Exception in publishThread:', error);
    return { success: false, error: error.message };
  }
}

async function publishSinglePost(
  userId: string,
  accessToken: string,
  text: string
): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  try {
    const createResponse = await fetch(
      `https://graph.threads.net/v1.0/${userId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'TEXT',
          text,
          access_token: accessToken,
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.text();
      return { success: false, error: `Failed to create: ${error}` };
    }

    const { id: containerId } = await createResponse.json();

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
      const error = await publishResponse.text();
      return { success: false, error: `Failed to publish: ${error}` };
    }

    const { id: postId } = await publishResponse.json();
    const url = `https://www.threads.net/t/${postId}`;

    return { success: true, postId, url };
  } catch (error) {
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
        console.error(`Status check attempt ${attempt} failed:`, errorText);
        if (attempt === maxAttempts) {
          return { success: false, error: `Status check failed after ${maxAttempts} attempts: ${errorText}` };
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`Container status (attempt ${attempt}):`, statusData.status);

      if (statusData.status === 'FINISHED') {
        return { success: true };
      }

      if (statusData.status === 'ERROR') {
        return { success: false, error: `Container error: ${statusData.error_message || 'Unknown error'}` };
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        return { success: false, error: `Container still processing after ${maxAttempts} attempts` };
      }
    } catch (error) {
      console.error(`Status check exception (attempt ${attempt}):`, error);
      if (attempt === maxAttempts) {
        return { success: false, error: `Status check exception: ${error.message}` };
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return { success: false, error: 'Status check failed' };
}