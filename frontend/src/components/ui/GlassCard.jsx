import React from 'react';

const GlassCard = ({ children, style = {} }) => {
  return (
    <div 
      className="glass-effect"
      style={{
        borderRadius: '16px',
        padding: '20px',
        ...style
      }}
    >
      {children}
    </div>
  );
};

export default GlassCard;
