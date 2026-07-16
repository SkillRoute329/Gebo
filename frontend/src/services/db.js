/**
 * Motor de Persistencia Offline Cifrada (IndexedDB + Web Crypto API)
 * Guarda las coordenadas GPS protegidas contra robo de dispositivo (Data Leakage).
 */

const DB_NAME = 'GeboOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'gps_queue';

// ========================================================
// SISTEMA DE CIFRADO LOCAL EN MEMORIA VOLÁTIL (AES-GCM)
// ========================================================
let volatileSessionKey = null;

// Generar una clave secreta que solo vive en la RAM mientras la app está abierta.
// Si cierran la app, reiniciar el teléfono o extraer el disco, los datos cifrados son inútiles.
const getOrGenerateKey = async () => {
  if (!volatileSessionKey) {
    volatileSessionKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable (muy importante para seguridad)
      ["encrypt", "decrypt"]
    );
  }
  return volatileSessionKey;
};

const encryptData = async (dataObj) => {
  const key = await getOrGenerateKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(dataObj));
  
  const cipherText = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encoded
  );
  
  return {
    iv: Array.from(iv), // Guardamos el IV para poder descifrar
    cipherText: Array.from(new Uint8Array(cipherText))
  };
};

const decryptData = async (encryptedObj) => {
  const key = await getOrGenerateKey();
  const iv = new Uint8Array(encryptedObj.iv);
  const cipherText = new Uint8Array(encryptedObj.cipherText);
  
  const decryptedText = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    cipherText
  );
  
  const decoded = new TextDecoder().decode(decryptedText);
  return JSON.parse(decoded);
};
// ========================================================

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Error abriendo IndexedDB:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Crear el almacén con autoIncrement para mantener el orden cronológico estricto
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
};

export const savePositionToQueue = async (positionData) => {
  const db = await initDB();
  // BLINDAJE: Cifrar la coordenada antes de mandarla al disco
  const encryptedPayload = await encryptData(positionData);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Guardamos la versión cifrada
    const request = store.add(encryptedPayload);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const getAndClearQueue = async () => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = async () => {
      const records = getAllRequest.result;
      if (records.length > 0) {
        store.clear(); // Vacía la cola
      }

      // BLINDAJE: Descifrar los datos de vuelta a JSON en memoria antes de enviarlos
      const decryptedRecords = [];
      for (const record of records) {
        try {
          // El record tiene la estructura { id, iv, cipherText } debido a autoIncrement
          const decrypted = await decryptData(record);
          decryptedRecords.push(decrypted);
        } catch (e) {
          console.error("Fallo al descifrar el registro (¿Clave expirada?). Ignorando.", e);
        }
      }

      resolve(decryptedRecords);
    };

    getAllRequest.onerror = (e) => reject(e.target.error);
  });
};
