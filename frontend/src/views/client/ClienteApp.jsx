import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { Search, MapPin, Car, CreditCard, Plus, Clock, Download } from 'lucide-react';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { parseEWKB, haversineDistance, calculateETA } from '../../lib/utils';
import DireccionInput from '../../components/ui/DireccionInput';
import ChatPanel from '../../components/ui/ChatPanel';

const ClienteApp = () => {
  const [step, setStep] = useState('loading'); // loading | onboarding | mis_vehiculos | seleccionar-destino | presupuesto | buscando | asignado | en_curso | resumen
  const [session, setSession] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  
  // Vehiculos
  const [vehiculos, setVehiculos] = useState([]);
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState(null);
  const [showAddVehiculo, setShowAddVehiculo] = useState(false);

  // Faena
  const [viajeId, setViajeId] = useState(null);
  const [faenaActual, setFaenaActual] = useState(null);
  const [choferAsignado, setChoferAsignado] = useState(null);
  const [choferPos, setChoferPos] = useState(null); // [lat, lng]
  
  // Solicitud
  const [origenCoords, setOrigenCoords] = useState(null);
  const [destinoCoords, setDestinoCoords] = useState(null);
  const [modalidad, setModalidad] = useState('por_minuto');
  const [tipoViaje, setTipoViaje] = useState('inmediata');
  const [fechaProgramada, setFechaProgramada] = useState('');
  
  // Popups
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  // Chat
  const [showChat, setShowChat] = useState(false);
  
  
  // ETA & Tiempos
  const [eta, setEta] = useState(null);
  const [etaAlert, setEtaAlert] = useState(null);
  const [asignadoEn, setAsignadoEn] = useState(null);
  const [tiempoTranscurrido, setTiempoTranscurrido] = useState(0); // en segundos
  
  // Configs
  const [config, setConfig] = useState({ penalizacion: 50, ventana: 5, tarifa_por_minuto: 30, tarifa_por_hora: 1200, dia_completo: 5000 });
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPenalty, setCancelPenalty] = useState(0);
  
  // SOS
  const [sosActive, setSosActive] = useState(false);
  const [sosId, setSosId] = useState(null);
  const [sosTimeout, setSosTimeout] = useState(null);

  // Demo searching timer
  const [secondsWaiting, setSecondsWaiting] = useState(0);
  useEffect(() => {
    let int;
    if (step === 'buscando') {
      int = setInterval(() => setSecondsWaiting(s => s+1), 1000);
    } else {
      setSecondsWaiting(0);
    }
    return () => { if (int) clearInterval(int); }
  }, [step]);

  // Carga inicial
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    
    const loadConfig = async () => {
      const { data } = await supabase.from('configuracion_negocio').select('*');
      if (data) {
        setConfig(prev => ({
          ...prev,
          penalizacion: Number(data.find(c => c.clave === 'penalizacion_cancelacion_tardia_uyu')?.valor || 50),
          ventana: Number(data.find(c => c.clave === 'ventana_gracia_cliente_mins')?.valor || 5),
          tarifa_por_minuto: Number(data.find(c => c.clave === 'tarifa_por_minuto_uyu')?.valor || 30),
          tarifa_por_hora: Number(data.find(c => c.clave === 'tarifa_por_hora_uyu')?.valor || 1200),
          dia_completo: Number(data.find(c => c.clave === 'tarifa_dia_completo_uyu')?.valor || 5000)
        }));
      }
    };
    loadConfig();
  }, []);

  const loadVehiculos = async (cId) => {
    const { data } = await supabase.from('vehiculos_cliente').select('*').eq('cliente_id', cId);
    setVehiculos(data || []);
    return data || [];
  };

  useEffect(() => {
    if (!session) return;
    
    const loadInitialState = async () => {
      const { data: cliente } = await supabase.from('clientes').select('id').eq('usuario_id', session.user.id).single();
      if (!cliente) return;
      setClienteId(cliente.id);
      
      const vehs = await loadVehiculos(cliente.id);

      const { data: faena } = await supabase.from('faenas')
        .select('*, choferes!faenas_chofer_id_fkey(*)')
        .eq('cliente_id', cliente.id)
        .order('fecha_hora_programada', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (faena && !['cancelada_cliente', 'cancelada_gebo'].includes(faena.estado)) {
        setFaenaActual(faena);
        setViajeId(faena.id);
        
        // Coordenadas
        const oCoords = typeof faena.origen === 'string' ? parseEWKB(faena.origen) : null;
        const dCoords = typeof faena.destino === 'string' ? parseEWKB(faena.destino) : null;
        if (oCoords) setOrigenCoords({ lat: oCoords[0], lng: oCoords[1] });
        if (dCoords) setDestinoCoords({ lat: dCoords[0], lng: dCoords[1] });

        if (faena.estado === 'finalizada') {
          // Check si acaban de finalizarla (hoy) o si es vieja. Si es vieja, vamos a onboarding
          const diffHs = (new Date() - new Date(faena.fecha_hora_fin_real)) / 3600000;
          if (diffHs < 1) {
            setStep('resumen');
          } else {
            setStep(vehs.length === 0 ? 'onboarding' : 'mis_vehiculos');
          }
        } else if (['asignada', 'chofer_en_camino', 'chofer_llegó'].includes(faena.estado)) {
          setStep('asignado');
          setChoferAsignado(faena.choferes);
          setAsignadoEn(faena.asignada_en ? new Date(faena.asignada_en) : new Date());
        } else if (faena.estado === 'en_curso' || faena.estado === 'incidente') {
          setStep('en_curso');
        } else if (['programada', 'ofrecida'].includes(faena.estado)) {
          setStep('buscando');
        }
      } else {
        setStep(vehs.length === 0 ? 'onboarding' : 'mis_vehiculos');
      }
    };
    loadInitialState();
  }, [session]);

  // Suscripcion Faenas
  useEffect(() => {
    if (!viajeId) return;

    const refetchFaena = async () => {
      const { data: fullF } = await supabase.from('faenas').select('*, choferes!faenas_chofer_id_fkey(*)').eq('id', viajeId).single();
      if (fullF) {
        setFaenaActual(fullF);
        if (['asignada', 'chofer_en_camino', 'chofer_llegó'].includes(fullF.estado)) {
          setStep('asignado');
          if (fullF.choferes) setChoferAsignado(fullF.choferes);
          if (fullF.asignada_en && !asignadoEn) setAsignadoEn(new Date(fullF.asignada_en));
        } else if (fullF.estado === 'en_curso' || fullF.estado === 'incidente') {
          setStep('en_curso');
        } else if (fullF.estado === 'finalizada') {
          setStep('resumen');
        } else if (['cancelada_gebo', 'cancelada_cliente'].includes(fullF.estado)) {
          setViajeId(null);
          setFaenaActual(null);
          setChoferAsignado(null);
          setStep('mis_vehiculos');
        }
      }
    };

    let interval = null;
    let isInitialSub = true;

    const channelViaje = supabase
      .channel(`viaje-${viajeId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'faenas', filter: `id=eq.${viajeId}` }, async (payload) => {
        console.log("REALTIME PAYLOAD:", JSON.stringify(payload));
        const f = payload.new;
        
        // Fetch full faena info to get chofer
        const { data: fullF } = await supabase.from('faenas').select('*, choferes!faenas_chofer_id_fkey(*)').eq('id', f.id).single();
        if (fullF) setFaenaActual(fullF);
        
        if (['asignada', 'chofer_en_camino', 'chofer_llegó'].includes(f.estado)) {
          setStep('asignado');
          if (fullF?.choferes) setChoferAsignado(fullF.choferes);
          if (f.asignada_en && !asignadoEn) setAsignadoEn(new Date(f.asignada_en));
        } else if (f.estado === 'en_curso' || f.estado === 'incidente') {
          setStep('en_curso');
        } else if (f.estado === 'finalizada') {
          setStep('resumen');
        } else if (['cancelada_gebo', 'cancelada_cliente'].includes(f.estado)) {
          setViajeId(null);
          setFaenaActual(null);
          setChoferAsignado(null);
          if (f.estado === 'cancelada_gebo') alert('El viaje fue cancelado por la administración o el chofer.');
          setStep('mis_vehiculos');
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isInitialSub) {
            isInitialSub = false;
          } else {
            console.log("WS Reconnected, refetching faena state...");
            refetchFaena();
          }
        }
      });

    return () => supabase.removeChannel(channelViaje);
  }, [viajeId, asignadoEn]);

  // Suscripción posiciones
  useEffect(() => {
    if (!choferAsignado?.id) return;

    const fetchPos = async () => {
      const { data } = await supabase.from('posiciones').select('*').eq('chofer_id', choferAsignado.id).order('timestamp', { ascending: false }).limit(1);
      if (data && data.length > 0) processPos(data[0].ubicacion);
    };
    fetchPos();

    const channelPos = supabase
      .channel(`posiciones-${choferAsignado.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posiciones', filter: `chofer_id=eq.${choferAsignado.id}` }, (payload) => {
        processPos(payload.new.ubicacion);
      })
      .subscribe();

    return () => supabase.removeChannel(channelPos);
  }, [choferAsignado?.id, step]);

  const processPos = (p) => {
    const coords = typeof p === 'string' ? parseEWKB(p) : (p && p.type === 'Point' ? [p.coordinates[1], p.coordinates[0]] : null);
    if (coords) {
      setChoferPos(coords);
      if (origenCoords && destinoCoords) {
        const target = step === 'en_curso' ? [destinoCoords.lat, destinoCoords.lng] : [origenCoords.lat, origenCoords.lng];
        const dist = haversineDistance(coords, target);
        const mins = calculateETA(dist, 30); // 30 km/h avg
        setEta(prevEta => {
          if (prevEta !== null && mins >= prevEta + 5) {
            setEtaAlert(`El chofer se ha retrasado por tráfico. Nuevo ETA: ${mins} min`);
            setTimeout(() => setEtaAlert(null), 8000);
          }
          return mins;
        });
      }
    }
  };

  // Timer para Viaje en Curso
  useEffect(() => {
    let interval = null;
    if (step === 'en_curso' && faenaActual?.fecha_hora_inicio_real) {
      interval = setInterval(() => {
        let transcurrido = Math.floor((new Date() - new Date(faenaActual.fecha_hora_inicio_real)) / 1000);
        if (faenaActual.tiempo_pausa_acumulado_segundos) transcurrido -= faenaActual.tiempo_pausa_acumulado_segundos;
        if (faenaActual.estado === 'incidente' && faenaActual.ultimo_inicio_pausa) {
           transcurrido -= Math.floor((new Date() - new Date(faenaActual.ultimo_inicio_pausa)) / 1000);
        }
        setTiempoTranscurrido(transcurrido > 0 ? transcurrido : 0);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [step, faenaActual]);

  const calcularCostoAcumulado = () => {
    if (modalidad === 'dia_completo') return config.dia_completo;
    if (modalidad === 'por_hora') {
      const horas = Math.ceil(tiempoTranscurrido / 3600);
      return Math.max(1, horas) * config.tarifa_por_hora;
    }
    const mins = Math.ceil(tiempoTranscurrido / 60);
    return Math.max(1, mins) * config.tarifa_por_minuto;
  };

  const handleAddVehiculo = async (e) => {
    e.preventDefault();
    const payload = {
      id: crypto.randomUUID(),
      cliente_id: clienteId,
      marca: e.target.marca.value,
      modelo: e.target.modelo.value,
      año: parseInt(e.target.año.value),
      patente: e.target.patente.value,
      tipo: e.target.tipo.value,
      transmision: e.target.transmision.value,
      es_electrico: e.target.es_electrico.checked
    };
    const { error } = await supabase.from('vehiculos_cliente').insert([payload]);
    if (error) return alert("Error registrando vehículo: " + error.message);
    
    await loadVehiculos(clienteId);
    setShowAddVehiculo(false);
    setStep('mis_vehiculos');
  };

  const handleSolicitarFaena = async () => {
    if (!vehiculoSeleccionado || !origenCoords || !destinoCoords) return alert("Debe seleccionar vehículo, origen y destino.");
    
    if (tipoViaje === 'programada' && !fechaProgramada) {
      return alert("Debe seleccionar una fecha y hora para programar la faena.");
    }
    
    if (tipoViaje === 'programada') {
      const confirmMsg = `Confirmas programar una faena para el:\n${new Date(fechaProgramada).toLocaleString()}\n\nOrigen y Destino han sido registrados.`;
      if (!window.confirm(confirmMsg)) return;
    }
    
    setStep('buscando');
    const origenWKT = `POINT(${origenCoords.lng} ${origenCoords.lat})`;
    const destinoWKT = `POINT(${destinoCoords.lng} ${destinoCoords.lat})`;

    const insertData = { 
        cliente_id: clienteId,
        vehiculo_cliente_id: vehiculoSeleccionado.id,
        origen: origenWKT,
        destino: destinoWKT,
        estado: 'programada',
        tipo_viaje: tipoViaje,
        modalidad: modalidad,
        fecha_hora_programada: tipoViaje === 'programada' ? new Date(fechaProgramada).toISOString() : new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('faenas')
      .insert([insertData])
      .select('*, choferes!faenas_chofer_id_fkey(*)');
      
    if (error) {
      console.error("Insert error:", JSON.stringify(error, null, 2));
      alert("Error pidiendo viaje: " + error.message);
      setStep('seleccionar-destino');
    } else if (data && data.length > 0) {
      setViajeId(data[0].id);
      setFaenaActual(data[0]);
      setShowPushPrompt(true);
    }
  };

  const formatTime = (secs) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleRequestPush = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const swReg = await navigator.serviceWorker.ready;
        const sub = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: 'BJiTBlbSlLN2IiVF86KvVQD-QX_YJm9-LjSqTBNAkeIUktG1pbUl-Fv7nwXlL-z4Xlr4yq_N9A8H0bvhC3tmDpA'
        });
        const subObj = JSON.parse(JSON.stringify(sub));
        await supabase.from('push_subscriptions').insert([{
          user_id: session.user.id,
          endpoint: subObj.endpoint,
          auth: subObj.keys.auth,
          p256dh: subObj.keys.p256dh
        }]);
      }
    } catch (e) {
      console.error(e);
    }
    setShowPushPrompt(false);
  };

  
  // Suscripcion Chat
  useEffect(() => {
    if (!viajeId) return;
    
    
    return () => supabase.removeChannel(channelChat);
  }, [viajeId]);

  // Renderizadores de vistas
  const renderOnboardingOrMisVehiculos = () => {
    if (showAddVehiculo || step === 'onboarding') {
      return (
        <div style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--accent-magenta)' }}>Registra tu Vehículo</h2>
          <p style={{ color: '#666', marginBottom: '24px' }}>Para poder solicitar un chofer, necesitamos conocer tu vehículo.</p>
          <form onSubmit={handleAddVehiculo} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input name="marca" placeholder="Marca (ej. Toyota)" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }} />
            <input name="modelo" placeholder="Modelo (ej. Corolla)" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <input name="año" type="number" placeholder="Año" required style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }} />
              <input name="patente" placeholder="Patente" required style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }} />
            </div>
            <select name="tipo" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }}>
              <option value="auto">Auto</option>
              <option value="suv">SUV</option>
              <option value="camioneta">Camioneta</option>
              <option value="camion">Camión</option>
            </select>
            <select name="transmision" required style={{ padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }}>
              <option value="manual">Manual</option>
              <option value="automatico">Automático</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" name="es_electrico" />
              <span>Es vehículo 100% eléctrico</span>
            </label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              {step !== 'onboarding' && <Button type="button" variant="outline" onClick={() => setShowAddVehiculo(false)} style={{ flex: 1 }}>Cancelar</Button>}
              <Button type="submit" variant="primary" style={{ flex: 2 }}>Guardar Vehículo</Button>
            </div>
          </form>
        </div>
      );
    }

    return (
      <div style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', color: '#1a1d24' }}>Mis Vehículos</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
          {vehiculos.map(v => (
            <div 
              key={v.id} 
              onClick={() => { setVehiculoSeleccionado(v); setStep('seleccionar-destino'); }}
              style={{ padding: '16px', borderRadius: '16px', backgroundColor: 'white', border: '2px solid #f1f3f5', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            >
              <Car size={32} color="var(--accent-magenta)" style={{ marginRight: '16px' }} />
              <div>
                <p style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{v.marca} {v.modelo}</p>
                <p style={{ color: '#666', fontSize: '0.9rem' }}>{v.patente} • {v.transmision} {v.es_electrico && '⚡'}</p>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setShowAddVehiculo(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Plus size={20} /> Agregar otro vehículo
          </Button>
        </div>
      </div>
    );
  };

  const renderSeleccionarDestino = () => {
    let tarifaEstimada = null;
    if (origenCoords && destinoCoords) {
      const distKm = haversineDistance([origenCoords.lat, origenCoords.lng], [destinoCoords.lat, destinoCoords.lng]);
      if (modalidad === 'dia_completo') tarifaEstimada = config.dia_completo;
      else if (modalidad === 'por_hora') tarifaEstimada = config.tarifa_por_hora;
      else tarifaEstimada = Math.round(50 + distKm * config.tarifa_por_minuto); // base 50 + dist * min/km aprox
    }

    return (
      <div style={{ padding: '24px', backgroundColor: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }} onClick={() => setStep('mis_vehiculos')}>
          <Car size={24} color="var(--accent-magenta)" />
          <p style={{ fontWeight: '600' }}>Vehículo: {vehiculoSeleccionado?.marca} {vehiculoSeleccionado?.modelo}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          <DireccionInput placeholder="¿Dónde está tu vehículo?" onAddressSelect={setOrigenCoords} />
          <DireccionInput placeholder="¿A dónde vas?" onAddressSelect={setDestinoCoords} />
        </div>

        {origenCoords && destinoCoords && (
          <>
            <h4 style={{ marginBottom: '12px', color: '#666' }}>¿Cuándo necesitas al chofer?</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div 
                onClick={() => setTipoViaje('inmediata')}
                style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: '12px', border: `2px solid ${tipoViaje === 'inmediata' ? 'var(--accent-magenta)' : '#ddd'}`, backgroundColor: tipoViaje === 'inmediata' ? 'rgba(234, 96, 147, 0.05)' : 'white', cursor: 'pointer', fontWeight: tipoViaje === 'inmediata' ? 'bold' : 'normal', color: tipoViaje === 'inmediata' ? 'var(--accent-magenta)' : '#666' }}
              >
                Ahora
              </div>
              <div 
                onClick={() => setTipoViaje('programada')}
                style={{ flex: 1, padding: '12px', textAlign: 'center', borderRadius: '12px', border: `2px solid ${tipoViaje === 'programada' ? 'var(--accent-magenta)' : '#ddd'}`, backgroundColor: tipoViaje === 'programada' ? 'rgba(234, 96, 147, 0.05)' : 'white', cursor: 'pointer', fontWeight: tipoViaje === 'programada' ? 'bold' : 'normal', color: tipoViaje === 'programada' ? 'var(--accent-magenta)' : '#666' }}
              >
                Programar para después
              </div>
            </div>

            {tipoViaje === 'programada' && (
              <div style={{ marginBottom: '24px' }}>
                <input 
                  type="datetime-local" 
                  value={fechaProgramada} 
                  onChange={(e) => setFechaProgramada(e.target.value)} 
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }}
                />
              </div>
            )}

            <h4 style={{ marginBottom: '12px', color: '#666' }}>Modalidad</h4>
            <select 
              value={modalidad} 
              onChange={(e) => setModalidad(e.target.value)} 
              style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #ddd', marginBottom: '24px' }}
            >
              <option value="por_minuto">Por Minuto</option>
              <option value="por_hora">Por Hora</option>
              <option value="dia_completo">Día Completo</option>
            </select>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'rgba(234, 96, 147, 0.05)', borderRadius: '12px', border: '1px solid rgba(234, 96, 147, 0.2)', marginBottom: '16px' }}>
              <span style={{ fontWeight: 'bold' }}>Tarifa Estimada</span>
              <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-magenta)' }}>${tarifaEstimada} UYU</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', backgroundColor: '#fff3cd', borderRadius: '8px', marginBottom: '24px', border: '1px solid #ffeeba' }}>
              <Clock size={18} color="#856404" style={{ minWidth: '18px' }} />
              <p style={{ fontSize: '0.8rem', color: '#856404', margin: 0, lineHeight: 1.4 }}>
                <strong>Penalización por espera:</strong> {config.ventana} min de cortesía, luego ${config.penalizacion} UYU/min.
              </p>
            </div>

            <Button variant="primary" onClick={handleSolicitarFaena} style={{ width: '100%' }}>
              {tipoViaje === 'programada' ? 'PROGRAMAR FAENA' : 'SOLICITAR CHOFER'}
            </Button>
          </>
        )}
      </div>
    );
  };

  const renderPanelBuscando = () => {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', backgroundColor: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}>
        {faenaActual?.tipo_viaje === 'programada' ? (
          <>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#e6fffa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
              <Clock size={24} color="#00ccaa" />
            </div>
            <h3 style={{ marginBottom: '8px' }}>Faena Programada</h3>
            <p style={{ color: '#9ba1b0', fontSize: '0.9rem', marginBottom: '24px' }}>Tu faena ha sido agendada para el {new Date(faenaActual.fecha_hora_programada).toLocaleString()}. Se buscará chofer 30 minutos antes.</p>
            <Button variant="outline" onClick={() => setStep('mis_vehiculos')} style={{ width: '100%' }}>Volver al Inicio</Button>
          </>
        ) : secondsWaiting < 15 ? (
          <>
            <div style={{ width: '50px', height: '50px', border: '4px solid #f1f3f5', borderTop: '4px solid var(--accent-magenta)', borderRadius: '50%', margin: '0 auto 20px auto', animation: 'spin 1s linear infinite' }} />
            <h3 style={{ marginBottom: '8px' }}>Buscando al mejor chofer...</h3>
            <p style={{ color: '#9ba1b0', fontSize: '0.9rem', marginBottom: '24px' }}>Notificando a choferes profesionales en tu zona.</p>
          </>
        ) : (
          <>
            <Clock size={40} color="#ff9800" style={{ margin: '0 auto 16px auto' }} />
            <h3 style={{ marginBottom: '8px' }}>Alta Demanda</h3>
            <p style={{ color: '#9ba1b0', fontSize: '0.9rem', marginBottom: '24px' }}>No hay choferes disponibles en este momento exacto.</p>
            <Button variant="outline" onClick={() => setStep('seleccionar-destino')} style={{ width: '100%' }}>Cancelar y Volver a Intentar</Button>
          </>
        )}
      </div>
    );
  };

  const renderResumen = () => {
    return (
      <div style={{ padding: '24px', backgroundColor: 'white', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '80px', height: '80px', backgroundColor: '#e6fffa', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <Search size={40} color="#00ccaa" /> {/* Placeholder para check */}
          {/* <CheckCircle size={40} color="#00ccaa" /> */}
        </div>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '8px', color: '#1a1d24' }}>¡Faena Completada!</h2>
        <p style={{ color: '#666', marginBottom: '32px' }}>Tu vehículo ha llegado a destino a salvo.</p>
        
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #f1f3f5', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
          <p style={{ fontSize: '0.9rem', color: '#9ba1b0', textAlign: 'center', marginBottom: '8px' }}>Costo Total</p>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--accent-magenta)', textAlign: 'center', marginBottom: '24px' }}>
            ${faenaActual?.costo_total || 0}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666' }}>Chofer:</span>
            <span style={{ fontWeight: 'bold' }}>{choferAsignado?.nombre || 'Gebo Pro'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ color: '#666' }}>Duración:</span>
            <span style={{ fontWeight: 'bold' }}>{faenaActual?.fecha_hora_fin_real && faenaActual?.fecha_hora_inicio_real ? Math.floor((new Date(faenaActual.fecha_hora_fin_real) - new Date(faenaActual.fecha_hora_inicio_real))/60000) : 0} min</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <Button variant="outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => alert("Descargando recibo...")}>
              <Download size={18} /> Descargar Recibo
            </Button>
          </div>
        </div>

        <Button variant="primary" onClick={() => {
          setViajeId(null);
          setFaenaActual(null);
          setStep('mis_vehiculos');
        }} style={{ width: '100%', maxWidth: '400px' }}>Solicitar Otra Faena</Button>
      </div>
    );
  };

  const renderChat = () => {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '90%', maxWidth: '400px', height: '80%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Chat con Chofer</h3>
            <Button variant="outline" onClick={() => setShowChat(false)} style={{ padding: '4px 8px' }}>Cerrar</Button>
          </div>
          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {mensajes.map(m => (
              <div key={m.id} style={{ alignSelf: m.rol_emisor === 'cliente' ? 'flex-end' : 'flex-start', backgroundColor: m.rol_emisor === 'cliente' ? 'var(--accent-magenta)' : '#f1f3f5', color: m.rol_emisor === 'cliente' ? 'white' : 'black', padding: '10px 14px', borderRadius: '16px', maxWidth: '80%' }}>
                {m.contenido}
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMensaje} style={{ padding: '16px', borderTop: '1px solid #ddd', display: 'flex', gap: '8px' }}>
            <input type="text" value={nuevoMensaje} onChange={(e) => setNuevoMensaje(e.target.value)} placeholder="Escribe un mensaje..." style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd' }} />
            <Button type="submit" variant="primary">Enviar</Button>
          </form>
        </div>
      </div>
    );
  };

  const renderPushPrompt = () => {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}>
        <div style={{ backgroundColor: 'white', padding: '24px', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', width: '100%' }}>
          <h3 style={{ marginBottom: '12px', color: 'var(--accent-magenta)' }}>Mantente informado</h3>
          <p style={{ marginBottom: '20px', color: '#666' }}>¿Querés recibir una notificación cuando tu chofer esté en camino o haya llegado?</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowPushPrompt(false)}>Ahora no</Button>
            <Button variant="primary" style={{ flex: 1 }} onClick={handleRequestPush}>¡Sí, avisarme!</Button>
          </div>
        </div>
      </div>
    );
  };

  if (step === 'loading') return <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>Cargando...</div>;

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', backgroundColor: '#f8f9fa', color: '#1a1d24', display: 'flex', flexDirection: 'column' }}>
      
      {/* HEADER */}
      <div style={{ padding: '20px', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, borderBottom: '1px solid #eee' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-magenta)', margin: 0 }}>Gebo</h2>
        <button 
          onClick={async () => { await supabase.auth.signOut(); window.location.href='/login'; }}
          style={{ background: 'rgba(0,0,0,0.05)', border: 'none', padding: '8px 16px', borderRadius: '20px', color: '#1a1d24', fontWeight: '600', cursor: 'pointer' }}
        >
          Cerrar Sesión
        </button>
      </div>

      {['onboarding', 'mis_vehiculos', 'resumen'].includes(step) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {step === 'resumen' ? renderResumen() : renderOnboardingOrMisVehiculos()}
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          {/* MAPA */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}>
            <MapContainer 
              center={origenCoords ? [origenCoords.lat, origenCoords.lng] : [-34.9011, -56.1645]} 
              zoom={14} 
              zoomControl={false}
              style={{ width: '100%', height: '100%' }}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
              {origenCoords && <Marker position={[origenCoords.lat, origenCoords.lng]}><Popup>Origen</Popup></Marker>}
              {destinoCoords && <Marker position={[destinoCoords.lat, destinoCoords.lng]}><Popup>Destino</Popup></Marker>}
              {choferPos && <Marker position={choferPos}><Popup>Tu Chofer</Popup></Marker>}
            </MapContainer>
          </div>

          {/* PANEL INFERIOR */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', zIndex: 10 }}>
            {step === 'seleccionar-destino' && renderSeleccionarDestino()}
            {step === 'buscando' && renderPanelBuscando()}
            
            {(step === 'asignado' || step === 'en_curso') && (
              <div style={{ padding: '24px', backgroundColor: 'white', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.08)' }}>
                {etaAlert && (
                  <div style={{ backgroundColor: '#ff9800', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold', animation: 'fadeInOut 8s forwards' }}>
                    ⚠️ {etaAlert}
                  </div>
                )}
                
                {faenaActual?.estado === 'incidente' && (
                  <div style={{ backgroundColor: '#f44336', color: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                    ¡Incidente Reportado! Administrador evaluando.
                  </div>
                )}
                {faenaActual?.estado === 'chofer_llegó' && (
                  <div style={{ backgroundColor: '#00ccaa', color: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                    ¡Tu chofer llegó al vehículo!
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ width: '60px', height: '60px', backgroundColor: '#f1f3f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {choferAsignado?.foto_url ? <img src={choferAsignado.foto_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Search size={24} color="#9ba1b0" />}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{choferAsignado?.nombre || 'Cargando...'}</h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>4.9 ★ • Gebo Pro</p>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    {step === 'asignado' && eta !== null && (
                      <>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>Llega en</p>
                        <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--accent-magenta)' }}>{eta} min</p>
                      </>
                    )}
                  </div>
                </div>

                {step === 'en_curso' && (
                  <div style={{ backgroundColor: 'rgba(0, 255, 204, 0.1)', padding: '20px', borderRadius: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#1a1d24' }}>Tiempo Transcurrido</p>
                      <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', fontFamily: 'monospace' }}>{formatTime(tiempoTranscurrido)}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: '#1a1d24' }}>Costo Actual</p>
                      <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#00ccaa' }}>${calcularCostoAcumulado()}</p>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowChat(true)}>Chat</Button>
                  <Button variant="outline" style={{ flex: 1 }} onClick={() => setSosActive(true)}>SOS Emergencia</Button>
                  {step === 'asignado' && <Button variant="outline" style={{ flex: 1, borderColor: '#ff4444', color: '#ff4444' }} onClick={() => setShowCancelModal(true)}>Cancelar</Button>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals Popups */}
      {showPushPrompt && renderPushPrompt()}
      {showChat && renderChat()}


      {/* Modal Cancelar */}
      {showCancelModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '12px' }}>¿Cancelar viaje?</h3>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              {(asignadoEn && (new Date() - asignadoEn)/60000 > config.ventana)
                ? `Han pasado más de ${config.ventana} min. Se aplicará penalización de $${config.penalizacion}.`
                : 'Puedes cancelar ahora sin costo.'}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setShowCancelModal(false)}>Mantener</Button>
              <Button variant="primary" style={{ flex: 1, backgroundColor: '#ff4444' }} onClick={async () => {
                await supabase.from('faenas').update({ estado: 'cancelada_cliente' }).eq('id', viajeId);
                setShowCancelModal(false);
                setStep('mis_vehiculos');
              }}>Sí, cancelar</Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes fadeInOut { 0% { opacity: 0; transform: translate(-50%, 10px); } 10% { opacity: 1; transform: translate(-50%, 0); } 90% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -10px); } }
      `}</style>
    </div>
  );
};

export default ClienteApp;
