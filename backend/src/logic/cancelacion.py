from decimal import Decimal
from typing import Dict
from datetime import datetime

def procesar_cancelacion_cliente(viaje: Dict, tiempo_actual: datetime, config: Dict) -> Dict:
    """
    Simula la lógica de cancelación del cliente.
    Retorna un diccionario con las modificaciones al viaje.
    """
    estado = viaje.get('estado')
    asignado_en = viaje.get('asignado_en')

    if estado in ('en_curso', 'finalizado', 'cancelado_cliente', 'cancelado_chofer'):
        raise ValueError(f"No se puede cancelar en el estado actual ({estado})")

    res = {
        'estado': 'cancelado_cliente',
        'penalizacion_cancelacion': Decimal('0.00')
    }

    ventana = config.get('ventana_gracia_cliente_mins', 2)
    multa = config.get('penalizacion_cancelacion_tardia_uyu', Decimal('30.00'))

    if estado in ('asignado', 'en_camino', 'en_punto'):
        if asignado_en and (tiempo_actual - asignado_en).total_seconds() > ventana * 60:
            res['penalizacion_cancelacion'] = Decimal(str(multa))

    return res

def procesar_cancelacion_chofer(viaje: Dict, tiempo_actual: datetime, config: Dict) -> Dict:
    """
    Simula la lógica de cancelación del chofer.
    Retorna información sobre el rechazo y el nuevo estado del viaje.
    """
    estado = viaje.get('estado')
    asignado_en = viaje.get('asignado_en')
    chofer_id = viaje.get('chofer_asignado_id') # simplificado para el mock

    if estado not in ('asignado', 'en_camino', 'en_punto'):
        raise ValueError(f"Chofer no puede cancelar en el estado actual ({estado})")

    penalizado = False
    ventana = config.get('ventana_gracia_chofer_mins', 1)
    if asignado_en and (tiempo_actual - asignado_en).total_seconds() > ventana * 60:
        penalizado = True

    return {
        'oferta_rechazada': {
            'chofer_id': chofer_id,
            'penalizado_por_demora': penalizado
        },
        'viaje_actualizado': {
            'estado': 'ofrecido',
            'vehiculo_id': None,
            'chofer_ofrecido_id': None
        }
    }
