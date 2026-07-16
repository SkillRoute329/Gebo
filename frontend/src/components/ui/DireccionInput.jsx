import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin } from 'lucide-react';

const DireccionInput = ({ placeholder, onAddressSelect, defaultValue = '' }) => {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(defaultValue);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddress = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 3) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchTerm)}&countrycodes=UY`);
      const data = await res.json();
      setResults(data || []);
      setShowDropdown(true);
    } catch (err) {
      console.error("Error searching address:", err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query !== defaultValue && query !== selectedAddress) {
        searchAddress(query);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [query, selectedAddress]);

  const handleSelect = (item) => {
    setQuery(item.display_name);
    setSelectedAddress(item.display_name);
    setShowDropdown(false);
    if (onAddressSelect) {
      onAddressSelect({
        address: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
      });
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f3f5', borderRadius: '12px', padding: '12px 16px' }}>
        <Search size={20} color="#9ba1b0" style={{ marginRight: '12px' }} />
        <input 
          type="text" 
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if(results.length > 0) setShowDropdown(true); }}
          style={{ width: '100%', border: 'none', background: 'transparent', outline: 'none', fontSize: '1rem', color: '#1a1d24' }}
        />
        {isSearching && <div style={{ width: '16px', height: '16px', border: '2px solid #9ba1b0', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
      </div>

      {showDropdown && results.length > 0 && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, width: '100%', 
          backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', 
          marginTop: '8px', zIndex: 1000, maxHeight: '200px', overflowY: 'auto'
        }}>
          {results.map((item, idx) => (
            <div 
              key={idx}
              onClick={() => handleSelect(item)}
              style={{ 
                padding: '12px 16px', borderBottom: idx < results.length - 1 ? '1px solid #f1f3f5' : 'none',
                display: 'flex', alignItems: 'flex-start', cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
            >
              <MapPin size={16} color="var(--accent-magenta)" style={{ marginRight: '8px', marginTop: '4px', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#1a1d24' }}>{item.display_name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DireccionInput;
