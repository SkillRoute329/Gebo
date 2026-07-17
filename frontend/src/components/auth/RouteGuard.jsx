import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const RouteGuard = ({ children, allowedRoles }) => {
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
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />; // Redirigir a login si no tiene el rol

  return children;
};

export default RouteGuard;
