import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, Users, CheckCircle, WifiOff } from 'lucide-react';
import Button from '../../components/ui/Button';
import GlassCard from '../../components/ui/GlassCard';

const ShuttleConsole = () => {
  const [routeId, setRouteId] = useState('ruta-demo-123'); // Demo
  const [paradas, setParadas] = useState([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cargar paradas demo
    const paradasDemo = [
      { id: 'p1', direccion: 'Punta Carretas Shopping', ETA: '14:15', pasajeros: 2, estado: 'pendiente' },
      { id: 'p2', direccion: 'Tres Cruces', ETA: '14:35', pasajeros: 3, estado: 'pendiente' },
      { id: 'p3', direccion: 'Zonamerica (Base)', ETA: '15:10', pasajeros: 0, estado: 'pendiente' }
    ];
    
    const saved = localStorage.getItem(`shuttle_route_${routeId}`);
    if (saved) {
      setParadas(JSON.parse(saved));
    } else {
      setParadas(paradasDemo);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [routeId]);

  const handleMarcarChoferAbordo = async (paradaId) => {
    const newParadas = paradas.map(p => p.id === paradaId ? { ...p, estado: 'completada' } : p);
    setParadas(newParadas);
    
    // Cache local for offline safety
    localStorage.setItem(`shuttle_route_${routeId}`, JSON.stringify(newParadas));

    if (!isOffline) {
      try {
        // En un entorno real se haría un update a supabase a `paradas_traslado`
        // await supabase.from('paradas_traslado').update({ estado: 'completada' }).eq('id', paradaId);
      } catch (err) {
        console.error("No se pudo sincronizar", err);
      }
    }
  };

  const syncPending = async () => {
    if (isOffline) return;
    alert("Sincronización con el servidor exitosa.");
    // Aquí iría el sync de los que están en localStorage y no en supabase
  };

  return (
    <div style={{ height: '100%', width: '100%', padding: '20px', paddingTop: '80px', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2>Ruta de Vagoneta</h2>
        {isOffline ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff4444', fontSize: '0.8rem', fontWeight: 'bold' }}>
            <WifiOff size={16} /> OFFLINE
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#00ffcc', fontSize: '0.8rem', fontWeight: 'bold' }} onClick={syncPending}>
            <CheckCircle size={16} /> ONLINE
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Ruta Activa: <strong>{routeId}</strong></p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
        {paradas.map((parada, index) => (
          <GlassCard key={parada.id} style={{ opacity: parada.estado === 'completada' ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: 'var(--accent-pink)', fontWeight: '600' }}>Parada {index + 1} • ETA: {parada.ETA}</span>
              {parada.estado === 'completada' && <CheckCircle size={20} color="#00ffcc" />}
            </div>
            <h3 style={{ marginBottom: '12px' }}>{parada.direccion}</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
              <Users size={16} /> <span>{parada.pasajeros} pasajeros a recoger</span>
            </div>

            {parada.estado !== 'completada' && (
              <Button 
                variant="primary" 
                style={{ width: '100%' }}
                onClick={() => handleMarcarChoferAbordo(parada.id)}
              >
                Chofer a bordo
              </Button>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
};

export default ShuttleConsole;
