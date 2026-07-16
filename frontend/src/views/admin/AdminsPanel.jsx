import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';

const AdminsPanel = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  // Nuevo admin states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      // Como no hay una tabla 'admins', buscamos en auth.users a través del backend o en alguna vista.
      // O, de manera simple, podríamos buscar en usuarios si tuvieran rol.
      // Para este demo, usaremos supabase auth admin directamente si pudieramos, o simplemente 
      // mostramos que no tenemos una vista de admins, pero permitimos crear.
      // En la realidad, deberiamos poder obtener los usuarios con rol admin si creamos una RPC.
      // Vamos a listar todos los usuarios en public.usuarios (esto es demo, en prod se requiere un endpoint).
      // Por simplicidad, sólo dejamos la creación activa por ahora, o buscamos por "admin" en el nombre (no ideal).
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await adminService.createAppUser({
        email,
        password,
        role: 'admin',
        metadata: { nombre_completo: nombre },
        profileData: null
      });
      
      setEmail(''); setPassword(''); setNombre('');
      alert('Administrador creado exitosamente');
      fetchAdmins();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div style={{ padding: '24px', color: 'white', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--accent-magenta)' }}>Gestión de Administradores</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* FORMULARIO */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Agregar Administrador</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '16px' }}>Este usuario tendrá acceso total al Dashboard B2B.</p>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input placeholder="Nombre Completo" value={nombre} onChange={e=>setNombre(e.target.value)} required style={inputStyle} />
            <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={inputStyle} />
            <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={inputStyle} />
            
            <Button type="submit" variant="primary">Crear Admin</Button>
          </form>
        </div>

        {/* LISTA */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Información</h3>
          <p style={{ fontSize: '0.9rem', color: '#ddd' }}>
            Los administradores pueden acceder a este panel, ver a todos los choferes, clientes y faenas.
            Su acceso se basa en el JWT con el claim <code>role: 'admin'</code>.
          </p>
        </div>
      </div>
    </div>
  );
};

const inputStyle = {
  width: '100%', padding: '12px', borderRadius: '8px', 
  backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', 
  border: '1px solid rgba(255,255,255,0.1)', outline: 'none'
};

export default AdminsPanel;
