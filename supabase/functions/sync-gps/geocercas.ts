export const RADIO_TIERRA_METROS = 6371000;
export const UMBRAL_ARRIBO_METROS = 50.0;
export const UMBRAL_SPOOFING_KMH = 150.0;

export interface Coordinate {
  lon: number;
  lat: number;
  ts?: string;
}

export function calcularDistanciaHaversine(coordA: Coordinate, coordB: Coordinate): number {
  const lon1 = coordA.lon;
  const lat1 = coordA.lat;
  const lon2 = coordB.lon;
  const lat2 = coordB.lat;

  const phi1 = lat1 * (Math.PI / 180);
  const phi2 = lat2 * (Math.PI / 180);
  const deltaPhi = (lat2 - lat1) * (Math.PI / 180);
  const deltaLambda = (lon2 - lon1) * (Math.PI / 180);

  const a = Math.sin(deltaPhi / 2.0) ** 2 +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2.0) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return RADIO_TIERRA_METROS * c;
}

export function calcularVelocidadKmh(coordA: Coordinate, coordB: Coordinate): number {
  if (!coordA.ts || !coordB.ts) return 0;
  
  const t1 = new Date(coordA.ts).getTime();
  const t2 = new Date(coordB.ts).getTime();
  const deltaHoras = Math.abs(t2 - t1) / (1000 * 60 * 60);
  
  if (deltaHoras === 0) return 0;
  
  const distanciaKm = calcularDistanciaHaversine(coordA, coordB) / 1000.0;
  return distanciaKm / deltaHoras;
}

export function verificarArribo(
  coordenadasRecientesChofer: Coordinate[],
  coordenadaDestino: Coordinate
): boolean {
  if (coordenadasRecientesChofer.length < 2) {
    return false;
  }

  let lecturasValidas = 0;
  const ultimasDos = coordenadasRecientesChofer.slice(-2);

  for (const coord of ultimasDos) {
    const distancia = calcularDistanciaHaversine(coord, coordenadaDestino);
    if (distancia <= UMBRAL_ARRIBO_METROS) {
      lecturasValidas += 1;
    }
  }

  return lecturasValidas === 2;
}
