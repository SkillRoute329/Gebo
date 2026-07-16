import React, { useState } from 'react';

const Input = ({ type = 'text', placeholder, value, onChange, style = {}, icon: Icon, required = false }) => {
  const [isFocused, setIsFocused] = useState(false);

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${isFocused ? 'var(--accent-magenta)' : 'rgba(255, 255, 255, 0.1)'}`,
    borderRadius: '12px',
    padding: '12px 16px',
    transition: 'all 0.2s ease',
    width: '100%',
    boxSizing: 'border-box',
    ...style
  };

  const inputStyle = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: 'white',
    fontSize: '1rem',
    fontFamily: 'var(--font-main)',
    outline: 'none',
    width: '100%'
  };

  return (
    <div style={containerStyle}>
      {Icon && (
        <Icon 
          size={20} 
          color={isFocused ? 'var(--accent-magenta)' : 'rgba(255,255,255,0.5)'} 
          style={{ marginRight: '12px', transition: 'color 0.2s ease' }} 
        />
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={inputStyle}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        required={required}
      />
    </div>
  );
};

export default Input;
