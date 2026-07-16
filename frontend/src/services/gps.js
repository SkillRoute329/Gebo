/**
 * Motor Inteligente de GPS (Ahorro de Batería Extremo)
 * Solo guarda un punto si el chofer se movió físicamente > 20 metros.
 */
import { savePositionToQueue } from './db';

const THRESHOLD_METERS = 20;
let lastSavedPosition = null;

// Fórmula del semiverseno (Haversine) en JavaScript
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distancia en metros
};

export const startSmartTracking = (choferId) => {
  if (!navigator.geolocation) {
    console.error("Geolocalización no soportada por el navegador");
    return;
  }

  // watchPosition es asíncrono y se activa por hardware del celular
  navigator.geolocation.watchPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const timestamp = position.timestamp;

      if (!lastSavedPosition) {
        // Primer ping siempre se guarda
        await recordPosition(latitude, longitude, timestamp, choferId);
        return;
      }

      const distance = calculateDistance(
        lastSavedPosition.lat, lastSavedPosition.lng,
        latitude, longitude
      );

      // Si se movió más de 20 metros reales, lo registramos.
      // Si está atascado en un semáforo (distancia = 0), el teléfono no hace nada y ahorra batería.
      if (distance >= THRESHOLD_METERS) {
        await recordPosition(latitude, longitude, timestamp, choferId);
      }
    },
    (error) => {
      console.error("Error GPS:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 5000
    }
  );
};

const recordPosition = async (lat, lng, timestamp, choferId) => {
  const positionData = { lat, lng, timestamp, choferId };
  
  // Siempre lo metemos a la cola local ultra-rápida (IndexedDB)
  await savePositionToQueue(positionData);
  
  // Actualizamos el historial en memoria RAM
  lastSavedPosition = positionData;

  // Disparamos un intento de sincronización en red
  window.dispatchEvent(new Event('try-sync-gps'));
};
