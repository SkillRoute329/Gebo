import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';

export const PassengerApp = ({ empleadoId, faenaIdActiva }) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    if (faenaIdActiva) {
      fetchMessages();
      const channel = supabase.channel(`faena_${faenaIdActiva}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats_faenas', filter: `faena_id=eq.${faenaIdActiva}` }, payload => {
          setChatMessages(prev => [...prev, payload.new]);
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [faenaIdActiva]);

  const fetchMessages = async () => {
    const { data } = await supabase.from('chats_faenas').select('*').eq('faena_id', faenaIdActiva).order('created_at', { ascending: true });
    if (data) setChatMessages(data);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !faenaIdActiva) return;
    await supabase.from('chats_faenas').insert([{
      faena_id: faenaIdActiva,
      remitente_tipo: 'cliente',
      mensaje: newMessage.trim()
    }]);
    setNewMessage('');
  };

  return (
    <div style={{ padding: '20px', color: 'white', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🚗 En Viaje</h2>
      
      <GlassCard style={{ padding: '20px', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ color: '#aaa', fontSize: '1.2rem' }}>[Mapa Interactivo de Seguimiento GPS en Tiempo Real]</div>
      </GlassCard>

      {faenaIdActiva ? (
        <GlassCard style={{ padding: '20px', height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', color: '#00ffcc' }}>Chat con Chofer (Privado)</h2>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {chatMessages.map(msg => (
              <div key={msg.id} style={{ 
                alignSelf: msg.remitente_tipo === 'cliente' ? 'flex-end' : 'flex-start',
                background: msg.remitente_tipo === 'cliente' ? '#3399ff' : 'rgba(255,255,255,0.1)',
                padding: '10px',
                borderRadius: '8px',
                maxWidth: '80%'
              }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '5px' }}>{msg.remitente_tipo.toUpperCase()}</div>
                <div>{msg.mensaje}</div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '10px' }}>
            <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Mensaje para el chofer..." style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px' }} />
            <Button type="submit" style={{ background: '#3399ff', color: 'white', border: 'none' }}>Enviar</Button>
          </form>
        </GlassCard>
      ) : (
        <GlassCard style={{ padding: '20px' }}>
          <div style={{ color: '#aaa' }}>No tienes un viaje activo en este momento.</div>
        </GlassCard>
      )}
    </div>
  );
}
