import React, { useState, useEffect, useRef } from 'react';

import { Power, MapPin, SignalHigh, WifiOff, Car, Key, Zap, AlertTriangle } from 'lucide-react';

import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';

import ChatPanel from '../../components/ui/ChatPanel';

import { MessageSquare, AlertOctagon, X } from 'lucide-react';

import { supabase } from '../../lib/supabase';

import { parseEWKB, haversineDistance, calculateETA } from '../../lib/utils';
import { shouldSendPing } from '../../utils/geoUtils';

import Button from '../../components/ui/Button';

import GlassCard from '../../components/ui/GlassCard';



function MapUpdater({ center }) {

  const map = useMap();

  useEffect(() => {

    map.setView(center, map.getZoom());

  }, [center, map]);

  return null;

}



export const ChoferApp = () => {

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [session, setSession] = useState(null);

  const [choferProfile, setChoferProfile] = useState(null);

  const [trasladoProgramado, setTrasladoProgramado] = useState(null);

  const [currentPos, setCurrentPos] = useState({ lat: -34.890, lng: -56.155 });

  const [ofertaActiva, setOfertaActiva] = useState(null);

  const [timerOferta, setTimerOferta] = useState(15);

  const [faenaEnCurso, setFaenaEnCurso] = useState(null);

  const [distanciaOrigen, setDistanciaOrigen] = useState(null);

  const [etaOrigen, setEtaOrigen] = useState(null);

  

  const [faenasHoy, setFaenasHoy] = useState([]);

  const [metricasHoy, setMetricasHoy] = useState({ faenas: 0, horas: 0, ganancias: 0 });

  

  const [configNegocio, setConfigNegocio] = useState({});

  const [faenaTimer, setFaenaTimer] = useState(0); // seconds elapsed

  const [costoAcumulado, setCostoAcumulado] = useState(0);



  const [fotoURL, setFotoURL] = useState(null);

  const [uploadingFoto, setUploadingFoto] = useState(false);

  const [fotoFile, setFotoFile] = useState(null);

  const [isDemoSkipFoto, setIsDemoSkipFoto] = useState(false);

  const [showChat, setShowChat] = useState(false);

  useEffect(() => {

    console.log('FAENA_EN_CURSO CHANGED:', faenaEnCurso?.estado);

  }, [faenaEnCurso]);



  const [showIncidenteModal, setShowIncidenteModal] = useState(false);

  const [incidenteDesc, setIncidenteDesc] = useState('');



  const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

  const intervalRef = useRef(null);
  const lastSentPosRef = useRef(null);
  const lastSentTimeRef = useRef(0);



  // Escuchar eventos de red nativos

  useEffect(() => {

    window.addEventListener('online', () => setIsOnline(true));

    window.addEventListener('offline', () => setIsOnline(false));

    return () => {

      window.removeEventListener('online', () => setIsOnline(true));

      window.removeEventListener('offline', () => setIsOnline(false));

    };

  }, []);



  // Suscripción a sesión

  useEffect(() => {

    supabase.auth.getSession().then(({ data: { session } }) => {

      setSession(session);

    });



    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {

      setSession(session);

    });



    return () => subscription.unsubscribe();

  }, []);



  // Cargar perfil cuando haya sesión

  useEffect(() => {

    const fetchProfile = async () => {

      if (!session?.user?.id) return;



      // Fetch perfil chofer

      const { data: profile, error } = await supabase

        .from('choferes')

        .select('*')

        .eq('usuario_id', session.user.id)

        .single();

      

      if (error) {

        console.error("Error fetching profile:", error.message);

      }

      

      setChoferProfile(profile);



      if (profile) {

        // Fetch traslado de vagoneta programado para hoy

        const today = new Date().toISOString().split('T')[0];

        const { data: paradas } = await supabase

          .from('paradas_traslado')

          .select(`

            id, punto, descripcion, tipo,

            traslados_equipo!inner(fecha_hora, estado)

          `)

          .eq('chofer_id', profile.id)

          .eq('completada', false)

          .eq('tipo', 'recogida')

          .gte('traslados_equipo.fecha_hora', today)

          .order('traslados_equipo(fecha_hora)', { ascending: true })

          .limit(1);



        if (paradas && paradas.length > 0) {

          setTrasladoProgramado(paradas[0]);

        }



        // Fetch faenas de hoy

        const { data: faenasHoyData } = await supabase

          .from('faenas')

          .select('*, vehiculos_cliente(tipo, patente), clientes(nombre)')

          .eq('chofer_id', profile.id)

          .eq('estado', 'finalizada')

          .gte('fecha_hora_fin_real', today)

          .order('fecha_hora_fin_real', { ascending: false });

        

        if (faenasHoyData) {

          setFaenasHoy(faenasHoyData);

        }

      }

    };



    const fetchConfig = async () => {

      const { data, error } = await supabase.from('configuracion_negocio').select('clave, valor');

      if (!error && data) {

        const config = {};

        data.forEach(item => {

          config[item.clave] = item.valor;

        });

        setConfigNegocio(config);

      }

    };

    fetchConfig();

    fetchProfile();

  }, [session]);



  // Calcular métricas de hoy

  useEffect(() => {

    let horas = 0;

    faenasHoy.forEach(faena => {

      if (faena.fecha_hora_inicio_real && faena.fecha_hora_fin_real) {

        const start = new Date(faena.fecha_hora_inicio_real).getTime();

        const end = new Date(faena.fecha_hora_fin_real).getTime();

        horas += (end - start) / (1000 * 3600);

      }

    });

    

    const pagoPorHora = configNegocio['pago_chofer_por_hora_uyu'] || 250;

    const ganancias = horas * pagoPorHora;

    

    setMetricasHoy({

      faenas: faenasHoy.length,

      horas: horas,

      ganancias: ganancias

    });

  }, [faenasHoy, configNegocio]);



  // Timer y Cálculo de Costo para Vista 5

  useEffect(() => {

    let interval;

    if (((faenaEnCurso?.estado === 'en_curso' || faenaEnCurso?.estado === 'incidente') || faenaEnCurso?.estado === 'incidente') && faenaEnCurso?.fecha_hora_inicio_real) {

      interval = setInterval(() => {

        const start = new Date(faenaEnCurso.fecha_hora_inicio_real).getTime();

        const now = new Date().getTime();

        let elapsedSecs = Math.floor((now - start) / 1000);

        if (faenaEnCurso.tiempo_pausa_acumulado_segundos) {

           elapsedSecs -= faenaEnCurso.tiempo_pausa_acumulado_segundos;

        }

        if (faenaEnCurso.estado === 'incidente' && faenaEnCurso.ultimo_inicio_pausa) {

           elapsedSecs -= Math.floor((now - new Date(faenaEnCurso.ultimo_inicio_pausa).getTime()) / 1000);

        }

        elapsedSecs = Math.max(0, elapsedSecs);

        setFaenaTimer(elapsedSecs);



        let cost = 0;

        if (faenaEnCurso.modalidad === 'por_minuto') {

           const elapsedMins = Math.floor(elapsedSecs / 60);

           cost = elapsedMins * (configNegocio['tarifa_por_minuto_uyu'] || 15);

        } else if (faenaEnCurso.modalidad === 'por_hora') {

           const horas = elapsedSecs / 3600;

           cost = horas * (configNegocio['tarifa_por_hora_uyu'] || 600);

        } else if (faenaEnCurso.modalidad === 'dia_completo') {

           cost = configNegocio['tarifa_dia_completo_uyu'] || 4500;

        }

        setCostoAcumulado(Math.round(cost));

      }, 1000);

    } else {

      if (interval) clearInterval(interval);

      setFaenaTimer(0);

      setCostoAcumulado(0);

    }

    return () => clearInterval(interval);

  }, [faenaEnCurso, configNegocio]);



  // Escuchar ofertas de faena en tiempo reals de faena

  useEffect(() => {

    if (!choferProfile?.id) return;



    const subscription = supabase

      .channel('public:faenas')

      .on(

        'postgres_changes',

        {

          event: '*',

          schema: 'public',

          table: 'faenas',

          filter: `chofer_ofrecido_id=eq.${choferProfile.id}`,

        },

        async (payload) => {

          console.log('REALTIME EVENT RECEIVED', payload);

          const faena = payload.new;

          if (faena.estado === 'programada' && faena.chofer_ofrecido_id === choferProfile.id) {

            // Fetch complementario

            const { data: faenaFull, error: faenaError } = await supabase

              .from('faenas')

              .select('*, vehiculos_cliente(tipo, transmision, es_electrico)')

              .eq('id', faena.id)

              .single();

            

            console.log('FETCH FAENA FULL', faenaFull, faenaError);

            

            if (faenaFull) {

              setOfertaActiva(faenaFull);

              setTimerOferta(15);

            }

          } else if (faena.chofer_ofrecido_id !== choferProfile.id || faena.estado !== 'programada') {

            setOfertaActiva(null);

          }

        }

      )

      .subscribe();



    return () => {

      supabase.removeChannel(subscription);

    };

  }, [choferProfile?.id]);



  // Timer del modal de oferta

  useEffect(() => {

    let interval;

    if (ofertaActiva && timerOferta > 0) {

      interval = setInterval(() => {

        setTimerOferta(prev => prev - 1);

      }, 1000);

    } else if (ofertaActiva && timerOferta === 0) {

      handleRechazarOferta();

    }

    return () => clearInterval(interval);

  }, [ofertaActiva, timerOferta]);



  // Fetch Faena En Curso (Vista 3)

  useEffect(() => {

    const fetchFaenaEnCurso = async () => {

      if (choferProfile?.estado === 'en_faena') {

        const { data: activeFaena, error: faenaError } = await supabase

          .from('faenas')

          .select('*, vehiculos_cliente(tipo, patente), clientes(nombre)')

          .eq('chofer_id', choferProfile.id)

          .in('estado', ['chofer_en_camino', 'chofer_llegó', 'en_curso', 'incidente'])

          .order('id', { ascending: false })

          .limit(1)

          .single();



        console.log('ACTIVE FAENA:', activeFaena, 'ERROR:', faenaError);



        if (activeFaena) {

          console.log("ORIGEN TIPO:", typeof activeFaena.origen);

          console.log("ORIGEN VALOR:", JSON.stringify(activeFaena.origen));

          let coords = null;

          if (typeof activeFaena.origen === 'string') coords = parseEWKB(activeFaena.origen);

          else if (activeFaena.origen && activeFaena.origen.type === 'Point') coords = [activeFaena.origen.coordinates[1], activeFaena.origen.coordinates[0]];

          

          console.log("PARSED COORDS FINAL:", coords);

          if (coords) {

            activeFaena.origenCoords = { lat: coords[0], lng: coords[1] };

          }



          let destCoords = null;

          if (typeof activeFaena.destino === 'string') destCoords = parseEWKB(activeFaena.destino);

          else if (activeFaena.destino && activeFaena.destino.type === 'Point') destCoords = [activeFaena.destino.coordinates[1], activeFaena.destino.coordinates[0]];

          

          if (destCoords) {

            activeFaena.destinoCoords = { lat: destCoords[0], lng: destCoords[1] };

          }



          setFaenaEnCurso(activeFaena);

        } else {

          setFaenaEnCurso(null);

        }

      } else {

        setFaenaEnCurso(null);

      }

    };

    fetchFaenaEnCurso();

  }, [choferProfile?.estado, choferProfile?.id]);



  // Actualizar distancias

  useEffect(() => {

    if (faenaEnCurso?.origenCoords && currentPos.lat) {

      const distKm = haversineDistance(

        [currentPos.lat, currentPos.lng], 

        [faenaEnCurso.origenCoords.lat, faenaEnCurso.origenCoords.lng]

      );

      setDistanciaOrigen(distKm * 1000); // en metros

      setEtaOrigen(calculateETA(distKm));

    }

  }, [currentPos, faenaEnCurso]);



  // Bucle de envío de GPS

  useEffect(() => {

    if (choferProfile?.estado === 'disponible' && session) {



      if (isDemoMode) {

        // MODO DEMO: Simulación de GPS

        intervalRef.current = setInterval(async () => {

          let newPos = { lat: currentPos.lat - 0.0001, lng: currentPos.lng - 0.0001 };

          setCurrentPos(newPos);

          const pointWKT = `POINT(${newPos.lng} ${newPos.lat})`;

          await supabase.from('posiciones').insert([{ 

            chofer_id: choferProfile.id, 

            ubicacion: pointWKT 

          }]);

        }, 5000);

      } else {

        // MODO PRODUCCIÓN: GPS Real

        if ("geolocation" in navigator) {

          const watchId = navigator.geolocation.watchPosition(

            async (position) => {

              const { latitude, longitude } = position.coords;

              setCurrentPos({ lat: latitude, lng: longitude });

              

              const pointWKT = `POINT(${longitude} ${latitude})`;

              await supabase.from('posiciones').insert([{ 

                chofer_id: choferProfile.id, 

                ubicacion: pointWKT 

              }]);

            },

            (error) => console.error("Error obteniendo ubicación:", error),

            { enableHighAccuracy: true, maximumAge: 0 }

          );

          

          return () => navigator.geolocation.clearWatch(watchId);

        }

      }

    } else {

      if (intervalRef.current) clearInterval(intervalRef.current);

    }

    return () => {

      if (intervalRef.current) clearInterval(intervalRef.current);

    };

  }, [choferProfile?.estado, session]);



  const handleReportIncidente = async () => {

    if (!incidenteDesc.trim()) return;

    const { error } = await supabase.from('incidentes_faena').insert({

      faena_id: faenaEnCurso.id,

      reportado_por_id: choferProfile.id,

      descripcion: incidenteDesc

    });

    if (!error) {

      await supabase.from('faenas').update({ estado: 'incidente' }).eq('id', faenaEnCurso.id);

      setFaenaEnCurso(prev => ({ ...prev, estado: 'incidente', ultimo_inicio_pausa: new Date().toISOString() }));

      setShowIncidenteModal(false);

      setIncidenteDesc('');

    }

  };



  const toggleTurno = async () => {

    if (!choferProfile) return;

    

    const nuevoEstado = choferProfile.estado === 'disponible' ? 'inactivo' : 'disponible';

    

    const { error } = await supabase

      .from('choferes')

      .update({ estado: nuevoEstado, ultima_vez_disponible: nuevoEstado === 'disponible' ? new Date().toISOString() : choferProfile.ultima_vez_disponible })

      .eq('id', choferProfile.id);



    if (!error) {

      setChoferProfile({ ...choferProfile, estado: nuevoEstado });

    } else {

      console.error("Error actualizando estado", error);

      alert("No se pudo iniciar turno. Revisa la conexión.");

    }

  };



  const handleAceptarOferta = async () => {

    if (!ofertaActiva || !choferProfile) return;

    const faenaId = ofertaActiva.id;

    

    // Optimistic UI clear

    setOfertaActiva(null);



    const { error: errFaena } = await supabase

      .from('faenas')

      .update({ estado: 'chofer_en_camino', chofer_id: choferProfile.id })

      .eq('id', faenaId);



    if (!errFaena) {

      await supabase

        .from('choferes')

        .update({ estado: 'en_faena' })

        .eq('id', choferProfile.id);

      

      setChoferProfile(prev => ({ ...prev, estado: 'en_faena' }));

    } else {

      console.error("Error aceptando faena", errFaena);

    }

  };



  const handleRechazarOferta = async () => {

    if (!ofertaActiva || !choferProfile) return;

    const faenaId = ofertaActiva.id;

    

    setOfertaActiva(null);



    await supabase

      .from('faenas_ofertas_rechazadas')

      .insert([{ faena_id: faenaId, chofer_id: choferProfile.id }]);



    await supabase

      .from('faenas')

      .update({ chofer_ofrecido_id: null })

      .eq('id', faenaId);

  };



  const handleLlegada = async () => {

    if (!faenaEnCurso) return;

    

    const { error } = await supabase

      .from('faenas')

      .update({ 

        estado: 'chofer_llegó',

        fecha_hora_inicio_real: new Date().toISOString()

      })

      .eq('id', faenaEnCurso.id);



    if (!error) {

      setFaenaEnCurso(prev => ({ ...prev, estado: 'chofer_llegó' }));

    } else {

      console.error("Error al registrar llegada", error);

    }

  };



  const handleCaptureFoto = async (e) => {

    const file = e.target.files[0];

    if (!file) return;

    setFotoFile(file);

    setUploadingFoto(true);

    

    // Upload a supabase storage

    const fileName = `faena_${faenaEnCurso.id}_inicio_${Date.now()}.jpg`;

    const { data, error } = await supabase.storage.from('fotos-vehiculos').upload(fileName, file);

    

    if (error) {

      console.error("Error subiendo foto:", error);

      alert("Error subiendo foto. Intente de nuevo.");

      setUploadingFoto(false);

      return;

    }

    

    const { data: urlData } = supabase.storage.from('fotos-vehiculos').getPublicUrl(fileName);

    setFotoURL(urlData.publicUrl);

    setUploadingFoto(false);

  };



  const handleIniciarFaena = async () => {

    if (!faenaEnCurso) return;

    

    const urlA_guardar = isDemoSkipFoto ? 'demo_skip_url' : fotoURL;

    

    const { error } = await supabase

      .from('faenas')

      .update({ 

        estado: 'en_curso',

        fecha_hora_inicio_real: new Date().toISOString(),

        foto_vehiculo_inicio_url: urlA_guardar

      })

      .eq('id', faenaEnCurso.id);



    if (!error) {

      setFaenaEnCurso(prev => ({ ...prev, estado: 'en_curso', foto_vehiculo_inicio_url: urlA_guardar }));

    } else {

      console.error("Error al iniciar faena", error);

    }

  };



  const handleFinalizarFaena = async () => {

    if (!faenaEnCurso) return;

    

    const urlA_guardar = isDemoSkipFoto ? 'demo_skip_url' : fotoURL;

    const now = new Date().toISOString();



    const { error } = await supabase

      .from('faenas')

      .update({ 

        estado: 'finalizada',

        fecha_hora_fin_real: now,

        foto_vehiculo_fin_url: urlA_guardar,

        costo_total: costoAcumulado

      })

      .eq('id', faenaEnCurso.id);



    if (!error) {

      // Liberar al chofer

      await supabase.from('choferes').update({ estado: 'disponible' }).eq('id', choferProfile.id);

      

      setFaenaEnCurso(null);

      setFotoURL(null);

      setFotoFile(null);

      setIsDemoSkipFoto(false);

      

      // Update profile locally so UI returns to Vista 1

      setChoferProfile(prev => ({ 

        ...prev, 

        estado: 'disponible',

        horas_conduccion_continua: (prev.horas_conduccion_continua || 0) + (costoAcumulado > 0 ? (new Date(now).getTime() - new Date(faenaEnCurso.fecha_hora_inicio_real).getTime()) / (1000 * 3600) : 0) // Approximation, db trigger handles exact

      }));



      // Update faenas hoy

      setFaenasHoy(prev => [

        {

          ...faenaEnCurso,

          estado: 'finalizada',

          fecha_hora_fin_real: now,

          costo_total: costoAcumulado

        },

        ...prev

      ]);

    } else {

      console.error("Error al finalizar faena", error);

    }

  };



  const getFormatTime = (isoString) => {

    if (!isoString) return '';

    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  };



  const formatTimer = (totalSeconds) => {

    const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');

    const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');

    const seconds = (totalSeconds % 60).toString().padStart(2, '0');

    return `${hours}:${minutes}:${seconds}`;

  };



  if (!choferProfile) return <div style={{ color: 'white', padding: '20px' }}>Cargando perfil...</div>;



  return (

    <div style={{ 

      minHeight: '100vh', 

      width: '100%', 

      backgroundColor: '#0a0d14', 

      color: '#fff', 

      fontFamily: "'Inter', sans-serif",

      position: 'relative',

      paddingBottom: '80px'

    }}>

      {/* MAPA INTERACTIVO DE FONDO */}

      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, opacity: 0.8 }}>

        <MapContainer 

          center={[currentPos.lat, currentPos.lng]}

          zoom={15} 

          zoomControl={false}

          style={{ width: '100%', height: '100%', backgroundColor: '#0a0d14' }}

        >

          <TileLayer

            attribution='&copy; CARTO'

            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"

          />

          <Marker position={[currentPos.lat, currentPos.lng]} />

          

          {faenaEnCurso?.origenCoords && faenaEnCurso?.estado !== 'en_curso' && (

            <>

              {/* Target Marker (Origen de la faena) */}

              <Marker position={[faenaEnCurso.origenCoords.lat, faenaEnCurso.origenCoords.lng]} />

              <Polyline 

                positions={[

                  [currentPos.lat, currentPos.lng],

                  [faenaEnCurso.origenCoords.lat, faenaEnCurso.origenCoords.lng]

                ]} 

                color="#00ffcc" 

                weight={4} 

                dashArray="10, 10" 

              />

            </>

          )}



          {faenaEnCurso?.destinoCoords && (faenaEnCurso?.estado === 'en_curso' || faenaEnCurso?.estado === 'incidente') && (

            <>

              {/* Target Marker (Destino de la faena) */}

              <Marker position={[faenaEnCurso.destinoCoords.lat, faenaEnCurso.destinoCoords.lng]} />

              <Polyline 

                positions={[

                  [currentPos.lat, currentPos.lng],

                  [faenaEnCurso.destinoCoords.lat, faenaEnCurso.destinoCoords.lng]

                ]} 

                color="#ff00cc" 

                weight={4} 

                dashArray="10, 10" 

              />

            </>

          )}



          <MapUpdater center={[currentPos.lat, currentPos.lng]} />

        </MapContainer>

      </div>



      {/* TOP BAR SUPERIOR */}

      <div style={{

        padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',

        background: 'linear-gradient(to bottom, rgba(10,13,20,1) 0%, rgba(10,13,20,0) 100%)',

        position: 'sticky', top: 0, zIndex: 10

      }}>

        <h2 className="gradient-text no-select" style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>Gebo Chofer</h2>

        

        {/* INDICADOR DE SEÑAL / OFFLINE */}

        <div style={{ 

          display: 'flex', alignItems: 'center', gap: '8px', 

          fontSize: '0.85rem', color: isOnline ? '#00e6b8' : '#ff4444',

          background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px',

          backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)'

        }}>

          {isOnline ? <SignalHigh size={16} /> : <WifiOff size={16} />}

          <span style={{ fontWeight: '600' }}>{isOnline ? 'Online' : 'Offline'}</span>

        </div>

      </div>



      <div style={{ padding: '0 20px' }}>

        

        {choferProfile.estado === 'en_faena' && faenaEnCurso ? (

          /* VISTA 3: EN CAMINO AL CLIENTE */

          <GlassCard style={{ marginBottom: '24px', padding: '24px' }}>

              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#00ffcc' }}>

                {faenaEnCurso.estado === 'chofer_en_camino' ? 'En camino al vehículo' : 

                 faenaEnCurso.estado === 'chofer_llegó' ? 'En el vehículo' :

                 faenaEnCurso.estado === 'en_curso' ? 'En camino al destino' :

                 faenaEnCurso.estado === 'incidente' ? 'Incidente reportado' : 'Faena Activa'}

              </h2>

            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>

              <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>Vehículo</div>

              <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>{faenaEnCurso.vehiculos_cliente?.tipo?.toUpperCase()} - {faenaEnCurso.vehiculos_cliente?.patente}</div>

            </div>

            

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>

              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', flex: 1, marginRight: '8px', textAlign: 'center' }}>

                <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>Distancia</div>

                <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{distanciaOrigen !== null ? `${Math.round(distanciaOrigen)}m` : '...'}</div>

              </div>

              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', flex: 1, marginLeft: '8px', textAlign: 'center' }}>

                <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>ETA</div>

                <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{etaOrigen !== null ? `${etaOrigen} min` : '...'}</div>

              </div>

            </div>



            {faenaEnCurso.estado === 'chofer_en_camino' && (

              <Button 

                onClick={handleLlegada}

                disabled={!isDemoMode && (distanciaOrigen === null || distanciaOrigen > 50)}

                style={{ 

                  width: '100%', padding: '16px', fontSize: '1.2rem', 

                  background: (!isDemoMode && (distanciaOrigen === null || distanciaOrigen > 50)) ? '#444' : 'linear-gradient(90deg, #00ffcc 0%, #00ccff 100%)',

                  color: (!isDemoMode && (distanciaOrigen === null || distanciaOrigen > 50)) ? '#888' : '#000',

                  border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center'

                }}

              >

                {(!isDemoMode && (distanciaOrigen === null || distanciaOrigen > 50)) ? `A ${Math.round(distanciaOrigen || 0)}m del vehículo` : 'LLEGUÉ AL VEHÍCULO'}

              </Button>

            )}



            {faenaEnCurso.estado === 'chofer_llegó' && (

              <div style={{ marginTop: '24px' }}>

                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: '#fff' }}>Resumen de Faena</h3>

                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>

                  <div style={{ marginBottom: '8px' }}><span style={{ color: '#aaa' }}>Cliente:</span> {faenaEnCurso.clientes?.nombre || 'N/A'}</div>

                  <div style={{ marginBottom: '8px' }}><span style={{ color: '#aaa' }}>Vehículo:</span> {faenaEnCurso.vehiculos_cliente?.tipo?.toUpperCase()} - {faenaEnCurso.vehiculos_cliente?.patente}</div>

                  <div style={{ marginBottom: '8px' }}><span style={{ color: '#aaa' }}>Origen:</span> {faenaEnCurso.origen_descripcion}</div>

                  <div style={{ marginBottom: '8px' }}><span style={{ color: '#aaa' }}>Destino:</span> {faenaEnCurso.destino_descripcion}</div>

                  <div><span style={{ color: '#aaa' }}>Modalidad:</span> {faenaEnCurso.modalidad?.replace('_', ' ').toUpperCase()}</div>

                </div>



                {!fotoURL && !isDemoSkipFoto ? (

                  <>

                    <label style={{ 

                      display: 'block', width: '100%', padding: '16px', fontSize: '1.1rem', 

                      background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px dashed #aaa', 

                      borderRadius: '12px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px'

                    }}>

                      {uploadingFoto ? 'Subiendo foto...' : '📸 FOTOGRAFIAR VEHÍCULO'}

                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCaptureFoto} disabled={uploadingFoto} />

                    </label>

                    {isDemoMode && (

                      <Button onClick={() => setIsDemoSkipFoto(true)} style={{ width: '100%', marginBottom: '16px', background: '#ff4444', color: '#fff', border: 'none' }}>

                        OMITIR FOTO (DEMO)

                      </Button>

                    )}

                  </>

                ) : (

                  <div style={{ padding: '16px', background: 'rgba(0,255,204,0.1)', color: '#00ffcc', borderRadius: '12px', textAlign: 'center', marginBottom: '16px' }}>

                    ✅ Foto capturada correctamente

                  </div>

                )}



                <Button 

                  onClick={handleIniciarFaena}

                  disabled={!fotoURL && !isDemoSkipFoto}

                  style={{ 

                    width: '100%', padding: '16px', fontSize: '1.2rem', 

                    background: (!fotoURL && !isDemoSkipFoto) ? '#444' : 'linear-gradient(90deg, #00ffcc 0%, #00ccff 100%)',

                    color: (!fotoURL && !isDemoSkipFoto) ? '#888' : '#000',

                    border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center'

                  }}

                >

                  INICIAR FAENA

                </Button>

              </div>

            )}

            {(faenaEnCurso.estado === 'en_curso' || faenaEnCurso.estado === 'incidente') && (

              <div style={{ marginTop: '24px' }}>

                <h3 style={{ fontSize: '1.2rem', marginBottom: '16px', color: '#fff' }}>Faena en curso</h3>

                

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>

                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', flex: 1, marginRight: '8px', textAlign: 'center' }}>

                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>Tiempo</div>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', fontFamily: 'monospace' }}>

                      {formatTimer(faenaTimer)}

                    </div>

                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', flex: 1, marginLeft: '8px', textAlign: 'center' }}>

                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '4px' }}>Costo</div>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#00ffcc' }}>

                      ${costoAcumulado}

                    </div>

                  </div>

                </div>



                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>

                  <div style={{ marginBottom: '8px' }}><span style={{ color: '#aaa' }}>Destino:</span> {faenaEnCurso.destino_descripcion}</div>

                  <div><span style={{ color: '#aaa' }}>Modalidad:</span> {faenaEnCurso.modalidad?.replace('_', ' ').toUpperCase()}</div>

                </div>



                {!fotoURL && !isDemoSkipFoto ? (

                  <>

                    <label style={{ 

                      display: 'block', width: '100%', padding: '16px', fontSize: '1.1rem', 

                      background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px dashed #aaa', 

                      borderRadius: '12px', textAlign: 'center', cursor: 'pointer', marginBottom: '12px'

                    }}>

                      {uploadingFoto ? 'Subiendo foto...' : '📸 FOTO VEHÍCULO DESTINO'}

                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCaptureFoto} disabled={uploadingFoto} />

                    </label>

                    {isDemoMode && (

                      <Button onClick={() => setIsDemoSkipFoto(true)} style={{ width: '100%', marginBottom: '16px', background: '#ff4444', color: '#fff', border: 'none' }}>

                        OMITIR FOTO (DEMO)

                      </Button>

                    )}

                  </>

                ) : (

                  <div style={{ padding: '16px', background: 'rgba(0,255,204,0.1)', color: '#00ffcc', borderRadius: '12px', textAlign: 'center', marginBottom: '16px' }}>

                    ✅ Foto final capturada

                  </div>

                )}



                {faenaEnCurso.estado === 'incidente' && (

                  <div style={{ background: '#ff4444', color: '#fff', padding: '12px', borderRadius: '12px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '16px' }}>

                    INCIDENTE EN REVISIÓN. Timer pausado.

                  </div>

                )}

                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>

                  <Button onClick={() => setShowChat(true)} style={{ flex: 1, background: 'transparent', color: '#00ffcc', border: '1px solid #00ffcc' }}>Chat</Button>

                  <Button onClick={() => setShowIncidenteModal(true)} style={{ flex: 1, background: 'transparent', color: '#ff4444', border: '1px solid #ff4444' }}>Incidente</Button>

                </div>

                <Button 

                  onClick={handleFinalizarFaena}

                  disabled={!fotoURL && !isDemoSkipFoto}

                  style={{ 

                    width: '100%', padding: '16px', fontSize: '1.2rem', 

                    background: (!fotoURL && !isDemoSkipFoto) ? '#444' : '#ff4444',

                    color: (!fotoURL && !isDemoSkipFoto) ? '#888' : '#fff',

                    border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center'

                  }}

                >

                  FINALIZAR FAENA

                </Button>

              </div>

            )}

          </GlassCard>

        ) : (

          /* VISTA 1 / VISTA 6: DASHBOARD Y PERFIL */

          <div>

            {choferProfile.estado === 'disponible' && (

              <div style={{ marginBottom: '24px' }}>

                {/* PANEL 1: ESTADO Y FATIGA */}

                <GlassCard style={{ marginBottom: '16px', padding: '20px' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#00ffcc', boxShadow: '0 0 10px #00ffcc' }}></div>

                      <span style={{ fontSize: '1.1rem', fontWeight: '600' }}>Disponible</span>

                    </div>

                    {/* FATIGA INDICATOR */}

                    <div style={{ 

                      padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600',

                      background: (choferProfile.horas_conduccion_continua || 0) >= 8 ? 'rgba(255,68,68,0.2)' : (choferProfile.horas_conduccion_continua || 0) >= 7 ? 'rgba(255,221,0,0.2)' : 'rgba(0,255,204,0.2)',

                      color: (choferProfile.horas_conduccion_continua || 0) >= 8 ? '#ff4444' : (choferProfile.horas_conduccion_continua || 0) >= 7 ? '#ffdd00' : '#00ffcc',

                      border: `1px solid ${(choferProfile.horas_conduccion_continua || 0) >= 8 ? '#ff4444' : (choferProfile.horas_conduccion_continua || 0) >= 7 ? '#ffdd00' : '#00ffcc'}`

                    }}>

                      Fatiga: {(choferProfile.horas_conduccion_continua || 0).toFixed(1)}h / 8h

                    </div>

                  </div>

                  

                  {trasladoProgramado ? (

                    <div style={{

                      background: 'rgba(20,23,30,0.8)', borderLeft: '4px solid #cc00ff',

                      padding: '16px', borderRadius: '8px', display: 'flex', gap: '16px', alignItems: 'flex-start'

                    }}>

                      <div style={{ background: 'rgba(204,0,255,0.1)', padding: '12px', borderRadius: '50%' }}>

                        <Car size={24} color="#cc00ff" />

                      </div>

                      <div>

                        <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#fff' }}>Vagoneta en camino</h4>

                        <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem', lineHeight: '1.4' }}>

                          Llegada estimada {getFormatTime(trasladoProgramado.traslados_equipo.fecha_hora)} en <strong style={{color: '#fff'}}>{trasladoProgramado.descripcion}</strong>

                        </p>

                      </div>

                    </div>

                  ) : (

                    <div style={{ color: '#aaa', fontSize: '0.95rem' }}>

                      Esperando asignación de faena...

                    </div>

                  )}

                </GlassCard>



                {/* PANEL 2: METRICAS */}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                  <GlassCard style={{ padding: '16px', textAlign: 'center' }}>

                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '8px' }}>Faenas Hoy</div>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#00ffcc' }}>{metricasHoy.faenas}</div>

                  </GlassCard>

                  <GlassCard style={{ padding: '16px', textAlign: 'center' }}>

                    <div style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '8px' }}>Ganancias</div>

                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#cc00ff' }}>${Math.round(metricasHoy.ganancias)}</div>

                  </GlassCard>

                </div>



                {/* PANEL 3: HISTORIAL */}

                {faenasHoy.length > 0 && (

                  <GlassCard style={{ padding: '20px', marginBottom: '16px' }}>

                    <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: '#fff' }}>Historial del día</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                      {faenasHoy.slice(0, 3).map(f => (

                        <div key={f.id} style={{ 

                          background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px',

                          display: 'flex', justifyContent: 'space-between', alignItems: 'center'

                        }}>

                          <div>

                            <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{f.vehiculos_cliente?.tipo?.toUpperCase()}</div>

                            <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{getFormatTime(f.fecha_hora_inicio_real)} - {getFormatTime(f.fecha_hora_fin_real)}</div>

                          </div>

                          <div style={{ color: '#00ffcc', fontWeight: '600' }}>

                            Completada

                          </div>

                        </div>

                      ))}

                    </div>

                  </GlassCard>

                )}

              </div>

            )}



            {/* PANEL PERFIL (VISTA 1) */}

            <GlassCard style={{ marginBottom: '24px', padding: '24px', textAlign: 'center' }}>

              <div style={{ 

                width: '80px', height: '80px', borderRadius: '50%', 

                background: 'linear-gradient(135deg, #cc00ff 0%, #00ffcc 100%)', 

                margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center',

                fontSize: '2rem', fontWeight: 'bold', color: '#111'

              }}>

                {choferProfile.nombre.charAt(0).toUpperCase()}

              </div>

              

              <h2 style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '8px' }}>{choferProfile.nombre}</h2>

              

              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>

                {choferProfile.maneja_manual && (

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>

                    <Car size={16} color="#00ffcc" /> Manual

                  </div>

                )}

                {choferProfile.maneja_automatico && (

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>

                    <Key size={16} color="#cc00ff" /> Automático

                  </div>

                )}

                {choferProfile.maneja_electrico && (

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem' }}>

                    <Zap size={16} color="#ffdd00" /> Eléctrico

                  </div>

                )}

              </div>



              <Button 

                onClick={toggleTurno} 

                style={{ 

                  width: '100%', padding: '16px', fontSize: '1.2rem', 

                  background: choferProfile.estado === 'disponible' ? '#ff4444' : 'linear-gradient(90deg, #cc00ff 0%, #00ffcc 100%)',

                  color: choferProfile.estado === 'disponible' ? '#fff' : '#111',

                  border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px',

                  boxShadow: choferProfile.estado === 'disponible' ? '0 4px 15px rgba(255,68,68,0.3)' : '0 4px 15px rgba(0,255,204,0.3)'

                }}

              >

                <Power size={24} />

                {choferProfile.estado === 'disponible' ? 'FINALIZAR TURNO' : 'INICIAR TURNO'}

              </Button>

            </GlassCard>



          </div>

        )}



      </div>



      {/* MODAL DE OFERTA */}

      {ofertaActiva && (

        <div style={{

          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',

          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',

          display: 'flex', alignItems: 'center', justifyContent: 'center',

          zIndex: 1000, padding: '20px', boxSizing: 'border-box'

        }}>

          <GlassCard style={{ width: '100%', maxWidth: '400px', padding: '0', overflow: 'hidden' }}>

            <div style={{ padding: '24px', textAlign: 'center' }}>

              <div style={{ 

                width: '60px', height: '60px', borderRadius: '50%', 

                background: 'rgba(0,255,204,0.1)', 

                margin: '0 auto 16px auto', display: 'flex', alignItems: 'center', justifyContent: 'center',

                color: '#00ffcc'

              }}>

                <Car size={32} />

              </div>

              <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '700' }}>¡Nueva Faena!</h2>

              <p style={{ margin: '0 0 24px 0', color: '#aaa', fontSize: '1rem' }}>

                Modalidad: <strong style={{ color: '#fff' }}>{ofertaActiva.modalidad === 'por_minuto' || ofertaActiva.modalidad === 'por_hora' ? 'Por minuto/hora' : 'Día Completo'}</strong>

              </p>



              <div style={{ 

                background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '16px', 

                marginBottom: '24px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px'

              }}>

                <div>

                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '4px' }}>Vehículo</div>

                  <div style={{ fontSize: '1rem', fontWeight: '600' }}>

                    {ofertaActiva.vehiculos_cliente?.tipo.toUpperCase()} - {ofertaActiva.vehiculos_cliente?.transmision.toUpperCase()}

                  </div>

                </div>



                {ofertaActiva.vehiculos_cliente?.es_electrico && (

                  <div style={{ 

                    background: 'rgba(255,221,0,0.1)', border: '1px solid #ffdd00', color: '#ffdd00',

                    padding: '8px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'

                  }}>

                    <Zap size={16} /> <strong>Atención: Vehículo Eléctrico</strong>

                  </div>

                )}



                {!choferProfile.maneja_electrico && ofertaActiva.vehiculos_cliente?.es_electrico && (

                  <div style={{ color: '#ff4444', fontSize: '0.85rem', fontWeight: '600' }}>

                    No tienes certificación para manejar eléctricos.

                  </div>

                )}



                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>

                  <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '4px' }}>Origen</div>

                  <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>{ofertaActiva.origen_descripcion}</div>

                </div>

                

                {ofertaActiva.destino_descripcion && (

                  <div>

                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '4px' }}>Destino</div>

                    <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>{ofertaActiva.destino_descripcion}</div>

                  </div>

                )}

              </div>



              <div style={{ display: 'flex', gap: '12px' }}>

                <Button variant="secondary" onClick={handleRechazarOferta} style={{ flex: 1 }}>

                  RECHAZAR

                </Button>

                <Button 

                  onClick={handleAceptarOferta} 

                  style={{ flex: 2, background: 'linear-gradient(90deg, #00ffcc 0%, #00ccff 100%)', color: '#000' }}

                  disabled={!choferProfile.maneja_electrico && ofertaActiva.vehiculos_cliente?.es_electrico}

                >

                  ACEPTAR

                </Button>

              </div>

            </div>



            {/* Barra de progreso / Timer */}

            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)' }}>

              <div style={{

                height: '100%',

                background: timerOferta > 5 ? '#00ffcc' : '#ff4444',

                width: `${(timerOferta / 15) * 100}%`,

                transition: 'width 1s linear, background-color 0.3s'

              }} />

            </div>

            <div style={{ position: 'absolute', top: '12px', right: '16px', color: '#aaa', fontSize: '0.85rem', fontWeight: '600' }}>

              {timerOferta}s

            </div>

          </GlassCard>

        </div>

      )}





      {showChat && (

        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          <div style={{ width: '90%', maxWidth: '400px', height: '80%' }}>

            <ChatPanel faenaId={faenaEnCurso?.id} userId={choferProfile?.id} userRole="chofer" onClose={() => setShowChat(false)} />

          </div>

        </div>

      )}

      

      {showIncidenteModal && (

        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          <GlassCard style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>

            <h3 style={{ marginTop: 0 }}>Reportar Incidente</h3>

            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '16px' }}>Describe el problema (ej: daño en el vehículo, choque, problema con el cliente). El timer de cobro se pausará hasta que un administrador lo resuelva.</p>

            <textarea 

              value={incidenteDesc}

              onChange={e => setIncidenteDesc(e.target.value)}

              placeholder="Descripción del incidente..."

              style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '16px', outline: 'none' }}

            />

            <div style={{ display: 'flex', gap: '12px' }}>

              <Button variant="outline" onClick={() => setShowIncidenteModal(false)} style={{ flex: 1 }}>Cancelar</Button>

              <Button onClick={handleReportIncidente} style={{ flex: 1, background: '#ff4444', color: '#fff', border: 'none' }} disabled={!incidenteDesc.trim()}>Reportar</Button>

            </div>

          </GlassCard>

        </div>

      )}



      {/* BOTON SOS FLOTANTE */}

      <button style={{

        position: 'fixed', bottom: '20px', right: '20px', zIndex: 100,

        background: '#ff4444', color: '#fff', border: 'none', borderRadius: '50%',

        width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',

        boxShadow: '0 4px 15px rgba(255,68,68,0.4)', cursor: 'pointer'

      }} onClick={() => alert("SOS Triggered")}>

        <AlertTriangle size={28} />

      </button>



    </div>

  );

};



export default ChoferApp;

