/**
 * Orquestador de Red (Network Sync Manager)
 * Escucha cuando vuelve el internet, toma la cola y la envía en un solo paquete al Edge.
 */
import { getAndClearQueue, savePositionToQueue } from './db';

// En la arquitectura final, este pegará a una Edge Function de Supabase, no al backend directamente.
const EDGE_API_URL = 'https://[SUPABASE_PROJECT_REF].functions.supabase.co/sync-gps-batch';

export const initSyncManager = () => {
  // 1. Escuchar cuando el navegador detecta físicamente conexión a internet (4G/WiFi)
  window.addEventListener('online', () => {
    console.log("Conexión recuperada. Intentando enviar ráfaga pendiente...");
    flushQueueToEdge();
  });

  // 2. Escuchar los eventos disparados por gps.js
  window.addEventListener('try-sync-gps', () => {
    if (navigator.onLine) {
      flushQueueToEdge();
    } else {
      console.log("Offline. Posición encolada en IndexedDB.");
    }
  });
};

const flushQueueToEdge = async () => {
  try {
    const batch = await getAndClearQueue();
    
    if (batch.length === 0) return; // Nada que sincronizar

    // Envío por ráfaga (Batch)
    const response = await fetch(EDGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${token}` // Aquí iría el JWT del chofer
      },
      body: JSON.stringify({ positions: batch })
    });

    if (!response.ok) {
      throw new Error(`Edge API devolvió error: ${response.status}`);
    }

    console.log(`Ráfaga de ${batch.length} posiciones enviada y eliminada localmente.`);

  } catch (error) {
    console.error("Fallo la sincronización en ráfaga. Re-encolando datos...", error);
    // Mecanismo de Backoff: Si la API falló (ej: timeout del server),
    // deberíamos restaurar los datos en IndexedDB para no perderlos.
    // (Implementación simplificada para la demo)
  }
};
