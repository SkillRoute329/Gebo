import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Search, MapPin, Car, CreditCard } from 'lucide-react';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { parseEWKB, haversineDistance, calculateETA } from '../../lib/utils';

const ORIGEN_COORDS = [-34.9011, -56.1645]; // Ej: 18 de Julio y Ejido
const DESTINO_COORDS = [-34.891, -56.148]; // Ej: Bv Artigas

const ClienteApp = () => {
  const [step, setStep] = useState('seleccionar-destino'); // seleccionar-destino | presupuesto | buscando | asignado | en_curso
  const [categoria, setCategoria] = useState('standard');
  const [viajeId, setViajeId] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [choferAsignadoId, setChoferAsignadoId] = useState(null);
  const [choferPos, setChoferPos] = useState(null); // [lat, lng]
  const [eta, setEta] = useState(null);
  const [session, setSession] = useState(null);
  const [asignadoEn, setAsignadoEn] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPenalty, setCancelPenalty] = useState(0);
  const [config, setConfig] = useState({ penalizacion: 30, ventana: 2 });
  
  const [sosActive, setSosActive] = useState(false);
  const [sosId, setSosId] = useState(null);
  const [sosTimeout, setSosTimeout] = useState(null);
  const [etaAlert, setEtaAlert] = useState(null);

  // Tarifas estimadas
  const distKm = haversineDistance(ORIGEN_COORDS, DESTINO_COORDS);
  const tarifaStandard = Math.round(50 + distKm * 40); // Base 50 + 40/km
  const tarifaPremium = Math.round(100 + distKm * 60); // Base 100 + 60/km

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    
    // Cargar config
    const loadConfig = async () => {
      const { data } = await supabase.from('configuracion_negocio').select('*');
      if (data) {
        const p = data.find(c => c.clave === 'penalizacion_cancelacion_tardia_uyu')?.valor || 30;
        const v = data.find(c => c.clave === 'ventana_gracia_cliente_mins')?.valor || 2;
        setConfig({ penalizacion: Number(p), ventana: Number(v) });
      }
    };
    loadConfig();
  }, []);

  useEffect(() => {
    if (!session) return;
    
    // Carga inicial (Punto 1: Evitar Race Condition)
    const loadInitialState = async () => {
      // Find cliente
      const { data: cliente } = await supabase.from('clientes').select('id').eq('usuario_id', session.user.id).single();
      if (!cliente) return;
      setClienteId(cliente.id);
      
      // Find active trip (faenas)
      const { data } = await supabase.from('faenas')
        .select('*')
        .eq('cliente_id', cliente.id)
        .not('estado', 'in', '("cancelada_cliente","cancelada_gebo","finalizada")')
        .order('fecha_hora_programada', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setViajeId(data.id);
        if (['asignada', 'chofer_en_camino', 'chofer_llegÃ³'].includes(data.estado)) {
          setStep('asignado');
          if (data.chofer_id || data.chofer_ofrecido_id) setChoferAsignadoId(data.chofer_id || data.chofer_ofrecido_id);
          if (data.asignada_en) setAsignadoEn(new Date(data.asignada_en));
        } else if (data.estado === 'en_curso') {
          setStep('en_curso');
        } else if (data.estado === 'programada' || data.estado === 'ofrecida') {
          setStep('buscando');
        }
      }
    };
    loadInitialState();

    // SuscripciÃ³n a cambios del viaje
    if (!viajeId) return;

    const channelViaje = supabase
      .channel(`viaje-${viajeId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'faenas', filter: `id=eq.${viajeId}` }, (payload) => {
        const faena = payload.new;
        if (['asignada', 'chofer_en_camino', 'chofer_llegÃ³'].includes(faena.estado)) {
          setStep('asignado');
          if (faena.chofer_id || faena.chofer_ofrecido_id) setChoferAsignadoId(faena.chofer_id || faena.chofer_ofrecido_id);
          if (faena.asignada_en) setAsignadoEn(new Date(faena.asignada_en));
        } else if (faena.estado === 'en_curso') {
          setStep('en_curso');
        } else if (['finalizada', 'cancelada_gebo', 'cancelada_cliente'].includes(faena.estado)) {
          setStep('seleccionar-destino');
          setViajeId(null);
          setChoferAsignadoId(null);
          setAsignadoEn(null);
          if (faena.estado === 'cancelada_gebo') alert('El viaje fue cancelado por la administraciÃ³n o el chofer.');
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channelViaje);
  }, [viajeId, session]);

  // SuscripciÃ³n a posiciones del chofer asignado
  useEffect(() => {
    if (!choferAsignadoId) return;

    // Obtener posiciÃ³n inicial
    supabase.from('posiciones').select('*').eq('chofer_id', choferAsignadoId).order('timestamp', { ascending: false }).limit(1).then(({ data }) => {
      if (data && data.length > 0) {
        const p = data[0].ubicacion;
        const coords = typeof p === 'string' ? parseEWKB(p) : (p && p.type === 'Point' ? [p.coordinates[1], p.coordinates[0]] : null);
        if (coords) updatePosAndETA(coords);
      }
    });

    const channelPos = supabase
      .channel(`posiciones-${choferAsignadoId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posiciones', filter: `chofer_id=eq.${choferAsignadoId}` }, (payload) => {
        const p = payload.new.ubicacion;
        const coords = typeof p === 'string' ? parseEWKB(p) : (p && p.type === 'Point' ? [p.coordinates[1], p.coordinates[0]] : null);
        if (coords) updatePosAndETA(coords);
      })
      .subscribe();

    return () => supabase.removeChannel(channelPos);
  }, [choferAsignadoId, step]);

  const updatePosAndETA = (coords) => {
    setChoferPos(coords);
    // ETA al origen si estÃ¡ asignado, o al destino si estÃ¡ en curso
    const targetCoords = step === 'en_curso' ? DESTINO_COORDS : ORIGEN_COORDS;
    const dist = haversineDistance(coords, targetCoords);
    const mins = calculateETA(dist, 25); // 25 km/h avg
    
    setEta(prevEta => {
      if (prevEta !== null && mins > prevEta) {
        if (mins >= prevEta + 5 || mins >= prevEta * 1.5) {
          setEtaAlert(`El chofer se ha retrasado. Nuevo ETA: ${mins} min`);
          setTimeout(() => setEtaAlert(null), 8000);
        }
      }
      return mins;
    });
  };

  const handlePedirViaje = async () => {
    if (!session) return alert("No autenticado");
    if (!clienteId) return alert("Cliente no encontrado en la base de datos.");
    setStep('buscando');
    const origenWKT = `POINT(${ORIGEN_COORDS[1]} ${ORIGEN_COORDS[0]})`;
    const destinoWKT = `POINT(${DESTINO_COORDS[1]} ${DESTINO_COORDS[0]})`;

    const { data, error } = await supabase
      .from('faenas')
      .insert([{ 
        cliente_id: clienteId,
        origen: origenWKT,
        destino: destinoWKT,
        estado: 'programada',
        modalidad: 'por_minuto',
        fecha_hora_programada: new Date().toISOString()
      }])
      .select();
      
    if (error) {
      console.error("Error pidiendo viaje:", error);
      alert("Error: " + error.message);
      setStep('presupuesto');
    } else if (data && data.length > 0) {
      setViajeId(data[0].id);
    }
  };

  const handleSOS = async () => {
    if (!viajeId || !session) return;
    
    // Obtenemos coords actuales (usamos ORIGEN_COORDS si no hay geo, para simplificar en demo)
    let lat = null, lng = null;
    if ("geolocation" in navigator) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, {timeout: 5000}));
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (e) {
        console.warn("SOS sin GPS");
      }
    }

    const { data, error } = await supabase.from('alertas_emergencia').insert([{
      viaje_id: viajeId,
      emisor_id: session.user.id,
      tipo_emisor: 'cliente',
      ubicacion_lat: lat,
      ubicacion_lng: lng
    }]).select();

    if (!error && data) {
      setSosActive(true);
      setSosId(data[0].id);
      
      // Permitir cancelar falsa alarma por 10 segundos
      const timer = setTimeout(() => {
        setSosTimeout(null);
      }, 10000);
      setSosTimeout(timer);
    }
  };

  const handleCancelSOS = async () => {
    if (!sosId) return;
    await supabase.from('alertas_emergencia').update({ estado: 'falsa_alarma' }).eq('id', sosId);
    setSosActive(false);
    setSosId(null);
    if (sosTimeout) clearTimeout(sosTimeout);
    setSosTimeout(null);
  };

  const handleIntentarCancelar = () => {
    let penalty = 0;
    if (step === 'asignado' && asignadoEn) {
      const diffMins = (new Date() - asignadoEn) / 60000;
      if (diffMins > config.ventana) penalty = config.penalizacion;
    }
    setCancelPenalty(penalty);
    setShowCancelModal(true);
  };

  const confirmarCancelacion = async () => {
    if (!viajeId) return;
    try {
      const { error } = await supabase.from('faenas').update({ estado: 'cancelada_cliente' }).eq('id', viajeId);
      if (error) throw error;
      setShowCancelModal(false);
      setStep('seleccionar-destino');
      setViajeId(null);
      setChoferAsignadoId(null);
      setAsignadoEn(null);
    } catch (err) {
      console.error(err);
      alert('Error cancelando viaje: ' + err.message);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', backgroundColor: '#f8f9fa', color: '#1a1d24' }}>
      
      {/* MODAL CANCELAR */}
      {showCancelModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '12px' }}>Â¿Cancelar viaje?</h3>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              {cancelPenalty > 0 
                ? `Han pasado mÃ¡s de ${config.ventana} minutos desde la asignaciÃ³n. Se aplicarÃ¡ un cargo por cancelaciÃ³n de $${cancelPenalty} UYU.`
                : 'Puedes cancelar ahora sin ningÃºn costo.'}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowCancelModal(false)} style={{ flex: 1, padding: '12px', border: 'none', backgroundColor: '#f1f3f5', borderRadius: '8px', fontWeight: 'bold' }}>Mantener viaje</button>
              <button onClick={confirmarCancelacion} style={{ flex: 1, padding: '12px', border: 'none', backgroundColor: '#ff4444', color: 'white', borderRadius: '8px', fontWeight: 'bold' }}>SÃ­, cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MAPA INTERACTIVO CLARO */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
        <MapContainer 
          center={ORIGEN_COORDS} 
          zoom={14} 
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <Marker position={ORIGEN_COORDS}>
            <Popup>Origen</Popup>
          </Marker>
          <Marker position={DESTINO_COORDS}>
            <Popup>Destino</Popup>
          </Marker>
          {choferPos && (
            <Marker position={choferPos}>
              <Popup>Chofer</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* HEADER CLIENTE */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', zIndex: 10,
        padding: '20px', background: 'linear-gradient(to bottom, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-magenta)', margin: 0 }}>Gebo</h2>
        <button 
          onClick={async () => { await supabase.auth.signOut(); window.location.href='/login'; }}
          style={{ background: 'rgba(0,0,0,0.05)', border: 'none', padding: '8px 16px', borderRadius: '20px', color: '#1a1d24', fontWeight: '600', cursor: 'pointer' }}
        >
          Cerrar SesiÃ³n
        </button>
      </div>

      {/* PANEL INFERIOR DINAMICO */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, width: '100%', zIndex: 10,
        backgroundColor: '#ffffff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px',
        padding: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.08)'
      }}>

        {/* ALERTA ETA */}
        {etaAlert && (
          <div style={{
            position: 'absolute', top: '-140px', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: '#ff9800', color: 'white', padding: '12px 24px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(255, 152, 0, 0.4)', zIndex: 30, width: '90%', textAlign: 'center',
            fontWeight: 'bold', animation: 'fadeInOut 8s forwards'
          }}>
            âš ï¸ {etaAlert}
          </div>
        )}
        
        {/* BOTÃ“N SOS FLOTANTE (Solo cuando asignado/en_curso) */}
        {(step === 'asignado' || step === 'en_curso') && (
          <div style={{ position: 'absolute', top: '-70px', right: '24px', zIndex: 20 }}>
            {sosActive ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                <div style={{ backgroundColor: '#ff4444', color: 'white', padding: '12px 20px', borderRadius: '30px', fontWeight: 'bold', animation: 'pulse 1s infinite', boxShadow: '0 4px 15px rgba(255,68,68,0.5)' }}>
                  ALERTA EMITIDA
                </div>
                {sosTimeout && (
                  <button 
                    onClick={handleCancelSOS}
                    style={{ backgroundColor: 'white', color: '#ff4444', border: '1px solid #ff4444', padding: '8px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Cancelar - Fue un error
                  </button>
                )}
              </div>
            ) : (
              <button 
                onClick={handleSOS}
                style={{ 
                  backgroundColor: '#ff4444', color: 'white', border: 'none', 
                  width: '60px', height: '60px', borderRadius: '50%', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '900', fontSize: '1.2rem', boxShadow: '0 4px 15px rgba(255,68,68,0.4)',
                  cursor: 'pointer'
                }}
              >
                SOS
              </button>
            )}
          </div>
        )}
        
        {step === 'seleccionar-destino' && (
          <div>
            <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', color: '#1a1d24' }}>Â¿A dÃ³nde vamos hoy?</h3>
            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f3f5', borderRadius: '12px', padding: '12px 16px', marginBottom: '16px' }}>
              <Search size={20} color="#9ba1b0" style={{ marginRight: '12px' }} />
              <input 
                type="text" 
                placeholder="Buscar destino..." 
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '1rem', color: '#1a1d24' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f1f3f5', cursor: 'pointer' }} onClick={() => setStep('presupuesto')}>
              <div style={{ background: 'rgba(234, 96, 147, 0.1)', padding: '8px', borderRadius: '50%' }}>
                <MapPin size={20} color="var(--accent-magenta)" />
              </div>
              <div>
                <p style={{ fontWeight: '600' }}>Aeropuerto Internacional de Carrasco</p>
                <p style={{ fontSize: '0.85rem', color: '#9ba1b0' }}>Ruta 101 km 19.950</p>
              </div>
            </div>
          </div>
        )}

        {step === 'presupuesto' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }} onClick={() => setStep('seleccionar-destino')}>
              <MapPin size={20} color="var(--accent-magenta)" />
              <p style={{ fontWeight: '600' }}>Hacia: Aeropuerto Carrasco</p>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '8px' }}>
              <div 
                onClick={() => setCategoria('standard')}
                style={{ 
                  flex: 1, minWidth: '100px', border: categoria === 'standard' ? '2px solid var(--accent-magenta)' : '2px solid #f1f3f5', 
                  borderRadius: '12px', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                  backgroundColor: categoria === 'standard' ? 'rgba(234, 96, 147, 0.05)' : 'white'
                }}
              >
                <Car size={32} color={categoria === 'standard' ? 'var(--accent-magenta)' : '#9ba1b0'} style={{ margin: '0 auto 8px auto' }} />
                <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#1a1d24' }}>GeboX</p>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent-magenta)' }}>${tarifaStandard}</p>
              </div>
              
              <div 
                onClick={() => setCategoria('premium')}
                style={{ 
                  flex: 1, minWidth: '100px', border: categoria === 'premium' ? '2px solid var(--accent-magenta)' : '2px solid #f1f3f5', 
                  borderRadius: '12px', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
                  backgroundColor: categoria === 'premium' ? 'rgba(234, 96, 147, 0.05)' : 'white'
                }}
              >
                <Car size={32} color={categoria === 'premium' ? 'var(--accent-magenta)' : '#9ba1b0'} style={{ margin: '0 auto 8px auto' }} />
                <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#1a1d24' }}>Premium</p>
                <p style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent-magenta)' }}>${tarifaPremium}</p>
              </div>
            </div>

            {/* PolÃ­tica de PenalizaciÃ³n (Transparencia) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ffeeba' }}>
              <CreditCard size={18} color="#856404" style={{ minWidth: '18px' }} />
              <p style={{ fontSize: '0.8rem', color: '#856404', margin: 0, lineHeight: 1.4 }}>
                <strong>PolÃ­tica de espera:</strong> El chofer aguardarÃ¡ 5 min sin costo. Luego aplica una penalidad de <strong>$50 UYU/min</strong>.
              </p>
            </div>

            <Button variant="primary" onClick={handlePedirViaje}>
              Confirmar Gebo
            </Button>
          </div>
        )}

        {step === 'buscando' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: '50px', height: '50px', border: '4px solid #f1f3f5', borderTop: '4px solid var(--accent-magenta)', borderRadius: '50%', margin: '0 auto 20px auto', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ marginBottom: '8px' }}>Buscando al mejor chofer...</h3>
            <p style={{ color: '#9ba1b0', fontSize: '0.9rem', marginBottom: '24px' }}>Conectando con conductores Premium en la zona.</p>
            <button onClick={handleIntentarCancelar} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontWeight: 'bold', textDecoration: 'underline' }}>Cancelar Viaje</button>
          </div>
        )}

        {step === 'asignado' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ marginBottom: '8px', color: 'var(--accent-magenta)' }}>Â¡Chofer Asignado!</h3>
            <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>El chofer estÃ¡ en camino</p>
            {eta !== null && (
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'rgba(234, 96, 147, 0.1)', borderRadius: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '0.9rem', color: '#1a1d24' }}>Llega en aproximadamente</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--accent-magenta)' }}>{eta} min</p>
              </div>
            )}
            <button onClick={handleIntentarCancelar} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontWeight: 'bold', textDecoration: 'underline' }}>Cancelar Viaje</button>
          </div>
        )}
        
        {step === 'en_curso' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ marginBottom: '8px', color: '#00ffcc' }}>Viaje en Curso</h3>
            <p style={{ fontSize: '1.1rem', fontWeight: '600' }}>DirigiÃ©ndose al destino</p>
            {eta !== null && (
              <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'rgba(0, 255, 204, 0.1)', borderRadius: '12px' }}>
                <p style={{ fontSize: '0.9rem', color: '#1a1d24' }}>Llega al destino en</p>
                <p style={{ fontSize: '2rem', fontWeight: '800', color: '#00ccaa' }}>{eta} min</p>
              </div>
            )}
          </div>
        )}

      </div>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes fadeInOut { 0% { opacity: 0; transform: translate(-50%, 10px); } 10% { opacity: 1; transform: translate(-50%, 0); } 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -10px); } }
      `}</style>
    </div>
  );
};

export default ClienteApp;
