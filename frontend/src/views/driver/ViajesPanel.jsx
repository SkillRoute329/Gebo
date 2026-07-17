import React, { useState, useEffect } from 'react';
import GlassCard from '../../components/ui/GlassCard';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ViajesPanel = () => {
  const [tab, setTab] = useState('pendientes');

  const tabStyle = (active) => ({
    flex: 1,
    textAlign: 'center',
    padding: '12px',
    cursor: 'pointer',
    fontWeight: '600',
    borderBottom: active ? '3px solid var(--accent-magenta)' : '3px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    transition: 'all 0.2s ease'
  });

  const [faenas, setFaenas] = useState([]);
  const [faenaAFinalizar, setFaenaAFinalizar] = useState(null);
  const [odometroFin, setOdometroFin] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [errorSync, setErrorSync] = useState('');

  // En una app real esto vendría de Supabase o Props. Para la demo usamos una faena fija.
  useEffect(() => {
    setFaenas([
      { id: 'f1', cliente: 'María González', origen: 'Bvar. Artigas 1234', destino: 'Zonamerica', estado: 'en_curso', odometro_inicio: 150130, gps_km: 18 }
    ]);
  }, []);

  const handleFinalizar = async (e) => {
    e.preventDefault();
    setErrorSync('');
    const odoFinNum = parseInt(odometroFin, 10);
    
    if (isNaN(odoFinNum) || odoFinNum <= faenaAFinalizar.odometro_inicio) {
      return setErrorSync('Odómetro inválido. Debe ser mayor al inicial (' + faenaAFinalizar.odometro_inicio + ').');
    }

    const distOdo = odoFinNum - faenaAFinalizar.odometro_inicio;
    if (distOdo > faenaAFinalizar.gps_km * 1.10 && !fotoUrl) {
      return setErrorSync('Diferencia mayor al 10%. Foto de odómetro requerida.');
    }

    try {
      // RPC Call
      const { data, error } = await supabase.rpc('finalizar_faena_sync', {
        p_faena_id: faenaAFinalizar.id,
        p_odometro_fin: odoFinNum,
        p_gps_km: faenaAFinalizar.gps_km,
        p_foto_url: fotoUrl || null
      });

      if (error) {
        if (error.message.includes('foto_requerida')) {
          setErrorSync('Diferencia mayor al 10%. Foto de odómetro requerida.');
        } else {
          setErrorSync('Error al sincronizar: ' + error.message);
        }
        return;
      }

      alert('Faena finalizada. Costo calculado: $' + data.costo_final);
      setFaenaAFinalizar(null);
      setTab('realizados');
    } catch (err) {
      setErrorSync('Excepción: ' + err.message);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', padding: '20px', paddingTop: '80px', overflowY: 'auto' }}>
      <h2 style={{ marginBottom: '20px' }}>Mis Viajes</h2>

      <div style={{ display: 'flex', marginBottom: '20px', backgroundColor: 'var(--bg-slate-light)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={tabStyle(tab === 'pendientes')} onClick={() => setTab('pendientes')}>Pendientes</div>
        <div style={tabStyle(tab === 'realizados')} onClick={() => setTab('realizados')}>Realizados</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '100px' }}>
        {tab === 'pendientes' ? (
          <>
            {faenas.filter(f => f.estado === 'en_curso').map(f => (
              <GlassCard key={f.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ color: 'var(--accent-pink)', fontWeight: '600' }}>EN CURSO</span>
                  <span style={{ backgroundColor: 'rgba(234, 96, 147, 0.2)', padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--accent-magenta)' }}>VIP</span>
                </div>
                <h3 style={{ marginBottom: '12px' }}>{f.cliente}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  <MapPin size={16} /> <span>{f.origen}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                  <MapPin size={16} color="var(--accent-magenta)" /> <span>{f.destino}</span>
                </div>
                <button 
                  onClick={() => { setFaenaAFinalizar(f); setOdometroFin(''); setFotoUrl(''); setErrorSync(''); }}
                  style={{ marginTop: '16px', padding: '12px', width: '100%', background: 'var(--accent-magenta)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
                >
                  Finalizar Faena
                </button>
              </GlassCard>
            ))}
          </>
        ) : (
          <>
            <GlassCard style={{ opacity: 0.7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>HOY 09:15</span>
                <span style={{ color: '#00ffcc', fontWeight: '600' }}>COMPLETADO</span>
              </div>
              <h3 style={{ marginBottom: '8px' }}>Carlos Silva</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Aeropuerto Carrasco ➔ Pocitos</p>
            </GlassCard>
          </>
        )}
      </div>

      {faenaAFinalizar && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#1a1d24', padding: '24px', borderRadius: '16px', width: '90%', maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '16px', color: 'white' }}>Finalizar Faena</h3>
            <form onSubmit={handleFinalizar} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', color: '#aaa', fontSize: '0.9rem' }}>Odómetro Final (km)</label>
                <input 
                  type="number" 
                  value={odometroFin} 
                  onChange={e => setOdometroFin(e.target.value)} 
                  placeholder={`Inicial: ${faenaAFinalizar.odometro_inicio} km`}
                  required 
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: 'white' }} 
                />
              </div>
              
              {odometroFin && parseInt(odometroFin) - faenaAFinalizar.odometro_inicio > faenaAFinalizar.gps_km * 1.10 && (
                <div style={{ padding: '12px', background: 'rgba(255, 68, 68, 0.1)', border: '1px solid #ff4444', borderRadius: '8px' }}>
                  <p style={{ color: '#ff4444', fontSize: '0.85rem', marginBottom: '8px' }}>⚠️ Diferencia mayor al 10% con el GPS ({faenaAFinalizar.gps_km} km estimados). Foto obligatoria.</p>
                  <input 
                    type="text" 
                    value={fotoUrl} 
                    onChange={e => setFotoUrl(e.target.value)} 
                    placeholder="URL de foto del tablero" 
                    required 
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ff4444', background: '#111', color: 'white' }} 
                  />
                </div>
              )}

              {errorSync && <p style={{ color: '#ff4444', fontSize: '0.9rem' }}>{errorSync}</p>}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setFaenaAFinalizar(null)} style={{ flex: 1, padding: '12px', background: '#333', color: 'white', border: 'none', borderRadius: '8px' }}>Cancelar</button>
                <button type="submit" style={{ flex: 2, padding: '12px', background: 'var(--accent-magenta)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>Sincronizar y Cerrar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViajesPanel;
