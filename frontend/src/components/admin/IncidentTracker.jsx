import React from 'react';
import { AlertTriangle } from 'lucide-react';

const IncidentTracker = ({ alertas, onResolverAlerta }) => {
  if (Object.keys(alertas).length === 0) return null;

  return (
    <div style={{ marginTop: '24px', backgroundColor: 'rgba(255,0,0,0.1)', padding: '16px', borderRadius: '12px', border: '1px solid #ff4444' }}>
      <h3 style={{ color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}><AlertTriangle size={20} /> ¡ALERTA SOS ACTIVA!</h3>
      {Object.values(alertas).map(alerta => (
        <div key={alerta.id} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,0,0,0.2)' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Emisor: {alerta.tipo_emisor.toUpperCase()}</p>
          <p style={{ fontSize: '0.8rem', color: '#ffaaaa' }}>Viaje: #{alerta.viaje_id?.substring(0,8)}</p>
          <button onClick={() => onResolverAlerta(alerta.id)} style={{ backgroundColor: '#ff4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', width: '100%', marginTop: '8px' }}>Marcar Resuelta</button>
        </div>
      ))}
    </div>
  );
};

export default IncidentTracker;
