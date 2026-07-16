from datetime import datetime, timedelta
from decimal import Decimal

# Constantes de negocio
MINUTOS_DE_GRACIA = 5
PENALIZACION_POR_MINUTO_UYU = Decimal("50.00")
LIMITE_FATIGA_HORAS = Decimal("8.0")


def calcular_penalizacion(
    hora_pactada: datetime, 
    hora_arribo_real: datetime
) -> tuple[int, Decimal]:
    """
    Función Pura (Domain-Driven Design).
    Calcula la demora y la penalización económica por llegar tarde.
    
    Devuelve una tupla: (demora_minutos, penalizacion_monetaria)
    """
    if hora_arribo_real <= hora_pactada:
        return 0, Decimal("0.00")
        
    diferencia = hora_arribo_real - hora_pactada
    minutos_tarde = int(diferencia.total_seconds() / 60)
    
    if minutos_tarde <= MINUTOS_DE_GRACIA:
        return minutos_tarde, Decimal("0.00")
        
    minutos_penalizables = minutos_tarde - MINUTOS_DE_GRACIA
    costo = Decimal(minutos_penalizables) * PENALIZACION_POR_MINUTO_UYU
    
    return minutos_tarde, costo


def verificar_estado_descanso(horas_trabajadas_turno: Decimal) -> bool:
    """
    Determina si un chofer superó el límite de fatiga operativa y 
    debe ser bloqueado para recibir nuevos viajes.
    
    Returns:
        bool: True si debe descansar, False si puede seguir operando.
    """
    return horas_trabajadas_turno >= LIMITE_FATIGA_HORAS
