import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Role-based routing
    if (data.user) {
      // Check user metadata and app metadata for role
      const role = data.user.user_metadata?.role || data.user.app_metadata?.role;
      
      if (role === 'admin') {
        navigate('/admin');
      } else if (role === 'chofer') {
        navigate('/chofer');
      } else {
        navigate('/cliente');
      }
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: 'var(--bg-dark)',
      color: 'white',
      fontFamily: 'var(--font-main)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: '24px',
        padding: '32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, var(--accent-magenta) 0%, var(--accent-pink) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px'
          }}>
            Gebo
          </h1>
          <p style={{ color: '#9ba1b0', fontSize: '0.9rem' }}>Ingresa a tu cuenta</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input 
            type="email" 
            placeholder="Correo electrónico" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input 
            type="password" 
            placeholder="Contraseña" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {error && <p style={{ color: '#ff4444', fontSize: '0.85rem', textAlign: 'center' }}>{error}</p>}
          
          <Button type="submit" variant="primary" style={{ marginTop: '8px' }} disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Entrar'}
          </Button>
        </form>
        
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p style={{ color: '#9ba1b0', fontSize: '0.8rem' }}>
            Credenciales de demo:<br/>
            cliente1@gebo.com | chofer1@gebo.com | admin@gebo.com<br/>
            Password: gebo123
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
