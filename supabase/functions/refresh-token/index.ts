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

    console.log('Refreshing token for account:', account.username);
    console.log('Current token (first 20 chars):', account.access_token?.substring(0, 20));

    const currentToken = (await decryptSecret(account.access_token)) as string;
    const refreshUrl = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`;
    console.log('Making request to Threads API...');

    const refreshResponse = await fetch(refreshUrl, {
      method: 'GET',
    });

    console.log('Response status:', refreshResponse.status);

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      console.error('Token refresh failed:', refreshResponse.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to refresh token from Threads API',
          status: refreshResponse.status,
          details: errorText
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const refreshData = await refreshResponse.json();
    console.log('Token refresh response:', JSON.stringify(refreshData));
    const newAccessToken = refreshData.access_token;
    const expiresIn = refreshData.expires_in;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log('Token refreshed successfully, expires at:', expiresAt);

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

    const { error: updateError } = await supabase
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
        message: 'Token refreshed successfully',
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