import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';
import { User, ShieldAlert, LogOut, DollarSign } from 'lucide-react';

const PerfilPanel = () => {
  const navigate = useNavigate();

  const [ganancias, setGanancias] = useState(0);
  const [limiteFatiga, setLimiteFatiga] = useState(480); // 8 horas por defecto en min
  const [minutosConducidos, setMinutosConducidos] = useState(360); // 6 horas
  const [fatigaPorcentaje, setFatigaPorcentaje] = useState(0);

  useEffect(() => {
    // Demo fetch
    setGanancias(3450);
    
    const fetchConfig = async () => {
      const { data } = await supabase.from('configuracion_negocio').select('clave, valor').eq('clave', 'limite_conduccion_minutos').single();
      const limite = data ? parseInt(data.valor, 10) : 480;
      setLimiteFatiga(limite);
      setFatigaPorcentaje(Math.min((minutosConducidos / limite) * 100, 100));
    };
    fetchConfig();
  }, [minutosConducidos]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{ height: '100%', width: '100%', padding: '20px', paddingTop: '80px', overflowY: 'auto' }}>
      
      {/* HEADER PERFIL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
        <div style={{ 
          width: '70px', height: '70px', borderRadius: '50%', 
          background: 'linear-gradient(135deg, var(--accent-magenta), var(--accent-pink))',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <User size={36} color="white" />
        </div>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Demo Chofer</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Peugeot 301 - SBA 1234</p>
        </div>
      </div>

      {/* METRICAS Y GANANCIAS */}
      <GlassCard style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(0, 255, 204, 0.1)', padding: '10px', borderRadius: '12px' }}>
            <DollarSign size={24} color="#00ffcc" />
          </div>
          <div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Generado Hoy (Viajes Finalizados)</p>
            <h2 style={{ color: '#00ffcc' }}>$ {ganancias} UYU</h2>
          </div>
        </div>
      </GlassCard>

      {/* AUDITORIA DE FATIGA */}
      <GlassCard style={{ marginBottom: '32px', borderLeft: '4px solid var(--accent-magenta)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="var(--accent-magenta)" /> Control de Fatiga
          </h3>
          <span style={{ fontWeight: '600' }}>{Math.floor(minutosConducidos/60)}h / {Math.floor(limiteFatiga/60)}h</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${fatigaPorcentaje}%`, height: '100%', background: fatigaPorcentaje > 90 ? '#ff4444' : 'linear-gradient(90deg, #00ffcc, var(--accent-magenta))', transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '12px' }}>
          Auditoría en tiempo real. Te quedan {Math.floor((limiteFatiga - minutosConducidos)/60)} horas antes del bloqueo por seguridad.
        </p>
      </GlassCard>

      {/* CERRAR SESION */}
      <Button variant="danger" style={{ marginBottom: '100px' }} onClick={handleLogout}>
        <LogOut size={20} />
        Cerrar Sesión Segura
      </Button>

    </div>
  );
};

export default PerfilPanel;
