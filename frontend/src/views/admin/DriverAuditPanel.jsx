import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';

export const DriverAuditPanel = () => {
  const [solicitudes, setSolicitudes] = useState([]);
  const [faenaChats, setFaenaChats] = useState([]);
  const [selectedFaena, setSelectedFaena] = useState('');

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  useEffect(() => {
    if (selectedFaena) {
      fetchChats();
    }
  }, [selectedFaena]);

  const fetchSolicitudes = async () => {
    const { data } = await supabase
      .from('solicitudes_financieras_chofer')
      .select('*, choferes(nombre)')
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });
    if (data) setSolicitudes(data);
  };

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats_faenas')
      .select('*')
      .eq('faena_id', selectedFaena)
      .order('created_at', { ascending: true });
    if (data) setFaenaChats(data);
  };

  const handleProcesar = async (solicitudId, accion) => {
    const { error } = await supabase.rpc('procesar_solicitud_financiera', {
      p_solicitud_id: solicitudId,
      p_accion: accion
    });
    
    if (!error) {
      alert(`Solicitud ${accion === 'aprobar' ? 'Aprobada' : 'Rechazada'} transaccionalmente.`);
      fetchSolicitudes();
    } else {
      alert("Error procesando solicitud");
    }
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', fontWeight: 'bold' }}>Panel de Auditoría de Choferes</h2>

      <GlassCard style={{ padding: '20px', marginBottom: '30px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '15px', color: '#00ffcc' }}>Solicitudes Financieras Pendientes</h3>
        {solicitudes.length > 0 ? (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                <th style={{ padding: '10px' }}>Chofer</th>
                <th style={{ padding: '10px' }}>Tipo</th>
                <th style={{ padding: '10px' }}>Monto</th>
                <th style={{ padding: '10px' }}>Motivo</th>
                <th style={{ padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '10px' }}>{s.choferes?.nombre || 'Desconocido'}</td>
                  <td style={{ padding: '10px', textTransform: 'capitalize' }}>{s.tipo}</td>
                  <td style={{ padding: '10px', color: '#00ffcc', fontWeight: 'bold' }}>${s.monto}</td>
                  <td style={{ padding: '10px' }}>{s.motivo}</td>
                  <td style={{ padding: '10px' }}>
                    <Button onClick={() => handleProcesar(s.id, 'aprobar')} style={{ background: '#00cc66', color: 'white', border: 'none', marginRight: '5px', padding: '5px 10px', fontSize: '0.8rem' }}>Aprobar</Button>
                    <Button onClick={() => handleProcesar(s.id, 'rechazar')} style={{ background: '#cc0000', color: 'white', border: 'none', padding: '5px 10px', fontSize: '0.8rem' }}>Rechazar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#aaa' }}>No hay solicitudes pendientes.</div>
        )}
      </GlassCard>

      <GlassCard style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '15px', color: '#ff4444' }}>Auditoría de Chats (Incidentes)</h3>
        <input 
          type="text" 
          placeholder="ID de la Faena (UUID)" 
          value={selectedFaena} 
          onChange={e => setSelectedFaena(e.target.value)} 
          style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px', width: '300px', marginBottom: '15px' }}
        />
        
        {selectedFaena && (
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {faenaChats.length > 0 ? faenaChats.map(c => (
              <div key={c.id} style={{ marginBottom: '10px' }}>
                <strong style={{ color: c.remitente_tipo === 'chofer' ? '#00cc66' : c.remitente_tipo === 'cliente' ? '#3399ff' : '#ff4444' }}>
                  {c.remitente_tipo.toUpperCase()}:
                </strong> <span style={{ color: '#ccc' }}>[{new Date(c.created_at).toLocaleTimeString()}]</span> {c.mensaje}
              </div>
            )) : <div style={{ color: '#aaa' }}>No se encontraron mensajes para esta faena.</div>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
