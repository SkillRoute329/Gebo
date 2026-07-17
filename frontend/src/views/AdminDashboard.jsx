import React, { useState, useEffect } from 'react';
import { Users, AlertTriangle, TrendingUp, Plus, X, Settings, Map as MapIcon, Truck, Briefcase } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { AlertOctagon } from 'lucide-react';
import Button from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { parseEWKB } from '../lib/utils';
import { adminService } from '../services/adminService';
import ChoferesPanel from './admin/ChoferesPanel';
import ClientesPanel from './admin/ClientesPanel';
import IncidentesPanel from './admin/IncidentesPanel';
import AdminsPanel from './admin/AdminsPanel';
import DireccionInput from '../components/ui/DireccionInput';
import { Polygon } from 'react-leaflet';

// Utilidad nativa ligera para calcular los bordes de un hexágono H3 (res 8 ~700m)
const getHexagonPolygon = (lat, lng, radiusMeters = 700) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30; // Rotación para hexágono con punta arriba
    const angle_rad = Math.PI / 180 * angle_deg;
    const dLat = (radiusMeters * Math.sin(angle_rad)) / 111320;
    const dLng = (radiusMeters * Math.cos(angle_rad)) / (111320 * Math.cos(lat * (Math.PI / 180)));
    points.push([lat + dLat, lng + dLng]);
  }
  return points;
};

