// Utils for Gebo

/**
 * Convierte un string EWKB (Extended Well-Known Binary) retornado por Supabase Realtime a [lat, lng]
 * Asume Point(x y) con SRID 4326
 */
export function parseEWKB(hexStr) {
  if (!hexStr || typeof hexStr !== 'string') return null;
  
  // Remove 0x prefix if present
  if (hexStr.startsWith('0x')) hexStr = hexStr.slice(2);
  
  // Minimal manual parsing for PostGIS Point EWKB
  // 01 01000020 E6100000 (21 bytes hex -> 42 chars) 
  // Then 8 bytes X, 8 bytes Y -> 16 chars each
  try {
    // We only care about the last 32 hex characters (16 bytes = 2 doubles)
    const xHex = hexStr.slice(-32, -16);
    const yHex = hexStr.slice(-16);
    
    // Parse double precision (64-bit float) little endian
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    
    // Write bytes
    for (let i = 0; i < 8; i++) {
      view.setUint8(i, parseInt(xHex.substr(i*2, 2), 16));
      view.setUint8(i+8, parseInt(yHex.substr(i*2, 2), 16));
    }
    
    const lng = view.getFloat64(0, true); // true for little endian
    const lat = view.getFloat64(8, true);
    
    return [lat, lng];
  } catch (err) {
    console.error("Error parsing EWKB:", err);
    return null;
  }
}

/**
 * Calcula la distancia en kilómetros entre dos puntos [lat1, lng1] y [lat2, lng2] usando la fórmula de Haversine.
 */
export function haversineDistance(coords1, coords2) {
  const R = 6371; // Radio de la Tierra en km
  const [lat1, lon1] = coords1;
  const [lat2, lon2] = coords2;
  
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c; // Distancia en km
}

/**
 * Calcula el tiempo estimado de llegada (ETA) en minutos
 * basado en la distancia y una velocidad promedio en zona urbana.
 * @param {number} distanceKm Distancia en km
 * @param {number} speedKmh Velocidad promedio en km/h (default 25 km/h)
 * @returns {number} ETA en minutos
 */
export function calculateETA(distanceKm, speedKmh = 25) {
  if (!distanceKm || distanceKm <= 0) return 1;
  
  const timeHours = distanceKm / speedKmh;
  const timeMinutes = Math.ceil(timeHours * 60);
  
  return timeMinutes; // minutes
}
