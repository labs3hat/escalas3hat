import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')

    const { data: { user: requester }, error: requesterError } = await createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    ).auth.getUser(authHeader.replace('Bearer ', ''))

    if (requesterError || !requester) throw new Error('Invalid token')

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', requester.id)
      .single()

    if (!profile || (profile.role !== 'diretoria' && profile.role !== 'regional')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Only directors or regionals can manage users' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { action, userId, password, email, name, role, store_ids } = await req.json()

    if (action === 'updatePassword') {
      const { data, error } = await supabaseClient.auth.admin.updateUserById(
        userId,
        { password: password }
      )
      if (error) throw error
      return new Response(JSON.stringify({ data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'createUser') {
      // 1. Create auth user
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, store_ids }
      })

      if (authError) throw authError

      // 2. Update profile (trigger might have created it with defaults)
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .upsert({
          id: authUser.user.id,
          email,
          name,
          role,
          store_ids
        })

      if (profileError) throw profileError

      return new Response(JSON.stringify({ data: authUser }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
