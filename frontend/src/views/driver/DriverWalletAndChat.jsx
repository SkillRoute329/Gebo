import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';

export const DriverWalletAndChat = ({ driverId, activeFaenaId }) => {
  const [tab, setTab] = useState('wallet'); // 'wallet' or 'chat'
  const [walletFilter, setWalletFilter] = useState('dia'); // 'dia', 'semana', 'mes'
  const [saldo, setSaldo] = useState(0);
  const [solicitudTipo, setSolicitudTipo] = useState('anticipo');
  const [solicitudMonto, setSolicitudMonto] = useState('');
  const [solicitudMotivo, setSolicitudMotivo] = useState('');
  
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    fetchSaldo();
    if (activeFaenaId) {
      fetchMessages();
      const channel = supabase.channel(`faena_${activeFaenaId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats_faenas', filter: `faena_id=eq.${activeFaenaId}` }, payload => {
          setChatMessages(prev => [...prev, payload.new]);
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [activeFaenaId, walletFilter]);

  const fetchSaldo = async () => {
    const { data } = await supabase.from('choferes').select('saldo_billetera').eq('id', driverId).single();
    if (data) setSaldo(data.saldo_billetera);
  };

  const fetchMessages = async () => {
    const { data } = await supabase.from('chats_faenas').select('*').eq('faena_id', activeFaenaId).order('created_at', { ascending: true });
    if (data) setChatMessages(data);
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!solicitudMonto || !solicitudMotivo) return;
    const { error } = await supabase.from('solicitudes_financieras_chofer').insert([{
      gebo_driver_id: driverId,
      tipo: solicitudTipo,
      monto: parseFloat(solicitudMonto),
      motivo: solicitudMotivo
    }]);
    if (!error) {
      alert('Solicitud enviada al administrador.');
      setSolicitudMonto('');
      setSolicitudMotivo('');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeFaenaId) return;
    await supabase.from('chats_faenas').insert([{
      faena_id: activeFaenaId,
      remitente_tipo: 'chofer',
      mensaje: newMessage.trim()
    }]);
    setNewMessage('');
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <Button onClick={() => setTab('wallet')} style={{ background: tab === 'wallet' ? '#00cc66' : 'rgba(255,255,255,0.1)' }}>💰 Mi Billetera</Button>
        {activeFaenaId && (
          <Button onClick={() => setTab('chat')} style={{ background: tab === 'chat' ? '#00cc66' : 'rgba(255,255,255,0.1)' }}>💬 Chat Enmascarado</Button>
        )}
      </div>

      {tab === 'wallet' && (
        <GlassCard style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '15px' }}>Balance Actual</h2>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#00ffcc', marginBottom: '20px' }}>${saldo}</div>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <Button onClick={() => setWalletFilter('dia')} style={{ opacity: walletFilter === 'dia' ? 1 : 0.5 }}>Día</Button>
            <Button onClick={() => setWalletFilter('semana')} style={{ opacity: walletFilter === 'semana' ? 1 : 0.5 }}>Semana</Button>
            <Button onClick={() => setWalletFilter('mes')} style={{ opacity: walletFilter === 'mes' ? 1 : 0.5 }}>Mes</Button>
          </div>

          <h3 style={{ fontSize: '1.2rem', marginBottom: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>Solicitud Financiera</h3>
          <form onSubmit={handleSendRequest} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <select value={solicitudTipo} onChange={e => setSolicitudTipo(e.target.value)} style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px' }}>
              <option value="anticipo" style={{ color: 'black' }}>Anticipo</option>
              <option value="reembolso" style={{ color: 'black' }}>Reembolso de Emergencia</option>
            </select>
            <input type="number" placeholder="Monto ($)" value={solicitudMonto} onChange={e => setSolicitudMonto(e.target.value)} style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px' }} />
            <textarea placeholder="Motivo de la solicitud..." value={solicitudMotivo} onChange={e => setSolicitudMotivo(e.target.value)} style={{ padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px', minHeight: '80px' }}></textarea>
            <Button type="submit" style={{ background: '#00cc66', color: 'white', border: 'none' }}>Enviar Solicitud</Button>
          </form>
        </GlassCard>
      )}

      {tab === 'chat' && activeFaenaId && (
        <GlassCard style={{ padding: '20px', height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '15px', color: '#00ffcc' }}>Chat de Faena (Privado)</h2>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {chatMessages.map(msg => (
              <div key={msg.id} style={{ 
                alignSelf: msg.remitente_tipo === 'chofer' ? 'flex-end' : 'flex-start',
                background: msg.remitente_tipo === 'chofer' ? '#00cc66' : 'rgba(255,255,255,0.1)',
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
            <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Escribe un mensaje..." style={{ flex: 1, padding: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '5px' }} />
            <Button type="submit" style={{ background: '#00cc66', color: 'white', border: 'none' }}>Enviar</Button>
          </form>
        </GlassCard>
      )}
    </div>
  );
}
