import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from './Button';

const ChatPanel = ({ faenaId, userId, userRole, onClose }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!faenaId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('mensajes_faena')
        .select('*')
        .eq('faena_id', faenaId)
        .order('timestamp', { ascending: true });
      if (data) setMessages(data);
    };

    fetchMessages();

    const channel = supabase
      .channel(`mensajes-${faenaId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_faena', filter: `faena_id=eq.${faenaId}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [faenaId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const { error } = await supabase.from('mensajes_faena').insert({
      faena_id: faenaId,
      emisor_id: userId,
      rol_emisor: userRole,
      contenido: newMessage.trim()
    });

    if (!error) setNewMessage('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--primary-dark)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={18} />
          <h4 style={{ margin: 0 }}>Chat con el {userRole === 'chofer' ? 'Cliente' : 'Chofer'}</h4>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }}>
            <X size={20} />
          </button>
        )}
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f5f5f5' }}>
        {messages.map((msg) => {
          const isMine = msg.emisor_id === userId;
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
              <div style={{ 
                maxWidth: '75%', 
                padding: '10px 14px', 
                borderRadius: '16px', 
                background: isMine ? 'var(--accent-magenta)' : '#fff', 
                color: isMine ? '#fff' : '#333',
                borderBottomRightRadius: isMine ? '4px' : '16px',
                borderBottomLeftRadius: !isMine ? '4px' : '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <p style={{ margin: 0, fontSize: '0.9rem', wordBreak: 'break-word' }}>{msg.contenido}</p>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block', textAlign: 'right', marginTop: '4px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} style={{ display: 'flex', padding: '12px', gap: '8px', background: '#fff', borderTop: '1px solid #eee' }}>
        <input 
          type="text" 
          placeholder="Escribe un mensaje..." 
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          style={{ flex: 1, padding: '10px 16px', borderRadius: '20px', border: '1px solid #ccc', outline: 'none', fontSize: '0.9rem' }}
        />
        <button type="submit" disabled={!newMessage.trim()} style={{ background: newMessage.trim() ? 'var(--accent-magenta)' : '#ccc', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: newMessage.trim() ? 'pointer' : 'default', transition: 'background 0.2s' }}>
          <Send size={18} style={{ marginLeft: '-2px' }} />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
