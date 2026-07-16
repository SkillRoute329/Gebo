import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import webpush from "npm:web-push@3.6.7"
import { createClient } from "npm:@supabase/supabase-js@2.44.2"

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "BJiTBlbSlLN2IiVF86KvVQD-QX_YJm9-LjSqTBNAkeIUktG1pbUl-Fv7nwXlL-z4Xlr4yq_N9A8H0bvhC3tmDpA";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "kZHuUO2YUQWRCvcQMbpEUNfHZcbt9VGb-nDAeT2HTpk";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

webpush.setVapidDetails(
  'mailto:soporte@gebo.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // El request puede ser un webhook desde la BD o un request directo
    const payload = await req.json();
    
    // Si es un webhook de insert en mensajes_faena
    let targetUserId = payload.user_id;
    let title = payload.title || "Notificación de Gebo";
    let body = payload.body || "Tienes una nueva actualización.";
    
    if (payload.type === 'INSERT' && payload.table === 'mensajes_faena') {
        const msg = payload.record;
        // Obtenemos los participantes de la faena
        const { data: faena } = await supabase.from('faenas').select('*').eq('id', msg.faena_id).single();
        if (faena) {
            // Si el emisor es el cliente, mandarle push al chofer
            if (msg.rol_emisor === 'cliente' && faena.chofer_id) {
                targetUserId = faena.chofer_id;
                title = "Nuevo mensaje del Cliente";
                body = msg.contenido;
            } else if (msg.rol_emisor === 'chofer') {
                targetUserId = faena.cliente_id;
                title = "Nuevo mensaje del Chofer";
                body = msg.contenido;
            } else {
                return new Response(JSON.stringify({ status: "ignored", reason: "no target" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }
    } else if (payload.type === 'UPDATE' && payload.table === 'faenas') {
        const faena = payload.record;
        const oldFaena = payload.old_record;
        if (faena.estado !== oldFaena.estado) {
            if (faena.estado === 'chofer_en_camino') {
                targetUserId = faena.cliente_id;
                title = "Chofer en camino";
                body = "Tu chofer va hacia tu vehículo.";
            } else if (faena.estado === 'chofer_llegó') {
                targetUserId = faena.cliente_id;
                title = "¡El chofer ha llegado!";
                body = "Tu chofer ya está en el origen.";
            } else if (faena.estado === 'finalizada') {
                targetUserId = faena.cliente_id;
                title = "Viaje finalizado";
                body = "Se ha completado tu faena.";
            } else if (faena.estado === 'asignada') {
                targetUserId = faena.cliente_id;
                title = "Chofer Asignado";
                body = "Hemos asignado un chofer para tu viaje.";
            } else {
                 return new Response(JSON.stringify({ status: "ignored" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        } else {
             return new Response(JSON.stringify({ status: "ignored" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
    }

    if (!targetUserId) {
        return new Response(JSON.stringify({ status: "error", error: "missing user_id" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolviendo uuid a usuario_id (auth.uid) si es que el user_id proporcionado es de la tabla clientes/choferes
    let authUid = targetUserId;
    // Chequear en tabla choferes
    const { data: chofer } = await supabase.from('choferes').select('usuario_id').eq('id', targetUserId).maybeSingle();
    if (chofer) authUid = chofer.usuario_id;
    // Chequear en tabla clientes
    const { data: cliente } = await supabase.from('clientes').select('usuario_id').eq('id', targetUserId).maybeSingle();
    if (cliente) authUid = cliente.usuario_id;

    // Buscar la suscripcion del usuario
    const { data: subs, error: subErr } = await supabase
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', authUid);

    if (subErr || !subs || subs.length === 0) {
        return new Response(JSON.stringify({ status: "skipped", reason: "no subscription found for user " + authUid }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const pushPayload = JSON.stringify({
        title,
        body,
        icon: '/icon-192.png'
    });

    let sentCount = 0;
    for (const sub of subs) {
        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                auth: sub.auth,
                p256dh: sub.p256dh
            }
        };

        try {
            await webpush.sendNotification(pushSubscription, pushPayload);
            sentCount++;
        } catch (e) {
            console.error("Error al enviar push a " + sub.endpoint, e);
            if (e.statusCode === 410 || e.statusCode === 404) {
                // Subscription has expired or is no longer valid, we should delete it
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            }
        }
    }

    return new Response(JSON.stringify({ status: "ok", sent: sentCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
