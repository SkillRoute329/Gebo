import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import ChoferApp from './views/driver/ChoferApp';
import ViajesPanel from './views/driver/ViajesPanel';
import PerfilPanel from './views/driver/PerfilPanel';
import ClienteApp from './views/client/ClienteApp';
import AdminDashboard from './views/admin/AdminDashboard';
import Login from './views/Login';
import BottomNav from './components/ui/BottomNav';
import 'leaflet/dist/leaflet.css'; // Estilos base obligatorios para que el mapa no se rompa

import RouteGuard from './components/auth/RouteGuard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* =========================================
            ECOSISTEMA CHOFER (PWA Móvil)
            ========================================= */}
        <Route path="/chofer/*" element={
          <RouteGuard allowedRoles={['chofer']}>
            <div style={{ maxWidth: '450px', margin: '0 auto', height: '100vh', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.8)', backgroundColor: 'var(--bg-slate)' }}>
              <Routes>
                <Route path="/" element={<ChoferApp />} />
                <Route path="/viajes" element={<ViajesPanel />} />
                <Route path="/perfil" element={<PerfilPanel />} />
              </Routes>
              <BottomNav />
            </div>
          </RouteGuard>
        } />

        {/* =========================================
            ECOSISTEMA CLIENTE (PWA Móvil - Light Mode)
            ========================================= */}
        <Route path="/cliente" element={
          <RouteGuard allowedRoles={['cliente']}>
            <div style={{ maxWidth: '450px', margin: '0 auto', height: '100vh', position: 'relative', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.8)', backgroundColor: '#ffffff' }}>
              <ClienteApp />
            </div>
          </RouteGuard>
        } />

        {/* =========================================
            TORRE DE CONTROL (Escritorio - Dark Radar)
            ========================================= */}
        <Route path="/admin" element={
          <RouteGuard allowedRoles={['admin']}>
            <AdminDashboard />
          </RouteGuard>
        } />

        {/* REDIRECCION POR DEFECTO */}
        <Route path="*" element={<Navigate to="/login" replace />} />
        
      </Routes>
    </BrowserRouter>
  );
}

export default App;
