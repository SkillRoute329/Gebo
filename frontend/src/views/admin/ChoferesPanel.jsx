import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import Button from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';

const ChoferesPanel = () => {
  const [choferes, setChoferes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Nuevo chofer states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [certificaciones, setCertificaciones] = useState({
    maneja_manual: true,
    maneja_automatico: true,
    maneja_electrico: false,
    maneja_suv: false,
    maneja_camion: false
  });

  // Edit states
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const fetchChoferes = async () => {
    setLoading(true);
    try {
      const data = await adminService.getChoferes();
      setChoferes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChoferes();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await adminService.createAppUser({
        email,
        password,
        role: 'chofer',
        metadata: { nombre_completo: nombre },
        profileData: {
          estado: 'disponible',
          ...certificaciones
        }
      });
      
      setEmail(''); setPassword(''); setNombre('');
      alert('Chofer creado exitosamente');
      fetchChoferes();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleEstadoChange = async (id, nuevoEstado) => {
    await adminService.updateChoferEstado(id, nuevoEstado);
    fetchChoferes();
  };

  const handleEditClick = (c) => {
    setEditingId(c.id);
    setEditData({
      nombre: c.nombre || '',
      maneja_manual: c.maneja_manual,
      maneja_automatico: c.maneja_automatico,
      maneja_electrico: c.maneja_electrico,
      maneja_suv: c.maneja_suv,
      maneja_camion: c.maneja_camion
    });
  };

  const handleEditSave = async () => {
    try {
      await adminService.updateChoferData(editingId, editData);
      setEditingId(null);
      fetchChoferes();
      alert('Chofer actualizado');
    } catch (err) {
      alert('Error actualizando: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar (desactivar) este chofer?')) {
      try {
        await adminService.updateChoferEstado(id, 'inactivo');
        fetchChoferes();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  };

  if (loading) return <div style={{ color: 'white', padding: 20 }}>Cargando choferes...</div>;

  return (
    <div style={{ padding: '24px', color: 'white', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '24px', color: 'var(--accent-magenta)' }}>Gestión de Choferes</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* FORMULARIO */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Agregar Chofer</h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input placeholder="Nombre Completo" value={nombre} onChange={e=>setNombre(e.target.value)} required style={inputStyle} />
            <input placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={inputStyle} />
            <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={inputStyle} />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label><input type="checkbox" checked={certificaciones.maneja_manual} onChange={e=>setCertificaciones({...certificaciones, maneja_manual: e.target.checked})} /> Maneja Manual</label>
              <label><input type="checkbox" checked={certificaciones.maneja_electrico} onChange={e=>setCertificaciones({...certificaciones, maneja_electrico: e.target.checked})} /> Maneja Eléctrico</label>
              <label><input type="checkbox" checked={certificaciones.maneja_suv} onChange={e=>setCertificaciones({...certificaciones, maneja_suv: e.target.checked})} /> Maneja SUV</label>
              <label><input type="checkbox" checked={certificaciones.maneja_camion} onChange={e=>setCertificaciones({...certificaciones, maneja_camion: e.target.checked})} /> Maneja Camión</label>
            </div>

            <Button type="submit" variant="primary">Crear Chofer</Button>
          </form>
        </div>

        {/* LISTA */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>Choferes Activos</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                <th style={{ padding: '12px 8px' }}>Nombre</th>
                <th style={{ padding: '12px 8px' }}>Estado</th>
                <th style={{ padding: '12px 8px' }}>Certificaciones</th>
                <th style={{ padding: '12px 8px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {choferes.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 8px' }}>{c.nombre || 'Sin nombre'} <br/><small style={{color:'#888'}}>{c.email}</small></td>
                  <td style={{ padding: '12px 8px' }}>
                    <select value={c.estado} onChange={e => handleEstadoChange(c.id, e.target.value)} style={{...inputStyle, padding: '4px', width: 'auto'}}>
                      <option value="disponible">Disponible</option>
                      <option value="en_faena">En Faena</option>
                      <option value="en_traslado">En Traslado</option>
                      <option value="descanso">Descanso</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    {c.maneja_manual ? 'Manual ' : ''}
                    {c.maneja_electrico ? '⚡ ' : ''}
                    {c.maneja_suv ? 'SUV ' : ''}
                    {c.maneja_camion ? '🚚' : ''}
                  </td>
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
            <h3>Editar Chofer</h3>
            <input value={editData.nombre} onChange={e=>setEditData({...editData, nombre: e.target.value})} placeholder="Nombre" style={inputStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label><input type="checkbox" checked={editData.maneja_manual} onChange={e=>setEditData({...editData, maneja_manual: e.target.checked})} /> Maneja Manual</label>
              <label><input type="checkbox" checked={editData.maneja_electrico} onChange={e=>setEditData({...editData, maneja_electrico: e.target.checked})} /> Maneja Eléctrico</label>
              <label><input type="checkbox" checked={editData.maneja_suv} onChange={e=>setEditData({...editData, maneja_suv: e.target.checked})} /> Maneja SUV</label>
              <label><input type="checkbox" checked={editData.maneja_camion} onChange={e=>setEditData({...editData, maneja_camion: e.target.checked})} /> Maneja Camión</label>
            </div>
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

export default ChoferesPanel;
