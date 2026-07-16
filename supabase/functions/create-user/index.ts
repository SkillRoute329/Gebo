import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log("create-user edge function called");

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // 1. Verify caller is an Admin
    const authHeader = req.headers.get('Authorization');
    console.log("authHeader present:", !!authHeader);

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || '' } },
    });

    console.log("Calling supabaseClient.auth.getUser()...");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    console.log("getUser finished. error:", authError?.message);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized JWT: ' + authError?.message }), { status: 200, headers: corsHeaders });
    }

    if (user.app_metadata?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Requires admin role' }), { status: 200, headers: corsHeaders });
    }

    // 2. Parse payload
    const body = await req.json();
    const { email, password, role, metadata, profileData } = body;
    console.log("Payload received:", email, role);

    if (!['admin', 'chofer', 'cliente'].includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 200, headers: corsHeaders });
    }

    // 3. Create User with Admin API
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    console.log("Creating user in auth.admin...");
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { role }
    });

    if (createError || !newUser.user) {
      console.log("Error creating auth user:", createError);
      return new Response(JSON.stringify({ error: createError?.message || 'Failed to create user in Auth' }), { status: 200, headers: corsHeaders });
    }

    const userId = newUser.user.id;
    console.log("Auth user created with ID:", userId);

    // 4. Insert Profile Record
    console.log("Creating profile in custom tables...");
    if (role === 'chofer') {
      const { error: profileErr } = await supabaseAdmin.from('choferes').insert({
        id: userId,
        usuario_id: userId,
        email: email,
        nombre: metadata?.nombre_completo || '',
        estado: profileData?.estado || 'disponible',
        horas_conduccion_continua: 0,
        maneja_manual: profileData?.maneja_manual || false,
        maneja_automatico: profileData?.maneja_automatico || false,
        maneja_electrico: profileData?.maneja_electrico || false,
        maneja_suv: profileData?.maneja_suv || false,
        maneja_camion: profileData?.maneja_camion || false
      });
      if (profileErr) {
        console.error('Error insertando chofer:', profileErr);
        throw new Error("Error perfil chofer: " + profileErr.message);
      }
    } else if (role === 'cliente') {
      const { error: profileErr } = await supabaseAdmin.from('clientes').insert({
        id: userId,
        usuario_id: userId,
        email: email,
        tipo: profileData?.tipo || 'particular',
        nombre: metadata?.nombre_completo || '',
        razon_social: profileData?.razon_social || null,
        telefono: profileData?.telefono || ''
      });
      if (profileErr) {
        console.error('Error insertando cliente:', profileErr);
        throw new Error("Error perfil cliente: " + profileErr.message);
      }
    }

    console.log("Success, returning user info");
    return new Response(JSON.stringify({ user: newUser.user }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
