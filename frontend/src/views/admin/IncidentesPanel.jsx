import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertOctagon, CheckCircle } from 'lucide-react';
import Button from '../../components/ui/Button';

const IncidentesPanel = () => {
  const [incidentes, setIncidentes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchIncidentes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('incidentes_faena')
      .select('*, faenas(*, choferes(nombre), clientes(nombre))')
      .neq('estado', 'resuelto')
      .order('timestamp', { ascending: false });
    
    if (data) setIncidentes(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchIncidentes();
    const channel = supabase.channel('admin-incidentes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidentes_faena' }, () => {
        fetchIncidentes();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const handleResolver = async (incidente) => {
    if (!confirm('¿Seguro que deseas marcar este incidente como resuelto y reanudar la faena?')) return;
    
    // Marcar como resuelto
    await supabase.from('incidentes_faena').update({ estado: 'resuelto' }).eq('id', incidente.id);
    // Cambiar estado de la faena de vuelta a en_curso
    await supabase.from('faenas').update({ estado: 'en_curso' }).eq('id', incidente.faena_id);
    
    fetchIncidentes();
  };

  if (loading) return <div style={{ color: '#fff', padding: '24px' }}>Cargando incidentes...</div>;

  return (
    <div style={{ padding: '24px', color: '#fff' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <AlertOctagon color="#ff4444" /> Incidentes Activos ({incidentes.length})
      </h2>
      
      {incidentes.length === 0 ? (
        <p style={{ color: '#aaa' }}>No hay incidentes reportados en este momento.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
          {incidentes.map(inc => (
            <div key={inc.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', borderLeft: '4px solid #ff4444' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0' }}>Faena: {inc.faenas?.origen_descripcion} → {inc.faenas?.destino_descripcion}</h3>
                  <p style={{ margin: '0 0 4px 0', color: '#aaa' }}><strong>Chofer:</strong> {inc.faenas?.choferes?.nombre}</p>
                  <p style={{ margin: '0 0 4px 0', color: '#aaa' }}><strong>Cliente:</strong> {inc.faenas?.clientes?.nombre}</p>
                  <p style={{ margin: '0 0 12px 0', color: '#aaa' }}><strong>Fecha/Hora:</strong> {new Date(inc.timestamp).toLocaleString()}</p>
                  
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid #333' }}>
                    <p style={{ margin: 0 }}><strong>Descripción del Incidente:</strong></p>
                    <p style={{ margin: '8px 0 0 0', color: '#ddd' }}>{inc.descripcion}</p>
                  </div>
                </div>
                
                <Button 
                  onClick={() => handleResolver(inc)}
                  style={{ background: '#00ccaa', color: '#111', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <CheckCircle size={18} /> Marcar como Resuelto
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default IncidentesPanel;
