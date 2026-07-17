import React from 'react';
import { supabase } from '../../lib/supabase';

const FinancialConsole = ({ finanzas, sugerencias, onFetchData }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h3 style={{ fontSize: '1.2rem', color: 'var(--accent-magenta)' }}>Diagnóstico y Salud Financiera</h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #00ffcc' }}>
          <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '8px' }}>Ingresos (Faenas)</p>
          <h4 style={{ color: 'white', fontSize: '1.5rem' }}>$ {finanzas.ingreso.toFixed(2)}</h4>
        </div>
        <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ffaa00' }}>
          <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '8px' }}>Costos (Shuttle Routes)</p>
          <h4 style={{ color: 'white', fontSize: '1.5rem' }}>$ {finanzas.costo.toFixed(2)}</h4>
        </div>
        <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', borderLeft: `4px solid ${finanzas.margen >= 0 ? '#00cc66' : '#ff4444'}` }}>
          <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '8px' }}>Margen Neto</p>
          <h4 style={{ color: finanzas.margen >= 0 ? '#00cc66' : '#ff4444', fontSize: '1.5rem' }}>$ {finanzas.margen.toFixed(2)}</h4>
        </div>
        <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #0088ff' }}>
          <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '8px' }}>Costo Promedio x Km</p>
          <h4 style={{ color: 'white', fontSize: '1.5rem' }}>$ {(finanzas.km > 0 ? (finanzas.costo / finanzas.km) : 0).toFixed(2)}</h4>
        </div>
      </div>

      <h3 style={{ fontSize: '1rem', color: 'var(--accent-magenta)' }}>Sugerencias de Optimización Contable</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sugerencias.length === 0 ? <p style={{ fontSize: '0.8rem', color: '#aaa' }}>No hay sugerencias financieras en este momento.</p> : sugerencias.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#1a1a2e', borderRadius: '8px', border: '1px solid #333' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'white', fontSize: '0.95rem' }}>{s.descripcion}</span>
              <span style={{ fontSize: '0.75rem', color: '#888', marginTop: '4px' }}>Zona: {s.zona_h3 || 'General'} | Vagoneta: {s.vagoneta_id || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={async () => {
                await supabase.from('sugerencias_financieras').update({ aplicada: true }).eq('id', s.id);
                onFetchData();
              }} style={{ background: '#00ffcc', color: 'black', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Aplicar</button>
              <button onClick={async () => {
                await supabase.from('sugerencias_financieras').update({ aplicada: true }).eq('id', s.id);
                onFetchData();
              }} style={{ background: '#333', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Ignorar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FinancialConsole;
