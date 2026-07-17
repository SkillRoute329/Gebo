import React, { useState } from 'react';
import GlassCard from '../../components/ui/GlassCard';
import { Calendar, Clock, MapPin } from 'lucide-react';

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
            <GlassCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ color: 'var(--accent-pink)', fontWeight: '600' }}>HOY 14:30</span>
                <span style={{ backgroundColor: 'rgba(234, 96, 147, 0.2)', padding: '4px 8px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--accent-magenta)' }}>VIP</span>
              </div>
              <h3 style={{ marginBottom: '12px' }}>María González</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                <MapPin size={16} /> <span>Bvar. Artigas 1234, Montevideo</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <MapPin size={16} color="var(--accent-magenta)" /> <span>Zonamerica</span>
              </div>
            </GlassCard>
            
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '20px', fontSize: '0.9rem' }}>
              No tienes más viajes asignados para hoy.
            </p>
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
    </div>
  );
};

export default ViajesPanel;
