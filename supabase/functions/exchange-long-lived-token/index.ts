import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildCors } from '../_shared/cors.ts';
import { decryptSecret, encryptSecret } from '../_shared/crypto.ts';

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
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { accountId } = await req.json();

    if (!accountId) {
      return new Response(
        JSON.stringify({ error: 'Account ID is required' }),
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

    if (!account.app_secret) {
      return new Response(
        JSON.stringify({ error: 'App Secret is not configured for this account. Please update your account settings.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Exchanging token for account:', account.username);
    console.log('Current token (first 20 chars):', account.access_token?.substring(0, 20));

    // app_secret и access_token хранятся зашифрованными — расшифровываем для вызова API.
    const appSecret = (await decryptSecret(account.app_secret)) as string;
    const currentToken = (await decryptSecret(account.access_token)) as string;
    const exchangeUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${currentToken}`;
    console.log('Making exchange request to Threads API...');

    const exchangeResponse = await fetch(exchangeUrl, {
      method: 'GET',
    });

    console.log('Response status:', exchangeResponse.status);

    if (!exchangeResponse.ok) {
      const errorText = await exchangeResponse.text();
      console.error('Token exchange failed:', exchangeResponse.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to exchange token with Threads API',
          status: exchangeResponse.status,
          details: errorText
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const exchangeData = await exchangeResponse.json();
    console.log('Token exchange response:', JSON.stringify(exchangeData));
    
    const newAccessToken = exchangeData.access_token;
    const expiresIn = exchangeData.expires_in;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('Token exchanged successfully, expires at:', expiresAt);
    console.log('Expires in days:', Math.floor(expiresIn / 86400));

    // Fetch profile picture from Threads API
    let profilePictureUrl: string | null = null;
    try {
      const profileResponse = await fetch(
        `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${newAccessToken}`
      );
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        profilePictureUrl = profileData.threads_profile_picture_url || null;
        console.log('Profile picture URL:', profilePictureUrl ? 'found' : 'not found');
        if (profileData.username) {
          console.log('Username from API:', profileData.username);
        }
      } else {
        console.warn('Failed to fetch profile picture:', profileResponse.status);
      }
    } catch (profileError) {
      console.warn('Error fetching profile picture:', profileError);
    }

    const updateData: Record<string, any> = {
      access_token: await encryptSecret(newAccessToken),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    if (profilePictureUrl) {
      updateData.profile_picture_url = profilePictureUrl;
    }

    const { error: updateError } = await supabaseAdmin
      .from('threads_accounts')
      .update(updateData)
      .eq('id', accountId);

    if (updateError) {
      console.error('Failed to update token in database:', updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to update token in database'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Token exchanged for long-lived token successfully',
        expiresAt,
        expiresInDays: Math.floor(expiresIn / 86400),
      }),
      {
        status: 200,
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