import { supabase } from '../lib/supabase';

export const adminService = {
  // USUARIOS GENERALES
  createAppUser: async ({ email, password, role, metadata, profileData }) => {
    const response = await supabase.functions.invoke('create-user', {
      body: { email, password, role, metadata, profileData }
    });
    if (response.error) {
      console.error("Invoke error full object:", response.error);
      if (response.error.context) {
        const text = await response.error.context.text();
        throw new Error(`Edge Function Error: ${text}`);
      }
      throw new Error(response.error.message || "Error al invocar Edge Function");
    }
    if (response.data?.error) throw new Error(response.data.error);
    return response.data?.user;
  },

  // CHOFERES
  getChoferesActivosCount: async () => {
    const { count, error } = await supabase
      .from('choferes')
      .select('*', { count: 'exact', head: true })
      .in('estado', ['en_faena', 'en_traslado']);
    if (error) throw error;
    return count;
  },

  getChoferes: async () => {
    const { data, error } = await supabase
      .from('choferes')
      .select('*');
    if (error) throw error;
    return data;
  },
  
  updateChoferData: async (id, payload) => {
    const { data, error } = await supabase
      .from('choferes')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
    return data;
  },

  // CLIENTES
  getClientes: async () => {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('activo', true); // Solo los activos por defecto
    if (error) throw error;
    return data;
  },

  updateClienteData: async (id, payload) => {
    const { data, error } = await supabase
      .from('clientes')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
    return data;
  },

  updateClienteEstado: async (id, activo) => {
    const { data, error } = await supabase
      .from('clientes')
      .update({ activo })
      .eq('id', id);
    if (error) throw error;
    return data;
  },

  updateChoferEstado: async (id, estado) => {
    const { data, error } = await supabase
      .from('choferes')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // VAGONETAS
  getVagonetas: async () => {
    const { data, error } = await supabase
      .from('vagonetas')
      .select('*, choferes(nombre)');
    if (error) throw error;
    // Traducción semántica (backend físico -> React lógico)
    return data.map(v => ({
      ...v,
      shuttle_driver_id: v.chofer_vagoneta_id
    }));
  },

  createVagoneta: async (data) => {
    const { data: result, error } = await supabase
      .from('vagonetas')
      .insert([data])
      .select()
      .single();
    if (error) throw error;
    return result;
  },

  asignarChoferVagoneta: async (vagonetaId, shuttle_driver_id) => {
    const { data, error } = await supabase
      .from('vagonetas')
      // Traducción semántica (React lógico -> backend físico)
      .update({ chofer_vagoneta_id: shuttle_driver_id || null })
      .eq('id', vagonetaId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // FAENAS
  getFaenasDelDia: async () => {
    const { data, error } = await supabase
      .from('faenas')
      .select('*, choferes!faenas_chofer_id_fkey(nombre), clientes(nombre), vehiculos_cliente(marca, modelo)')
      .gte('fecha_hora_programada', new Date().toISOString().split('T')[0]);
    if (error) throw error;
    // Traducción semántica
    return data.map(f => ({
      ...f,
      faena_id: f.id,
      gebo_driver_id: f.chofer_id
    }));
  },

  cancelarFaena: async (id) => {
    const { data, error } = await supabase
      .from('faenas')
      .update({ estado: 'cancelada_gebo' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // TRASLADOS
  crearTraslado: async (vagonetaId, puntos) => {
    // puntos: [{ gebo_driver_id, lat, lng, tipo: 'recogida' | 'bajada' }]
    const { data: traslado, error: errTraslado } = await supabase
      .from('traslados_equipo')
      .insert([{ vagoneta_id: vagonetaId, estado: 'programado' }])
      .select()
      .single();
    
    if (errTraslado) throw errTraslado;

    const paradas = puntos.map((p, idx) => ({
      traslado_id: traslado.id,
      chofer_id: p.gebo_driver_id || p.chofer_id,
      orden: idx + 1,
      punto: `POINT(${p.lng} ${p.lat})`,
      tipo: p.tipo === 'bajada' ? 'entrega' : 'recogida',
      completada: false
    }));

    const { error: errParadas } = await supabase
      .from('paradas_traslado')
      .insert(paradas);

    if (errParadas) throw errParadas;

    return { ...traslado, shuttle_route_id: traslado.id };
  },

  // TARIFAS (configuracion_negocio)
  getConfiguracion: async () => {
    const { data, error } = await supabase
      .from('configuracion_negocio')
      .select('*')
      .limit(1)
      .single();
    if (error) throw error;
    return data;
  },

  updateConfiguracion: async (id, config) => {
    const { data, error } = await supabase
      .from('configuracion_negocio')
      .update(config)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  crearFaenaManual: async (payload) => {
    const { data, error } = await supabase
      .from('faenas')
      .insert([{
        cliente_id: payload.cliente_id,
        origen: `POINT(${payload.lng_origen} ${payload.lat_origen})`,
        destino: `POINT(${payload.lng_destino} ${payload.lat_destino})`,
        chofer_id: payload.chofer_id || null,
        estado: payload.chofer_id ? 'asignada' : 'programada',
        modalidad: 'por_minuto',
        fecha_hora_programada: new Date().toISOString()
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateFaenaEstado: async (id, estado) => {
    const { data, error } = await supabase
      .from('faenas')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  updateFaenaChofer: async (id, gebo_driver_id) => {
    const { data, error } = await supabase
      .from('faenas')
      .update({ chofer_id: gebo_driver_id || null, estado: gebo_driver_id ? 'asignada' : 'programada' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
