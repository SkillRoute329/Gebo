import React from 'react';
import { NavLink } from 'react-router-dom';
import { Map, List, User } from 'lucide-react';

const BottomNav = () => {
  const linkStyle = ({ isActive }) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    textDecoration: 'none',
    color: isActive ? 'var(--accent-magenta)' : 'var(--text-secondary)',
    transition: 'all 0.2s',
    flex: 1,
    padding: '8px 0',
  });

  return (
    <div className="glass-effect" style={{
      position: 'absolute', 
      bottom: 0, 
      left: 0, 
      width: '100%', 
      zIndex: 50,
      display: 'flex', 
      justifyContent: 'space-around', 
      padding: '12px 0 24px 0', // Padding bottom extra para el "Home Indicator" de los iPhones
      borderTop: '1px solid rgba(255,255,255,0.05)',
      borderBottomLeftRadius: '16px',
      borderBottomRightRadius: '16px'
    }}>
      <NavLink to="/chofer" style={linkStyle} end>
        <Map size={24} />
        <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>Mapa</span>
      </NavLink>
      
      <NavLink to="/chofer/viajes" style={linkStyle}>
        <List size={24} />
        <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>Viajes</span>
      </NavLink>
      
      <NavLink to="/chofer/perfil" style={linkStyle}>
        <User size={24} />
        <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>Perfil</span>
      </NavLink>
    </div>
  );
};

export default BottomNav;
