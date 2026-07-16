import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import Button from '../../components/ui/Button';

const ClientesPanel = () => {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Nuevo cliente states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('particular');
  const [telefono, setTelefono] = useState('');
  const [razonSocial, setRazonSocial] = useState('');

  // Edit states
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const fetchClientes = async () => {
    setLoading(true);
    try {
      const data = await adminService.getClientes();
      setClientes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await adminService.createAppUser({
        email,
        password,
        role: 'cliente',
        metadata: { nombre_completo: nombre },
        profileData: {
          tipo,
          telefono,
          razon_social: tipo === 'empresa' ? razonSocial : null
        }
      });
      
      setEmail(''); setPassword(''); setNombre(''); setTelefono(''); setRazonSocial('');
      alert('Cliente creado exitosamente');
      fetchClientes();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEditClick = (c) => {
    setEditingId(c.id);
    setEditData({
      nombre: c.nombre || '',
      tipo: c.tipo || 'particular',
      telefono: c.telefono || '',
      razon_social: c.razon_social || ''
    });
  };

  const handleEditSave = async () => {
    try {
      const payload = { ...editData };
      if (payload.tipo === 'particular') payload.razon_social = null;
      await adminService.updateClienteData(editingId, payload);
      setEditingId(null);
      fetchClientes();
      alert('Cliente actualizado');
    } catch (err) {
      alert('Error actualizando: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas desactivar este cliente?')) {
      try {
        await adminService.updateClienteEstado(id, false);
        fetchClientes();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  };

  if (loading) return <div style={{ color: 'white', padding: 20 }}>Cargando clientes...</div>;

  return (
    <div style={{ padding: '24px', color: 'white', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--accent-magenta)' }}>Gestión de Clientes</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* FORMULARIO */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Agregar Cliente</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input placeholder="Nombre Completo o de Contacto" value={nombre} onChange={e=>setNombre(e.target.value)} required style={inputStyle} />
            <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={inputStyle} />
            <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={inputStyle} />
            <input placeholder="Teléfono" value={telefono} onChange={e=>setTelefono(e.target.value)} required style={inputStyle} />
            
            <select value={tipo} onChange={e=>setTipo(e.target.value)} style={inputStyle}>
              <option value="particular">Particular</option>
              <option value="empresa">Empresa</option>
            </select>

            {tipo === 'empresa' && (
              <input placeholder="Razón Social" value={razonSocial} onChange={e=>setRazonSocial(e.target.value)} required style={inputStyle} />
            )}

            <Button type="submit" variant="primary">Crear Cliente</Button>
          </form>
        </div>

        {/* LISTA */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Clientes Registrados</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '12px 8px' }}>Nombre</th>
                <th style={{ padding: '12px 8px' }}>Tipo</th>
                <th style={{ padding: '12px 8px' }}>Teléfono</th>
                <th style={{ padding: '12px 8px' }}>Empresa</th>
                <th style={{ padding: '12px 8px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 8px' }}>{c.nombre || 'Sin nombre'} <br/><small style={{color:'#888'}}>{c.email}</small></td>
                  <td style={{ padding: '12px 8px' }}>{c.tipo.toUpperCase()}</td>
                  <td style={{ padding: '12px 8px' }}>{c.telefono}</td>
                  <td style={{ padding: '12px 8px' }}>{c.razon_social || '-'}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <button onClick={() => handleEditClick(c)} style={{ background: 'transparent', border: '1px solid white', color: 'white', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', marginRight: '8px' }}>Editar</button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }}>Desactivar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#222', padding: '24px', borderRadius: '16px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3>Editar Cliente</h3>
            <input value={editData.nombre} onChange={e=>setEditData({...editData, nombre: e.target.value})} placeholder="Nombre Completo" style={inputStyle} />
            <input value={editData.telefono} onChange={e=>setEditData({...editData, telefono: e.target.value})} placeholder="Teléfono" style={inputStyle} />
            
            <select value={editData.tipo} onChange={e=>setEditData({...editData, tipo: e.target.value})} style={inputStyle}>
              <option value="particular">Particular</option>
              <option value="empresa">Empresa</option>
            </select>

            {editData.tipo === 'empresa' && (
              <input value={editData.razon_social} onChange={e=>setEditData({...editData, razon_social: e.target.value})} placeholder="Razón Social" style={inputStyle} />
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button onClick={() => setEditingId(null)} variant="secondary">Cancelar</Button>
              <Button onClick={handleEditSave} variant="primary">Guardar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const inputStyle = {
  width: '100%', padding: '12px', borderRadius: '8px', 
  backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', 
  border: '1px solid rgba(255,255,255,0.1)', outline: 'none'
};

export default ClientesPanel;
