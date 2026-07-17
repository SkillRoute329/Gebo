import React from 'react';
import { supabase } from '../../lib/supabase';

const ChecklistManager = ({ preguntasChecklist, onFetchData }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {preguntasChecklist.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', backgroundColor: '#111', borderRadius: '4px', borderLeft: p.es_critica ? '3px solid #ff4444' : '3px solid #00ffcc' }}>
          <div>
            <span style={{ color: p.es_critica ? '#ff4444' : 'white', fontSize: '0.9rem' }}>{p.pregunta}</span>
            <span style={{ fontSize: '0.7rem', color: '#888', marginLeft: '8px' }}>[{p.categoria}]</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
            <input type="checkbox" checked={p.activa} onChange={async (e) => {
              await supabase.from('preguntas_checklist').update({ activa: e.target.checked }).eq('id', p.id);
              onFetchData();
            }} />
            Activa
          </label>
        </div>
      ))}
    </div>
  );
};

export default ChecklistManager;
