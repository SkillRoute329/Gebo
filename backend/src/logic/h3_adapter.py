import h3
from typing import List, Dict, Set

def obtener_hex_resolucion_8(lat: float, lng: float) -> str:
    """
    Convierte coordenadas geográficas GPS en un índice de celda H3 (resolución 8).
    
    La resolución 8 de H3 representa hexágonos con un área aproximada de 0.73 km²
    y un radio de ~700 metros, lo cual es ideal para agrupación logística urbana 
    en áreas metropolitanas como Montevideo.
    
    Args:
        lat (float): Latitud (ej: -34.9011 para Montevideo).
        lng (float): Longitud (ej: -56.1645).
        
    Returns:
        str: Índice hexadecimal de la celda H3.
    """
    # h3.geo_to_h3 ha sido deprecado en h3-py v4 en favor de h3.latlng_to_cell
    # Utilizamos el API moderno de h3-py v4.
    try:
        # API v4
        cell = h3.latlng_to_cell(lat, lng, 8)
        return h3.cell_to_string(cell)
    except AttributeError:
        # Fallback API v3
        return h3.geo_to_h3(lat, lng, 8)


def obtener_hex_vecinos_anillo1(h3_index: str) -> List[str]:
    """
    Retorna la celda H3 central y sus 6 vecinos contiguos inmediatos (k=1).
    
    Esto permite expandir el radio de búsqueda logística a las zonas inmediatamente
    adyacentes sin hacer cálculos computacionales costosos de distancia en la base de datos,
    abarcando un área de operación de aproximadamente 2 km a la redonda.
    
    Args:
        h3_index (str): Índice hexadecimal de la celda H3 central.
        
    Returns:
        List[str]: Lista de 7 índices H3 (el origen + sus 6 vecinos).
    """
    try:
        # API v4
        cell = h3.string_to_cell(h3_index)
        neighbors = h3.grid_disk(cell, 1)
        return [h3.cell_to_string(n) for n in neighbors]
    except AttributeError:
        # Fallback API v3
        neighbors = h3.k_ring(h3_index, 1)
        return list(neighbors)


def identificar_zonas_calientes_escasez(
    faenas_pendientes: List[Dict[str, str]], 
    flota_disponible: List[Dict[str, str]]
) -> List[str]:
    """
    Agrupa la oferta y la demanda logística actual en Montevideo utilizando índices H3,
    devolviendo las zonas críticas (hexágonos) donde existe demanda pero no hay flota 
    disponible (ni en el hexágono exacto ni en su vecindario inmediato).
    
    Args:
        faenas_pendientes (List[Dict[str, str]]): Lista de diccionarios que representan
            las faenas pendientes, ej: [{'origen_h3_res8': '88a9134a47fffff'}, ...]
        flota_disponible (List[Dict[str, str]]): Lista de diccionarios que representan
            a la flota (choferes/vagonetas) libre, ej: [{'h3_res8': '88a9134a47fffff'}, ...]
            
    Returns:
        List[str]: Lista de índices H3 de resolución 8 identificados como zonas rojas (escasez).
    """
    # 1. Mapear toda la cobertura actual de la flota, incluyendo sus anillos contiguos (k=1)
    cobertura_flota: Set[str] = set()
    for vehiculo in flota_disponible:
        hex_actual = vehiculo.get('h3_res8')
        if hex_actual:
            cobertura_flota.update(obtener_hex_vecinos_anillo1(hex_actual))
            
    # 2. Analizar las zonas de demanda (faenas esperando asignación)
    zonas_criticas: Set[str] = set()
    for faena in faenas_pendientes:
        hex_demanda = faena.get('origen_h3_res8')
        if hex_demanda:
            # Si el hexágono de la demanda no está cubierto ni remotamente por el anillo 1 de la flota
            if hex_demanda not in cobertura_flota:
                zonas_criticas.add(hex_demanda)
                
    return list(zonas_criticas)
