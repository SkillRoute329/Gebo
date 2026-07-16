import React from 'react';

const Button = ({ children, onClick, variant = 'primary', style = {} }) => {
  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '14px 24px',
    borderRadius: '12px',
    border: 'none',
    fontSize: '1.1rem',
    fontWeight: '600',
    fontFamily: 'var(--font-main)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    width: '100%',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const variants = {
    primary: {
      background: 'linear-gradient(135deg, var(--accent-magenta) 0%, var(--accent-pink) 100%)',
      color: '#fff',
      boxShadow: '0 4px 15px var(--accent-magenta-glow)',
    },
    secondary: {
      background: 'var(--bg-slate-light)',
      color: 'var(--text-primary)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    danger: {
      background: 'transparent',
      color: '#ff4444',
      border: '1px solid #ff4444',
    }
  };

  return (
    <button 
      onClick={onClick}
      style={{ ...baseStyle, ...variants[variant], ...style }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
      onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      {children}
    </button>
  );
};

export default Button;
