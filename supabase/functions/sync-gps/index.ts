import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verificarArribo, Coordinate, calcularVelocidadKmh, UMBRAL_SPOOFING_KMH } from "./geocercas.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Manejo de Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders });
    }

    // Seguridad Zero-Trust: Instanciar cliente con el token del usuario para validar la firma
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validar el JWT y extraer el chofer_id seguro (del 'sub')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized JWT' }), { status: 401, headers: corsHeaders });
    }

    const chofer_id = user.id; // ¡Jamás confiamos en el chofer_id del payload!

    // Parsear payload
    const body = await req.json();
    const { viaje_id, destino, posiciones } = body;
    // posiciones es un Array<Coordinate>. El índice 0 es la última posición confirmada.

    if (!posiciones || !Array.isArray(posiciones) || posiciones.length < 2) {
      return new Response(JSON.stringify({ error: 'Se requieren al menos 2 posiciones para evitar Bouncing' }), { status: 400, headers: corsHeaders });
    }

    if (!destino || typeof destino.lon !== 'number' || typeof destino.lat !== 'number') {
      return new Response(JSON.stringify({ error: 'Destino inválido' }), { status: 400, headers: corsHeaders });
    }

    // 1. Cálculo en RAM (Cero I/O)
    const arrived = verificarArribo(posiciones, destino);

    // 2. Persistencia asíncrona (Fire-and-Forget)
    // Instanciamos un service_role client para bypassear RLS en este entorno controlado, 
    // pero limitamos el insert estrictamente al chofer_id validado.
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const promise = async () => {
      try {
        // Anti-spoofing (Intra-ráfaga, en RAM)
        const anomalias = [];
        for (let i = 1; i < posiciones.length; i++) {
          const prev = posiciones[i - 1];
          const curr = posiciones[i];
          const velocidad = calcularVelocidadKmh(prev, curr);
          if (velocidad > UMBRAL_SPOOFING_KMH) {
            anomalias.push({
              chofer_id: chofer_id,
              posicion_anterior: `POINT(${prev.lon} ${prev.lat})`,
              posicion_nueva: `POINT(${curr.lon} ${curr.lat})`,
              velocidad_calculada_kmh: velocidad
            });
          }
        }

        // Persistir anomalías si existen
        if (anomalias.length > 0) {
          const { error: errAnom } = await supabaseAdmin.from('anomalias_gps').insert(anomalias);
          if (errAnom) console.error("Error persistiendo anomalia_gps", errAnom);
        }

        // Ignoramos el índice 0 (ya fue insertado en la ráfaga anterior)
        const nuevasPosiciones = posiciones.slice(1).map(p => ({
          chofer_id: chofer_id,
          ubicacion: `POINT(${p.lon} ${p.lat})`, // Formato PostGIS
          timestamp: p.ts || new Date().toISOString()
        }));

        const { error } = await supabaseAdmin.from('posiciones').insert(nuevasPosiciones);
        if (error) throw error;

        // Opcional: Si arrived === true, podríamos actualizar el estado del viaje aquí también en background
      } catch (err) {
        // Manejo de Errores Background para QA
        console.error(`[CRITICAL] Error en persistencia asíncrona de GPS para chofer ${chofer_id}:`, err);
      }
    };

    // EdgeRuntime envuelve la promesa para que termine de ejecutarse luego del Response
    // @ts-ignore
    EdgeRuntime.waitUntil(promise());

    // 3. Respuesta inmediata HTTP (<15ms)
    return new Response(JSON.stringify({ arrived, ack: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
