import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

    const { templateId, count = 5, generationMode = 'facts_with_intro' } = await req.json();

    if (!templateId) {
      return new Response(
        JSON.stringify({ error: 'Template ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: template, error: templateError } = await supabase
      .from('thread_templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single();

    if (templateError || !template) {
      return new Response(
        JSON.stringify({ error: 'Template not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const templateContent = template.content as string[];

    if (!Array.isArray(templateContent) || templateContent.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Template content is empty or invalid' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const generateResponse = await fetch(
      `${supabaseUrl}/functions/v1/generate-viral-threads`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': supabaseKey,
        },
        body: JSON.stringify({
          templateContent: templateContent,
          variantCount: count,
          generationMode: generationMode,
        }),
      }
    );

    if (!generateResponse.ok) {
      const error = await generateResponse.json();
      throw new Error(error.error || 'Generation failed');
    }

    const generateResult = await generateResponse.json();
    const variants = generateResult.variants;

    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('No variants generated');
    }

    const draftsCreated = [];

    for (const variant of variants) {
      if (!Array.isArray(variant) || variant.length === 0) {
        continue;
      }

      const { data: draft, error: draftError } = await supabase
        .from('draft_posts')
        .insert({
          user_id: user.id,
          threads_account_id: template.threads_account_id,
          content: variant[0],
          thread_content: variant,
          is_thread: variant.length > 1,
          generated_by_ai: true,
          template_id: templateId,
          status: 'draft',
        })
        .select()
        .single();

      if (draftError) {
        console.error('Failed to save draft:', draftError);
      } else if (draft) {
        draftsCreated.push(draft);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        created: draftsCreated.length,
        drafts: draftsCreated
      }),
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
