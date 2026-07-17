import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import GlassCard from '../../components/ui/GlassCard';
import Button from '../../components/ui/Button';

export const CompanyDashboard = ({ empresaId }) => {
  const [centros, setCentros] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  useEffect(() => {
    fetchCentros();
    fetchEmpleados();
  }, [empresaId]);

  const fetchCentros = async () => {
    const { data } = await supabase.from('centros_de_costo').select('*').eq('empresa_id', empresaId);
    if (data) setCentros(data);
  };

  const fetchEmpleados = async () => {
    const { data } = await supabase.from('usuarios').select('*, centros_de_costo(nombre_departamento)').eq('cliente_id', empresaId);
    if (data) setEmpleados(data);
  };

  const toggleCentroStatus = async (id, currentStatus) => {
    await supabase.from('centros_de_costo').update({ activo: !currentStatus }).eq('id', id);
    fetchCentros();
  };

  const updatePresupuesto = async (id, nuevoPresupuesto) => {
    const value = parseFloat(nuevoPresupuesto);
    if (isNaN(value) || value < 0) return;
    await supabase.from('centros_de_costo').update({ presupuesto_mensual: value }).eq('id', id);
    fetchCentros();
  };

  const totalPresupuesto = centros.reduce((acc, c) => acc + Number(c.presupuesto_mensual), 0);
  const totalGasto = centros.reduce((acc, c) => acc + Number(c.gasto_acumulado), 0);

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', fontWeight: 'bold' }}>Portal Corporativo - Centro de Costos</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        <GlassCard style={{ padding: '20px' }}>
          <h3 style={{ color: '#aaa', fontSize: '1.1rem' }}>Presupuesto Total Asignado</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#3399ff' }}>${totalPresupuesto.toFixed(2)}</div>
        </GlassCard>
        <GlassCard style={{ padding: '20px' }}>
          <h3 style={{ color: '#aaa', fontSize: '1.1rem' }}>Gasto Acumulado Global</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: totalGasto > totalPresupuesto ? '#ff4444' : '#00cc66' }}>
            ${totalGasto.toFixed(2)}
          </div>
        </GlassCard>
      </div>

      <GlassCard style={{ padding: '20px', marginBottom: '30px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '15px', color: '#00ffcc' }}>Presupuestos por Departamento</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
              <th style={{ padding: '10px' }}>Departamento</th>
              <th style={{ padding: '10px' }}>Estado</th>
              <th style={{ padding: '10px' }}>Presupuesto Mensual</th>
              <th style={{ padding: '10px' }}>Consumo Real</th>
              <th style={{ padding: '10px' }}>Disponibilidad</th>
            </tr>
          </thead>
          <tbody>
            {centros.map(c => {
              const disp = c.presupuesto_mensual - c.gasto_acumulado;
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '10px' }}>{c.nombre_departamento}</td>
                  <td style={{ padding: '10px' }}>
                    <Button onClick={() => toggleCentroStatus(c.id, c.activo)} style={{ background: c.activo ? '#00cc66' : '#cc0000', color: 'white', padding: '5px 10px', fontSize: '0.8rem', border: 'none' }}>
                      {c.activo ? 'ACTIVO' : 'PAUSADO'}
                    </Button>
                  </td>
                  <td style={{ padding: '10px' }}>
                    <input type="number" defaultValue={c.presupuesto_mensual} onBlur={(e) => updatePresupuesto(c.id, e.target.value)} style={{ padding: '5px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px', width: '100px' }} />
                  </td>
                  <td style={{ padding: '10px', color: '#ff4444' }}>${Number(c.gasto_acumulado).toFixed(2)}</td>
                  <td style={{ padding: '10px', color: disp < 0 ? '#ff4444' : '#00cc66', fontWeight: 'bold' }}>${disp.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </GlassCard>

      <GlassCard style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.3rem', marginBottom: '15px', color: '#3399ff' }}>Nómina de Empleados</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
              <th style={{ padding: '10px' }}>Nombre</th>
              <th style={{ padding: '10px' }}>Email</th>
              <th style={{ padding: '10px' }}>Departamento (C. Costo)</th>
            </tr>
          </thead>
          <tbody>
            {empleados.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <td style={{ padding: '10px' }}>{e.nombre_completo}</td>
                <td style={{ padding: '10px' }}>{e.email}</td>
                <td style={{ padding: '10px', color: '#00ffcc' }}>{e.centros_de_costo?.nombre_departamento || 'Sin Asignar'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
