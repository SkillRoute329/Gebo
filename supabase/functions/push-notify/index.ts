import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import webpush from "npm:web-push@3.6.7";

console.log("Push Notification Edge Function Initialized");

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@gebo.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

serve(async (req) => {
  try {
    // 1. Validar configuracion VAPID
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID keys not configured in environment.");
    }

    // 2. Parsear request body
    const body = await req.json();
    const { usuario_id, title, body: msgBody, data } = body;

    if (!usuario_id) {
      throw new Error("Missing 'usuario_id' in request body");
    }

    // 3. Inicializar Supabase Client usando la Service Role Key para bypassear RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 4. Buscar suscripciones del usuario destino
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("usuario_id", usuario_id);

    if (dbError) throw dbError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No active subscriptions for user." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 5. Enviar push a cada endpoint
    const payload = JSON.stringify({
      title: title || "Gebo Notification",
      body: msgBody || "",
      data: data || {}
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        // Si el endpoint expiró o es inválido (410, 404), borramos la suscripción
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ message: "Push notifications sent successfully" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error processing push notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }
});
