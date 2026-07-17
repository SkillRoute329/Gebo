import React, { useState, useEffect } from 'react';
import { Users, AlertTriangle, TrendingUp, Plus, X, Settings, Map as MapIcon, Truck, Briefcase } from 'lucide-react';
import { AlertOctagon } from 'lucide-react';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { parseEWKB } from '../../lib/utils';
import { adminService } from '../../services/adminService';
import ChoferesPanel from './ChoferesPanel';
import ClientesPanel from './ClientesPanel';
import IncidentesPanel from './IncidentesPanel';
import AdminsPanel from './AdminsPanel';
import FleetMap from '../../components/admin/FleetMap';
import IncidentTracker from '../../components/admin/IncidentTracker';
import FinancialConsole from '../../components/admin/FinancialConsole';
import ChecklistManager from '../../components/admin/ChecklistManager';

import DireccionInput from '../../components/ui/DireccionInput';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('radar');
  
  // Radar data
  const [choferesActivosRadar, setChoferesActivosRadar] = useState(0);
  const [faenasEnCurso, setFaenasEnCurso] = useState(0);
  const [nuevosEventos, setNuevosEventos] = useState([]);
  const [shuttleDriversPos, setShuttleDriversPos] = useState({}); // { shuttle_driver_id: { lat, lng, estado, nombre } }
  
  // Data lists
  const [choferes, setChoferes] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [vagonetas, setVagonetas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [configuracion, setConfiguracion] = useState(null);
  const [preguntasChecklist, setPreguntasChecklist] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [finanzas, setFinanzas] = useState({ingreso: 0, costo: 0, margen: 0, km: 0});
  const [sugerencias, setSugerencias] = useState([]);

  // SOS State
  const [alertas, setAlertas] = useState({}); 

  // Modals
  const [isTrasladoModalOpen, setIsTrasladoModalOpen] = useState(false);
  const [isFaenaModalOpen, setIsFaenaModalOpen] = useState(false);

  useEffect(() => {
    fetchInitialData();

    // Suscripciones
    const channelFaenas = supabase.channel('admin-faenas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'faenas' }, (payload) => {
        fetchInitialData(); // Refrescar todo por simplicidad en demo
        const msg = payload.eventType === 'INSERT' ? 'Nueva Faena solicitada' : `Faena ${payload.new.id.substring(0,5)} actualizada`;
        setNuevosEventos(prev => [msg, ...prev].slice(0, 5));
      }).subscribe();

    const channelChoferesRadar = supabase.channel('admin-choferes-radar')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'choferes' }, async (payload) => {
        // Refetch total directly from db
        const count = await adminService.getChoferesActivosCount();
        setChoferesActivosRadar(count);

        // Actualizar estado en el mapa (Radar)
        setShuttleDriversPos(prev => {
          if (!prev[payload.new.id]) return prev;
          return {
            ...prev,
            [payload.new.id]: {
              ...prev[payload.new.id],
              estado: payload.new.estado,
              nombre: payload.new.nombre
            }
          };
        });

        // Actualizar en la lista local de AdminDashboard
        setChoferes(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
      }).subscribe();

    const channelPosiciones = supabase.channel('admin-posiciones')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vagonetas_estado_actual' }, async (payload) => {
        const p = payload.new;
        if (p) {
          // Buscamos el chofer_vagoneta_id de la base para mapear al radar
          const { data: vag } = await supabase.from('vagonetas').select('chofer_vagoneta_id').eq('id', p.vagoneta_id).single();
          const shuttle_driver_id = vag?.chofer_vagoneta_id;
          if (!shuttle_driver_id) return;

          let coords = null;
          if (typeof p.ultima_posicion === 'string') coords = parseEWKB(p.ultima_posicion);
          else if (p.ultima_posicion && p.ultima_posicion.type === 'Point') coords = [p.ultima_posicion.coordinates[1], p.ultima_posicion.coordinates[0]];
          
          if (coords) {
            setShuttleDriversPos(prev => {
              const existing = prev[shuttle_driver_id] || {};
              let estado = existing.estado || p.estado;
              let nombre = existing.nombre;
              if (!nombre) {
                 setChoferes(chofs => {
                   const c = chofs.find(x => x.id === shuttle_driver_id);
                   if (c) { nombre = c.nombre; }
                   return chofs;
                 });
              }
              return {
                ...prev,
                [shuttle_driver_id]: { ...existing, lat: coords[0], lng: coords[1], estado, nombre }
              };
            });
          }
        }
      }).subscribe();

    const channelSOS = supabase.channel('admin-sos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alertas_emergencia' }, (payload) => {
        const alerta = payload.new;
        if (alerta.estado === 'activa') {
          setAlertas(prev => ({ ...prev, [alerta.id]: alerta }));
          new Audio('https://assets.mixkit.co/active_storage/sfx/988/988-preview.mp3').play().catch(()=>{});
        } else {
          setAlertas(prev => { const n = {...prev}; delete n[alerta.id]; return n; });
        }
      }).subscribe();

    const channelIncidentes = supabase.channel('admin-incidentes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidentes_calle' }, (payload) => {
        const inc = payload.new;
        if (inc.tipo_incidente === 'sos_panico' || inc.tipo_incidente === 'siniestro_vagoneta') {
          // Mapeo semántico
          const alertaObj = {
            id: inc.id,
            tipo_emisor: inc.tipo_incidente === 'sos_panico' ? 'gebo_driver (SOS)' : 'shuttle_driver (SINIESTRO)',
            viaje_id: inc.vagoneta_id || inc.chofer_id,
            estado: 'activa',
            is_incidente_calle: true
          };
          setAlertas(prev => ({ ...prev, [inc.id]: alertaObj }));
          new Audio('https://assets.mixkit.co/active_storage/sfx/988/988-preview.mp3').play().catch(()=>{});
        }
      }).subscribe();

    const channelGastos = supabase.channel('admin-gastos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gastos_ruta' }, () => {
        fetchInitialData();
      }).subscribe();
      
    const channelFinanzas = supabase.channel('admin-finanzas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugerencias_financieras' }, () => {
        fetchInitialData();
      }).subscribe();

    return () => {
      supabase.removeChannel(channelFaenas);
      supabase.removeChannel(channelChoferesRadar);
      supabase.removeChannel(channelPosiciones);
      supabase.removeChannel(channelSOS);
      supabase.removeChannel(channelIncidentes);
      supabase.removeChannel(channelGastos);
      supabase.removeChannel(channelFinanzas);
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const chofs = await adminService.getChoferes();
      setChoferes(chofs);

      const count = await adminService.getChoferesActivosCount();
      setChoferesActivosRadar(count);

      const posData = await supabase.from('vagonetas_estado_actual').select('*, vagonetas(chofer_vagoneta_id)');
      const cPos = {};
      posData.data?.forEach(p => {
        const shuttle_driver_id = p.vagonetas?.chofer_vagoneta_id;
        if (!shuttle_driver_id) return;
        const chof = chofs.find(c => c.id === shuttle_driver_id);
        let coords = null;
        if (typeof p.ultima_posicion === 'string') coords = parseEWKB(p.ultima_posicion);
        else if (p.ultima_posicion && p.ultima_posicion.type === 'Point') coords = [p.ultima_posicion.coordinates[1], p.ultima_posicion.coordinates[0]];
        if (coords) {
          cPos[shuttle_driver_id] = { lat: coords[0], lng: coords[1], estado: p.estado || chof?.estado, nombre: chof?.nombre };
        }
      });
      setShuttleDriversPos(cPos);

      const fns = await adminService.getFaenasDelDia();
      setFaenas(fns);
      setFaenasEnCurso(fns.filter(f => ['ofrecida', 'asignada', 'en_curso'].includes(f.estado)).length);

      const vags = await adminService.getVagonetas();
      setVagonetas(vags);

      const cliRes = await adminService.getClientes();
      setClientes(cliRes);

      const confRes = await adminService.getConfiguracion();
      setConfiguracion(confRes);
        
      const pcRes = await supabase.from('preguntas_checklist').select('*').order('categoria');
      setPreguntasChecklist(pcRes.data || []);

      const gasRes = await supabase.from('gastos_ruta').select('*').eq('estado_gasto', 'pendiente_aprobacion').order('creado_at', { ascending: false });
      setGastos(gasRes.data || []);
      
      const resViajes = await supabase.from('resumen_contable_viajes').select('ingreso, costo_chofer, costo_vagoneta, costo_gastos_ruta, margen_neto, kilometros_reales');
      let ing = 0, cost = 0, marg = 0, km = 0;
      (resViajes.data || []).forEach(r => {
        ing += Number(r.ingreso || 0);
        cost += Number(r.costo_chofer || 0) + Number(r.costo_vagoneta || 0) + Number(r.costo_gastos_ruta || 0);
        marg += Number(r.margen_neto || 0);
        km += Number(r.kilometros_reales || 0);
      });
      setFinanzas({ingreso: ing, costo: cost, margen: marg, km: km});
      
      const sugRes = await supabase.from('sugerencias_financieras').select('*').eq('aplicada', false).order('creado_at', { ascending: false });
      setSugerencias(sugRes.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolverAlerta = async (alertaId) => {
    const alerta = alertas[alertaId];
    if (alerta?.is_incidente_calle) {
        setAlertas(prev => { const n = {...prev}; delete n[alertaId]; return n; });
    } else {
        await supabase.from('alertas_emergencia').update({ estado: 'resuelta' }).eq('id', alertaId);
    }
  };

  const renderSidebarContent = () => {
    switch (activeTab) {
      case 'radar':
        return (
          <>
            {/* MÉTRICAS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                <Users size={20} color="#00ffcc" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{choferesActivosRadar}</p>
                <p style={{ fontSize: '0.8rem', color: '#9ba1b0' }}>Choferes Activos</p>
              </div>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '12px' }}>
                <Briefcase size={20} color="var(--accent-magenta)" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '1.5rem', fontWeight: '700' }}>{faenasEnCurso}</p>
                <p style={{ fontSize: '0.8rem', color: '#9ba1b0' }}>Faenas Activas</p>
              </div>
            </div>

            {/* REGISTRO EN VIVO */}
            {nuevosEventos.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--accent-pink)', marginBottom: '8px' }}>⚡ RADAR EN VIVO</h3>
                {nuevosEventos.map((evt, i) => (
                  <p key={i} style={{ fontSize: '0.8rem', color: '#fff', marginBottom: '4px', backgroundColor: 'rgba(234, 96, 147, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                    {evt}
                  </p>
                ))}
              </div>
            )}
          </>
        );
      case 'choferes':
        return <ChoferesPanel />;
      case 'clientes':
        return <ClientesPanel />;
      case 'incidentes':
        return <IncidentesPanel />;
      case 'admins':
        return <AdminsPanel />;
      case 'faenas':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)' }}>Faenas de Hoy</h3>
            <Button onClick={() => setIsFaenaModalOpen(true)} variant="primary">+ Crear Faena Manual</Button>
            {faenas.map(f => (
              <div key={f.id} style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Faena #{f.id.substring(0,5)}</p>
                <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Cliente: {f.clientes?.nombre}</p>
                <p style={{ fontSize: '0.8rem', color: '#aaa' }}>Vehículo: {f.vehiculos_cliente?.marca || 'N/A'} {f.vehiculos_cliente?.modelo || ''}</p>
                
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Gebo Driver (Chofer):</label>
                  <select 
                    value={f.gebo_driver_id || ''} 
                    onChange={e => adminService.updateFaenaChofer(f.faena_id, e.target.value).then(fetchInitialData)}
                    style={{ background: 'black', color: 'white', border: '1px solid #333', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="">-- Sin Asignar --</option>
                    {choferes.filter(c => c.estado === 'disponible' || c.id === f.gebo_driver_id).map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>

                  <label style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>Estado Faena:</label>
                  <select 
                    value={f.estado} 
                    onChange={e => adminService.updateFaenaEstado(f.faena_id, e.target.value).then(fetchInitialData)}
                    style={{ background: 'black', color: 'white', border: '1px solid #333', padding: '4px', borderRadius: '4px', color: '#00ffcc' }}
                  >
                    <option value="programada">Programada</option>
                    <option value="ofrecida">Ofrecida</option>
                    <option value="asignada">Asignada</option>
                    <option value="chofer_en_camino">Chofer en camino</option>
                    <option value="chofer_llegó">Chofer llegó</option>
                    <option value="en_curso">En curso</option>
                    <option value="finalizada">Finalizada</option>
                    <option value="cancelada_cliente">Cancelada Cliente</option>
                    <option value="cancelada_gebo">Cancelada Admin</option>
                  </select>
                </div>

                {['programada', 'ofrecida', 'asignada', 'en_curso'].includes(f.estado) && (
                  <button onClick={() => adminService.cancelarFaena(f.faena_id).then(fetchInitialData)} style={{ marginTop: '12px', padding: '4px 8px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>
                    Forzar Cancelación (Admin)
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      case 'vagonetas':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)' }}>Vagonetas y Traslados</h3>
            <Button onClick={() => setIsTrasladoModalOpen(true)} variant="primary">+ Crear Traslado</Button>
            <h4 style={{ marginTop: '16px', fontSize: '0.9rem' }}>Vagonetas Activas</h4>
            {vagonetas.map(v => (
              <div key={v.id} style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{v.patente} - {v.modelo} (Capacidad: {v.capacidad})</p>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#aaa', marginRight: '8px' }}>Shuttle Driver (Vagoneta):</label>
                  <select 
                    value={v.shuttle_driver_id || ''} 
                    onChange={e => adminService.asignarChoferVagoneta(v.id, e.target.value).then(fetchInitialData)}
                    style={{ background: 'black', color: 'white', border: '1px solid #333', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="">-- Sin Asignar --</option>
                    {choferes.filter(c => c.estado === 'disponible' || c.id === v.shuttle_driver_id).map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        );
      case 'tarifas':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)' }}>Configuración de Negocio</h3>
            {configuracion && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Tarifa por minuto</label>
                <input type="number" value={configuracion.tarifa_base_minuto} onChange={e => setConfiguracion({...configuracion, tarifa_base_minuto: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />
                
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Costo cancelación tardía</label>
                <input type="number" value={configuracion.costo_cancelacion_tardia} onChange={e => setConfiguracion({...configuracion, costo_cancelacion_tardia: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />
                
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Tolerancia Espera (Desacople en min)</label>
                <input type="number" value={configuracion.tolerancia_espera_minutos || 8} onChange={e => setConfiguracion({...configuracion, tolerancia_espera_minutos: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Check-in Anticipado Obligatorio (min)</label>
                <input type="number" value={configuracion.checkin_anticipado_minutos || 15} onChange={e => setConfiguracion({...configuracion, checkin_anticipado_minutos: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Límite de Conducción Continua (min)</label>
                <input type="number" value={configuracion.limite_conduccion_minutos || 240} onChange={e => setConfiguracion({...configuracion, limite_conduccion_minutos: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Descanso Obligatorio (min)</label>
                <input type="number" value={configuracion.descanso_obligatorio_minutos || 30} onChange={e => setConfiguracion({...configuracion, descanso_obligatorio_minutos: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Jornada Laboral Máxima (min)</label>
                <input type="number" value={configuracion.jornada_maxima_minutos || 480} onChange={e => setConfiguracion({...configuracion, jornada_maxima_minutos: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Límite Gasto Automático ($)</label>
                <input type="number" value={configuracion.limite_gasto_automatico || 500} onChange={e => setConfiguracion({...configuracion, limite_gasto_automatico: e.target.value})} style={{ background: 'black', color: 'white', padding: '8px', border: '1px solid #333' }} />

                <Button onClick={() => adminService.updateConfiguracion(configuracion.id, configuracion).then(() => alert("Guardado"))}>Guardar Cambios</Button>
              </div>
            )}
            
            <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)', marginTop: '24px' }}>Gastos por Aprobar</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {gastos.length === 0 ? <p style={{ fontSize: '0.8rem', color: '#aaa' }}>No hay gastos pendientes.</p> : gastos.map(g => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#111', borderRadius: '4px', borderLeft: '3px solid #ffcc00' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>$ {g.monto} - {g.categoria.toUpperCase()}</span>
                    <span style={{ fontSize: '0.7rem', color: '#888' }}>Ticket: {g.comprobante_nro} | {new Date(g.creado_at).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={async () => {
                      await supabase.from('gastos_ruta').update({ estado_gasto: 'aprobado_manual' }).eq('id', g.id);
                      fetchInitialData();
                    }} style={{ background: '#00cc66', color: 'black', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Aprobar</button>
                    <button onClick={async () => {
                      await supabase.from('gastos_ruta').update({ estado_gasto: 'rechazado' }).eq('id', g.id);
                      fetchInitialData();
                    }} style={{ background: '#cc0000', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Rechazar</button>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)', marginTop: '24px' }}>Preguntas de Checklist</h3>
            <ChecklistManager preguntasChecklist={preguntasChecklist} onFetchData={fetchInitialData} />
          </div>
        );
      case 'contabilidad':
        return <FinancialConsole finanzas={finanzas} sugerencias={sugerencias} onFetchData={fetchInitialData} />;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#111318', color: 'white', fontFamily: 'var(--font-main)' }}>
      {Object.keys(alertas).length > 0 && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', pointerEvents: 'none', border: '8px solid #ff4444', animation: 'pulse-border 1s infinite', zIndex: 9000, height: '100%' }} />
      )}
      
      {/* MAIN CONTENT/SIDEBAR */}
      <div style={{ width: activeTab === 'radar' ? '400px' : '100%', height: '100%', borderRight: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#1a1d24', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        {/* HEADER */}
        <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: '800', background: 'linear-gradient(135deg, var(--accent-magenta) 0%, var(--accent-pink) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Gebo Admin
              </h1>
              <p style={{ color: '#9ba1b0', fontSize: '0.85rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Torre de Control B2B</p>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href='/login'; }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
              Salir
            </button>
          </div>
        </div>

        {/* TABS MENU */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '0 12px' }}>
          {[
            { id: 'radar', icon: MapIcon, label: 'Radar' },
            { id: 'choferes', icon: Users, label: 'Choferes' },
            { id: 'clientes', icon: Users, label: 'Clientes' },
            { id: 'admins', icon: Settings, label: 'Admins' },
            { id: 'faenas', icon: Briefcase, label: 'Faenas' },
            { id: 'vagonetas', icon: Truck, label: 'Vagonetas' },
            { id: 'incidentes', icon: AlertOctagon, label: 'Incidentes' },
            { id: 'tarifas', icon: Settings, label: 'Tarifas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent', border: 'none', color: activeTab === tab.id ? 'var(--accent-pink)' : '#888',
                padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-pink)' : '2px solid transparent'
              }}
            >
              <tab.icon size={18} />
              <span style={{ fontSize: '0.7rem' }}>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {renderSidebarContent()}

          {/* SOS ACTIVOS */}
          <IncidentTracker alertas={alertas} onResolverAlerta={handleResolverAlerta} />
        </div>
      </div>

      {/* MAPA - Siempre renderizado de fondo para no romper Leaflet */}
      <FleetMap activeTab={activeTab} shuttleDriversPos={shuttleDriversPos} faenas={faenas} />

      {/* MODAL CREAR TRASLADO */}
      {isTrasladoModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '500px', position: 'relative' }}>
            <button onClick={() => setIsTrasladoModalOpen(false)} style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: '#9ba1b0', cursor: 'pointer' }}><X size={24} /></button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--accent-magenta)' }}>Nuevo Traslado de Vagoneta</h2>
            <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '16px' }}>En esta iteración, el traslado se crea ingresando la vagoneta y asignando al chofer en un punto manual. La optimización será en el futuro.</p>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              const vag = e.target.vagoneta.value;
              const chof = e.target.chofer.value;
              const lat = parseFloat(e.target.lat.value);
              const lng = parseFloat(e.target.lng.value);
              try {
                await adminService.crearTraslado(vag, [{ gebo_driver_id: chof, lat, lng, tipo: 'recogida' }]);
                setIsTrasladoModalOpen(false);
                alert("Traslado creado exitosamente");
              } catch (err) {
                alert(err.message);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <select name="vagoneta" required style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }}>
                <option value="">Seleccione Vagoneta...</option>
                {vagonetas.map(v => <option key={v.id} value={v.id}>{v.patente}</option>)}
              </select>
              <select name="chofer" required style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }}>
                <option value="">Seleccione Chofer a recoger...</option>
                {choferes.filter(c => c.estado === 'disponible').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input name="lat" placeholder="Latitud (-34.901)" required style={{ flex: 1, padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }} />
                <input name="lng" placeholder="Longitud (-56.164)" required style={{ flex: 1, padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }} />
              </div>
              <Button type="submit" variant="primary">Programar Traslado</Button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CREAR FAENA */}
      {isFaenaModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#1a1d24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '500px', position: 'relative' }}>
            <button onClick={() => setIsFaenaModalOpen(false)} style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: '#9ba1b0', cursor: 'pointer' }}><X size={24} /></button>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--accent-magenta)' }}>Nueva Faena Manual</h2>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                if (!window.origenCoords || !window.destinoCoords) {
                  throw new Error("Debe seleccionar origen y destino de la lista");
                }
                const coordsOrigen = window.origenCoords;
                const coordsDestino = window.destinoCoords;

                const payload = {
                  cliente_id: e.target.cliente.value,
                  chofer_id: e.target.chofer.value || null,
                  lat_origen: coordsOrigen.lat,
                  lng_origen: coordsOrigen.lng,
                  lat_destino: coordsDestino.lat,
                  lng_destino: coordsDestino.lng,
                };
                
                await adminService.crearFaenaManual(payload);
                setIsFaenaModalOpen(false);
                fetchInitialData();
                alert("Faena creada exitosamente");
              } catch (err) {
                alert(err.message);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <select name="cliente" required style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }}>
                <option value="">Seleccione Cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <select name="chofer" style={{ width: '100%', padding: '12px', borderRadius: '12px', backgroundColor: 'black', color: 'white', border: '1px solid #333' }}>
                <option value="">Sin Asignar (Algoritmo Automático)</option>
                {choferes.filter(c => c.estado === 'disponible').map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              
              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Dirección de Origen</label>
                <DireccionInput placeholder="Ej: 18 de Julio 1234, Montevideo" onAddressSelect={(c) => window.origenCoords = c} />
              </div>

              <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Dirección de Destino</label>
                <DireccionInput placeholder="Ej: Bulevar Artigas 2000, Montevideo" onAddressSelect={(c) => window.destinoCoords = c} />
              </div>

              <Button type="submit" variant="primary">Crear Faena</Button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-border {
          0% { border-color: rgba(255, 68, 68, 1); box-shadow: inset 0 0 50px rgba(255,68,68,0.5); }
          50% { border-color: rgba(255, 68, 68, 0.2); box-shadow: inset 0 0 10px rgba(255,68,68,0.1); }
          100% { border-color: rgba(255, 68, 68, 1); box-shadow: inset 0 0 50px rgba(255,68,68,0.5); }
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