// Aproximación del vecindario k=1 de H3 (aprox 1500m a la redonda)
const haversineDist = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};
const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('radar');
  
  // Radar data
  const [choferesActivosRadar, setChoferesActivosRadar] = useState(0);
  const [faenasEnCurso, setFaenasEnCurso] = useState(0);
  const [nuevosEventos, setNuevosEventos] = useState([]);
  const [choferesPos, setChoferesPos] = useState({}); // { chofer_id: { lat, lng, estado, nombre } }
  
  // Data lists
  const [choferes, setChoferes] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [vagonetas, setVagonetas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [configuracion, setConfiguracion] = useState(null);

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
        setChoferesPos(prev => {
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
          const choferId = vag?.chofer_vagoneta_id;
          if (!choferId) return;

          let coords = null;
          if (typeof p.ultima_posicion === 'string') coords = parseEWKB(p.ultima_posicion);
          else if (p.ultima_posicion && p.ultima_posicion.type === 'Point') coords = [p.ultima_posicion.coordinates[1], p.ultima_posicion.coordinates[0]];
          
          if (coords) {
            setChoferesPos(prev => {
              const existing = prev[choferId] || {};
              let estado = existing.estado || p.estado;
              let nombre = existing.nombre;
              if (!nombre) {
                 setChoferes(chofs => {
                   const c = chofs.find(x => x.id === choferId);
                   if (c) { nombre = c.nombre; }
                   return chofs;
                 });
              }
              return {
                ...prev,
                [choferId]: { ...existing, lat: coords[0], lng: coords[1], estado, nombre }
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

    return () => {
      supabase.removeChannel(channelFaenas);
      supabase.removeChannel(channelChoferesRadar);
      supabase.removeChannel(channelPosiciones);
      supabase.removeChannel(channelSOS);
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
        const choferId = p.vagonetas?.chofer_vagoneta_id;
        if (!choferId) return;
        const chof = chofs.find(c => c.id === choferId);
        let coords = null;
        if (typeof p.ultima_posicion === 'string') coords = parseEWKB(p.ultima_posicion);
        else if (p.ultima_posicion && p.ultima_posicion.type === 'Point') coords = [p.ultima_posicion.coordinates[1], p.ultima_posicion.coordinates[0]];
        if (coords) {
          cPos[choferId] = { lat: coords[0], lng: coords[1], estado: p.estado || chof?.estado, nombre: chof?.nombre };
        }
      });
      setChoferesPos(cPos);

      const fns = await adminService.getFaenasDelDia();
      setFaenas(fns);
      setFaenasEnCurso(fns.filter(f => ['ofrecida', 'asignada', 'en_curso'].includes(f.estado)).length);

      const vags = await adminService.getVagonetas();
      setVagonetas(vags);

      const clis = await adminService.getClientes();
      setClientes(clis);

      const conf = await adminService.getConfiguracion();
      setConfiguracion(conf);
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolverAlerta = async (alertaId) => {
    await supabase.from('alertas_emergencia').update({ estado: 'resuelta' }).eq('id', alertaId);
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
                  <label style={{ fontSize: '0.8rem', color: '#aaa' }}>Chofer Asignado:</label>
                  <select 
                    value={f.chofer_id || ''} 
                    onChange={e => adminService.updateFaenaChofer(f.id, e.target.value).then(fetchInitialData)}
                    style={{ background: 'black', color: 'white', border: '1px solid #333', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="">-- Sin Asignar --</option>
                    {choferes.filter(c => c.estado === 'disponible' || c.id === f.chofer_id).map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>

                  <label style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>Estado Faena:</label>
                  <select 
                    value={f.estado} 
                    onChange={e => adminService.updateFaenaEstado(f.id, e.target.value).then(fetchInitialData)}
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
                  <button onClick={() => adminService.cancelarFaena(f.id).then(fetchInitialData)} style={{ marginTop: '12px', padding: '4px 8px', background: '#ff4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '100%' }}>
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
                  <label style={{ fontSize: '0.8rem', color: '#aaa', marginRight: '8px' }}>Chofer Asignado:</label>
                  <select 
                    value={v.chofer_vagoneta_id || ''} 
                    onChange={e => adminService.asignarChoferVagoneta(v.id, e.target.value).then(fetchInitialData)}
                    style={{ background: 'black', color: 'white', border: '1px solid #333', padding: '4px', borderRadius: '4px' }}
                  >
                    <option value="">-- Sin Asignar --</option>
                    {choferes.filter(c => c.estado === 'disponible' || c.id === v.chofer_vagoneta_id).map(c => (
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

                <Button onClick={() => adminService.updateConfiguracion(configuracion.id, configuracion).then(() => alert("Guardado"))}>Guardar Cambios</Button>
              </div>
            )}
          </div>
        );
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
          {Object.keys(alertas).length > 0 && (
            <div style={{ marginTop: '24px', backgroundColor: 'rgba(255,0,0,0.1)', padding: '16px', borderRadius: '12px', border: '1px solid #ff4444' }}>
              <h3 style={{ color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><AlertTriangle size={20} /> ¡ALERTA SOS ACTIVA!</h3>
              {Object.values(alertas).map(alerta => (
                <div key={alerta.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,0,0,0.2)' }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Emisor: {alerta.tipo_emisor.toUpperCase()}</p>
                  <p style={{ fontSize: '0.8rem', color: '#ffaaaa' }}>Viaje: #{alerta.viaje_id?.substring(0,8)}</p>
                  <button onClick={() => handleResolverAlerta(alerta.id)} style={{ backgroundColor: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', width: '100%', marginTop: '8px' }}>Marcar Resuelta</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MAPA - Siempre renderizado de fondo para no romper Leaflet */}
      <div style={{ 
        flex: activeTab === 'radar' ? 1 : 'none', 
        position: activeTab === 'radar' ? 'relative' : 'absolute',
        width: activeTab === 'radar' ? 'auto' : '100%',
        height: '100%',
        opacity: activeTab === 'radar' ? 1 : 0,
        pointerEvents: activeTab === 'radar' ? 'auto' : 'none',
        zIndex: activeTab === 'radar' ? 0 : -1
      }}>
        <MapContainer center={[-34.9011, -56.1645]} zoom={13} style={{ width: '100%', height: '100%', backgroundColor: '#111318', zIndex: 0 }}>
          <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          
          {/* Posiciones de Choferes Activos (en faena o traslado) */}
          {Object.entries(choferesPos).map(([id, pos]) => {
            if (pos.estado === 'en_faena' || pos.estado === 'en_traslado') {
              return (
                <Marker key={id} position={[pos.lat, pos.lng]}>
                  <Popup>{pos.nombre || id.substring(0, 8)} - {pos.estado}</Popup>
                </Marker>
              );
            }
            // Si el admin está en Radar, capaz quiere ver todos los disponibles también
            if (activeTab === 'radar') {
               return (
                <Marker key={id} position={[pos.lat, pos.lng]}>
                  <Popup>{pos.nombre || id.substring(0, 8)} - {pos.estado}</Popup>
                </Marker>
              );
            }
            return null;
          })}

          {/* Faenas (Origen y Destino) */}
          {faenas.filter(f => !['finalizada', 'cancelada_cliente', 'cancelada_gebo'].includes(f.estado)).map(f => {
            let ocoords = null, dcoords = null;
            if (typeof f.origen === 'string') ocoords = parseEWKB(f.origen);
            else if (f.origen?.type === 'Point') ocoords = [f.origen.coordinates[1], f.origen.coordinates[0]];
            
            if (typeof f.destino === 'string') dcoords = parseEWKB(f.destino);
            else if (f.destino?.type === 'Point') dcoords = [f.destino.coordinates[1], f.destino.coordinates[0]];

            const olat = ocoords?.[0], olng = ocoords?.[1];
            const dlat = dcoords?.[0], dlng = dcoords?.[1];

            if (olat && dlat) {
              return (
                <React.Fragment key={`faena-${f.id}`}>
                  <Marker position={[olat, olng]}><Popup>Origen Faena {f.id.substring(0,5)}</Popup></Marker>
                  <Marker position={[dlat, dlng]}><Popup>Destino Faena {f.id.substring(0,5)}</Popup></Marker>
                  <Polyline positions={[[olat, olng], [dlat, dlng]]} color="#ea6093" dashArray="5, 10" />
                </React.Fragment>
              );
            }
            return null;
          })}
          {/* Capa Dinámica de Hexágonos de Escasez H3 */}
          {faenas.filter(f => ['programada', 'ofrecida'].includes(f.estado)).map(f => {
            let ocoords = null;
            if (typeof f.origen === 'string') ocoords = parseEWKB(f.origen);
            else if (f.origen?.type === 'Point') ocoords = [f.origen.coordinates[1], f.origen.coordinates[0]];
            
            if (ocoords) {
              const [olat, olng] = ocoords;
              
              // Lógica Adaptador k=1 (Búsqueda en anillo H3 aproximado a 1500m)
              let isHotZone = true;
              Object.values(choferesPos).forEach(pos => {
                if (pos.estado === 'disponible') {
                  const dist = haversineDist(olat, olng, pos.lat, pos.lng);
                  if (dist <= 1500) {
                    isHotZone = false;
                  }
                }
              });

              if (isHotZone) {
                const hexPolygon = getHexagonPolygon(olat, olng, 700); // 700m radio = Res 8
                return (
                  <Polygon 
                    key={`h3-escasez-${f.id}`}
                    positions={hexPolygon} 
                    pathOptions={{ 
                      fillColor: '#ff4444', 
                      fillOpacity: 0.35, 
                      color: '#ff4444', 
                      weight: 1, 
                      dashArray: '3, 6' 
                    }}
                  >
                    <Popup>
                      Zona de Escasez<br/>
                      H3: <strong>{f.origen_h3_res8 || 'Autocalculando...'}</strong><br/>
                      Sin flota disponible en anillo k=1
                    </Popup>
                  </Polygon>
                );
              }
            }
            return null;
          })}
        </MapContainer>
        <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'rgba(26, 29, 36, 0.9)', backdropFilter: 'blur(10px)', padding: '12px 20px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ffcc', boxShadow: '0 0 10px #00ffcc' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>WSS Conectado</span>
          </div>
        </div>
      </div>

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
                await adminService.crearTraslado(vag, [{ chofer_id: chof, lat, lng, tipo: 'recogida' }]);
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
