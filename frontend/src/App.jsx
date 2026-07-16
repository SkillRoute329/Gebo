import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import ChoferApp from './views/ChoferApp';
import ViajesPanel from './views/ViajesPanel';
import PerfilPanel from './views/PerfilPanel';
import ClienteApp from './views/ClienteApp';
import AdminDashboard from './views/AdminDashboard';
import Login from './views/Login';
import BottomNav from './components/ui/BottomNav';
import 'leaflet/dist/leaflet.css'; // Estilos base obligatorios para que el mapa no se rompa

// Wrapper para proteger rutas
const ProtectedRoute = ({ children, allowedRoles }) => {
  const [session, setSession] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setRole(session?.user?.user_metadata?.role || session?.user?.app_metadata?.role || null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setRole(session?.user?.user_metadata?.role || session?.user?.app_metadata?.role || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{backgroundColor: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p style={{color: 'white'}}>Cargando...</p></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />; // O a una página de no autorizado

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* =========================================
            ECOSISTEMA CHOFER (PWA Móvil)
            ========================================= */}
        <Route path="/chofer/*" element={
          <ProtectedRoute allowedRoles={['chofer']}>
            <div style={{ maxWidth: '450px', margin: '0 auto', height: '100vh', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.8)', backgroundColor: 'var(--bg-slate)' }}>
              <Routes>
                <Route path="/" element={<ChoferApp />} />
                <Route path="/viajes" element={<ViajesPanel />} />
                <Route path="/perfil" element={<PerfilPanel />} />
              </Routes>
              <BottomNav />
            </div>
          </ProtectedRoute>
        } />

        {/* =========================================
            ECOSISTEMA CLIENTE (PWA Móvil - Light Mode)
            ========================================= */}
        <Route path="/cliente" element={
          <ProtectedRoute allowedRoles={['cliente']}>
            <div style={{ maxWidth: '450px', margin: '0 auto', height: '100vh', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.8)', backgroundColor: '#ffffff' }}>
              <ClienteApp />
            </div>
          </ProtectedRoute>
        } />

        {/* =========================================
            TORRE DE CONTROL (Escritorio - Dark Radar)
            ========================================= */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* REDIRECCION POR DEFECTO */}
        <Route path="*" element={<Navigate to="/login" replace />} />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;
