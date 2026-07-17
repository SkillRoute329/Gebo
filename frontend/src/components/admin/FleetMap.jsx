import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon } from 'react-leaflet';
import { parseEWKB } from '../../lib/utils';

// Utilidad nativa ligera para calcular los bordes de un hexágono H3 (res 8 ~700m)
const getHexagonPolygon = (lat, lng, radiusMeters = 700) => {
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30; // Rotación para hexágono con punta arriba
    const angle_rad = Math.PI / 180 * angle_deg;
    const dLat = (radiusMeters * Math.sin(angle_rad)) / 111320;
    const dLng = (radiusMeters * Math.cos(angle_rad)) / (111320 * Math.cos(lat * (Math.PI / 180)));
    points.push([lat + dLat, lng + dLng]);
  }
  return points;
};

// Aproximación del vecindario k=1 de H3 (aprox 1500m a la redonda)
const haversineDist = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const FleetMap = ({ activeTab, shuttleDriversPos, faenas }) => {
  return (
    <div style={{ 
      flex: activeTab === 'radar' ? 1 : 'none', 
      position: activeTab === 'radar' ? 'relative' : 'absolute',
      width: activeTab === 'radar' ? 'auto' : '100%',
      height: '100%',
      opacity: activeTab === 'radar' ? 1 : 0,
      pointerEvents: activeTab === 'radar' ? 'auto' : 'none',
      zIndex: activeTab === 'radar' ? 0 : -1
    }}>
      <MapContainer center={[-34.9011, -56.1645]} zoom={13} style={{ width: '100%', height: '100%', backgroundColor: '#111318', zIndex: 0 }}>
        <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        
        {/* Posiciones de Choferes Activos */}
        {Object.entries(shuttleDriversPos).map(([id, pos]) => {
          if (pos.estado === 'en_faena' || pos.estado === 'en_traslado') {
            return (
              <Marker key={id} position={[pos.lat, pos.lng]}>
                <Popup>{pos.nombre || id.substring(0, 8)} - {pos.estado}</Popup>
              </Marker>
            );
          }
          if (activeTab === 'radar') {
             return (
              <Marker key={id} position={[pos.lat, pos.lng]}>
                <Popup>{pos.nombre || id.substring(0, 8)} - {pos.estado}</Popup>
              </Marker>
            );
          }
          return null;
        })}

        {/* Faenas (Origen y Destino) */}
        {faenas.filter(f => !['finalizada', 'cancelada_cliente', 'cancelada_gebo'].includes(f.estado)).map(f => {
          let ocoords = null, dcoords = null;
          if (typeof f.origen === 'string') ocoords = parseEWKB(f.origen);
          else if (f.origen?.type === 'Point') ocoords = [f.origen.coordinates[1], f.origen.coordinates[0]];
          
          if (typeof f.destino === 'string') dcoords = parseEWKB(f.destino);
          else if (f.destino?.type === 'Point') dcoords = [f.destino.coordinates[1], f.destino.coordinates[0]];

          const olat = ocoords?.[0], olng = ocoords?.[1];
          const dlat = dcoords?.[0], dlng = dcoords?.[1];

          if (olat && dlat) {
            return (
              <React.Fragment key={`faena-${f.id}`}>
                <Marker position={[olat, olng]}><Popup>Origen Faena {f.id.substring(0,5)}</Popup></Marker>
                <Marker position={[dlat, dlng]}><Popup>Destino Faena {f.id.substring(0,5)}</Popup></Marker>
                <Polyline positions={[[olat, olng], [dlat, dlng]]} color="#ea6093" dashArray="5, 10" />
              </React.Fragment>
            );
          }
          return null;
        })}

        {/* Capa Dinámica de Hexágonos de Escasez H3 */}
        {faenas.filter(f => ['programada', 'ofrecida'].includes(f.estado)).map(f => {
          let ocoords = null;
          if (typeof f.origen === 'string') ocoords = parseEWKB(f.origen);
          else if (f.origen?.type === 'Point') ocoords = [f.origen.coordinates[1], f.origen.coordinates[0]];
          
          if (ocoords) {
            const [olat, olng] = ocoords;
            let isHotZone = true;
            Object.values(shuttleDriversPos).forEach(pos => {
              if (pos.estado === 'disponible') {
                const dist = haversineDist(olat, olng, pos.lat, pos.lng);
                if (dist <= 1500) {
                  isHotZone = false;
                }
              }
            });

            if (isHotZone) {
              const hexPolygon = getHexagonPolygon(olat, olng, 700);
              return (
                <Polygon 
                  key={`h3-escasez-${f.id}`}
                  positions={hexPolygon} 
                  pathOptions={{ 
                    fillColor: '#ff4444', 
                    fillOpacity: 0.35, 
                    color: '#ff4444', 
                    weight: 1, 
                    dashArray: '3, 6' 
                  }}
                >
                  <Popup>
                    Zona de Escasez<br/>
                    H3: <strong>{f.origen_h3_res8 || 'Autocalculando...'}</strong><br/>
                    Sin flota disponible en anillo k=1
                  </Popup>
                </Polygon>
              );
            }
          }
          return null;
        })}
      </MapContainer>
      <div style={{ position: 'absolute', top: '24px', right: '24px', zIndex: 1000 }}>
        <div style={{ backgroundColor: 'rgba(26, 29, 36, 0.9)', backdropFilter: 'blur(10px)', padding: '12px 20px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ffcc', boxShadow: '0 0 10px #00ffcc' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>WSS Conectado</span>
        </div>
      </div>
    </div>
  );
};

export default FleetMap;
