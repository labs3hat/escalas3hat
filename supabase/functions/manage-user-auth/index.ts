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
      console.log(`Starting createUser for ${email}`)
      
      // 1. Check if user already exists in Auth
      const { data: existingAuth, error: listError } = await supabaseClient.auth.admin.listUsers()
      if (listError) {
        console.error('Error listing users:', listError)
        throw listError
      }
      
      const userInAuth = existingAuth?.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      console.log(`User in auth: ${userInAuth ? 'found (' + userInAuth.id + ')' : 'not found'}`)

      let authUser
      if (userInAuth) {
        // Update existing auth user metadata and password
        console.log(`Updating existing auth user ${userInAuth.id}`)
        const { data, error: updateError } = await supabaseClient.auth.admin.updateUserById(
          userInAuth.id,
          { 
            password,
            user_metadata: { name, role, store_ids },
            email_confirm: true 
          }
        )
        if (updateError) {
          console.error('Error updating auth user:', updateError)
          throw updateError
        }
        authUser = { user: data.user }
      } else {
        // Create new auth user
        console.log('Creating new auth user')
        const { data, error: authError } = await supabaseClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { name, role, store_ids }
        })
        if (authError) {
          console.error('Error creating auth user:', authError)
          throw authError
        }
        authUser = data
      }

      // 2. Upsert profile with the correct ID
      console.log(`Upserting profile for ${email} with ID ${authUser.user.id}`)
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .upsert({
          id: authUser.user.id,
          email: email.toLowerCase(),
          name,
          role,
          store_ids,
          has_auth: true
        }, { onConflict: 'email' })

      if (profileError) {
        console.error('Error upserting profile:', profileError)
        throw profileError
      }

      console.log('Successfully processed user creation/sync')
      return new Response(JSON.stringify({ data: authUser }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
