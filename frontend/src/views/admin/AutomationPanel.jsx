import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';

export const AutomationPanel = () => {
  const [config, setConfig] = useState({
    despacho_autonomo_h3: false,
    bloqueo_fatiga_estricto: true,
    auditoria_automatica_limite: false
  });
  const [loading, setLoading] = useState(true);
  const [auditorias, setAuditorias] = useState([]);
  const [selectedAuditorias, setSelectedAuditorias] = useState([]);

  useEffect(() => {
    fetchConfig();
    fetchAuditorias();
  }, []);

  const fetchConfig = async () => {
    const { data, error } = await supabase.from('configuracion_automatizacion').select('*').eq('id', 1).single();
    if (data && !error) setConfig(data);
    setLoading(false);
  };

  const fetchAuditorias = async () => {
    const { data, error } = await supabase
      .from('faenas')
      .select('*, choferes(id), clientes(nombre)')
      .eq('estado', 'pendiente_auditoria_admin')
      .order('fecha_hora_fin_real', { ascending: false });
    
    if (data && !error) setAuditorias(data);
  };

  const handleToggle = async (field) => {
    const newValue = !config[field];
    setConfig({ ...config, [field]: newValue });
    await supabase.from('configuracion_automatizacion').update({ [field]: newValue }).eq('id', 1);
  };

  const toggleSelectAll = () => {
    if (selectedAuditorias.length === auditorias.length) {
      setSelectedAuditorias([]);
    } else {
      setSelectedAuditorias(auditorias.map(a => a.id));
    }
  };

  const toggleSelect = (id) => {
    if (selectedAuditorias.includes(id)) {
      setSelectedAuditorias(selectedAuditorias.filter(item => item !== id));
    } else {
      setSelectedAuditorias([...selectedAuditorias, id]);
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedAuditorias.length === 0) return;
    
    // Si action es 'aprobar', las marcamos como 'finalizada', si es 'rechazar', como 'cancelada'
    const newEstado = action === 'aprobar' ? 'finalizada' : 'cancelada';
    
    const { error } = await supabase
      .from('faenas')
      .update({ estado: newEstado })
      .in('id', selectedAuditorias);

    if (!error) {
      // Refresh
      setSelectedAuditorias([]);
      fetchAuditorias();
      alert(`Se han ${action === 'aprobar' ? 'aprobado' : 'rechazado'} las faenas seleccionadas.`);
    } else {
      alert("Error al procesar la solicitud");
    }
  };

  if (loading) return <div style={{ color: 'white', padding: '20px' }}>Cargando panel de automatización...</div>;

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', fontWeight: 'bold' }}>Panel de Automatización y Control</h2>
      
      <GlassCard style={{ padding: '20px', marginBottom: '30px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: '#00ffcc' }}>Configuración Paramétrica</h3>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Despacho Autónomo H3</div>
            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Asignación automática de viajes basándose en índice H3 (Latencia \u003c 5ms)</div>
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input type="checkbox" checked={config.despacho_autonomo_h3} onChange={() => handleToggle('despacho_autonomo_h3')} style={{ transform: 'scale(1.5)' }} />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Bloqueo de Fatiga Estricto</div>
            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Si se excede el límite (ej. 8 horas), deshabilitar al chofer automáticamente.</div>
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input type="checkbox" checked={config.bloqueo_fatiga_estricto} onChange={() => handleToggle('bloqueo_fatiga_estricto')} style={{ transform: 'scale(1.5)' }} />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Auditoría Automática Límite</div>
            <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Habilitar revisión automática por reglas secundarias (experimental).</div>
          </div>
          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <input type="checkbox" checked={config.auditoria_automatica_limite} onChange={() => handleToggle('auditoria_automatica_limite')} style={{ transform: 'scale(1.5)' }} />
          </label>
        </div>
      </GlassCard>

      <GlassCard style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '10px', color: '#ff4444' }}>Bandeja de Auditoría del Circuit Breaker</h3>
        <p style={{ color: '#aaa', marginBottom: '20px' }}>Faenas bloqueadas por anomalías contables (Ej. odómetro exagerado). Requieren liberación manual hacia el libro mayor.</p>
        
        {auditorias.length > 0 ? (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <Button onClick={() => handleBulkAction('aprobar')} style={{ background: '#00cc66', color: 'white', border: 'none' }}>Aprobar Seleccionadas</Button>
              <Button onClick={() => handleBulkAction('rechazar')} style={{ background: '#cc0000', color: 'white', border: 'none' }}>Rechazar Seleccionadas</Button>
            </div>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                  <th style={{ padding: '10px' }}><input type="checkbox" checked={selectedAuditorias.length === auditorias.length} onChange={toggleSelectAll} /></th>
                  <th style={{ padding: '10px' }}>ID Faena</th>
                  <th style={{ padding: '10px' }}>Cliente</th>
                  <th style={{ padding: '10px' }}>Costo Disparado</th>
                  <th style={{ padding: '10px' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {auditorias.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '10px' }}>
                      <input type="checkbox" checked={selectedAuditorias.includes(a.id)} onChange={() => toggleSelect(a.id)} />
                    </td>
                    <td style={{ padding: '10px', fontSize: '0.85rem', color: '#ccc' }}>{a.id}</td>
                    <td style={{ padding: '10px' }}>{a.clientes?.nombre || 'N/A'}</td>
                    <td style={{ padding: '10px', color: '#ff4444', fontWeight: 'bold' }}>${a.costo_total}</td>
                    <td style={{ padding: '10px' }}>{new Date(a.fecha_hora_fin_real).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#00e6b8', background: 'rgba(0, 230, 184, 0.1)', borderRadius: '8px' }}>
            🎉 No hay faenas pendientes de auditoría. El circuit breaker está limpio.
          </div>
        )}
      </GlassCard>
    </div>
  );
}
