from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, condecimal


class TipoVehiculo(str, Enum):
    VAGONETA = "vagoneta"
    TAXI_TERCERO = "taxi_tercero"


class EstadoChofer(str, Enum):
    ACTIVO = "activo"
    EN_DESCANSO = "en_descanso"
    INACTIVO = "inactivo"


class EstadoViaje(str, Enum):
    SOLICITADO = "solicitado"
    ASIGNADO = "asignado"
    EN_CAMINO = "en_camino"
    EN_PUNTO = "en_punto"
    EN_CURSO = "en_curso"
    FINALIZADO = "finalizado"
    CANCELADO = "cancelado"


class GeoPoint(BaseModel):
    """
    Representa un punto geográfico compatible con GeoJSON y PostGIS.
    La coordenada es [longitud, latitud].
    """
    type: str = "Point"
    coordinates: list[float]  # [longitude, latitude]


class Usuario(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    email: str
    nombre_completo: str
    creado_en: datetime = Field(default_factory=datetime.utcnow)


class Chofer(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    usuario_id: UUID
    estado: EstadoChofer = EstadoChofer.INACTIVO
    horas_trabajadas_semana: Decimal = Field(default=Decimal("0.0"))
    descanso_hasta: Optional[datetime] = None


class Cliente(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    usuario_id: UUID
    direccion_principal: str
    ubicacion_principal: GeoPoint


class Vehiculo(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    chofer_id: UUID
    tipo: TipoVehiculo
    capacidad_pasajeros: int
    matricula: str
    marca: str
    modelo: str


class Viaje(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    cliente_id: UUID
    vehiculo_id: Optional[UUID] = None  # None hasta que se asigne
    estado: EstadoViaje = EstadoViaje.SOLICITADO
    origen: GeoPoint
    destino: GeoPoint
    hora_pactada: datetime
    hora_arribo_real: Optional[datetime] = None
    
    # Penalizaciones (Ajuste profesional: Separar tiempo y costo monetario)
    demora_minutos: int = Field(default=0, description="Minutos de atraso respecto a la hora pactada")
    penalizacion_monetaria: Decimal = Field(default=Decimal("0.00"), description="Monto deducido en pesos uruguayos")


class Posicion(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    chofer_id: UUID
    ubicacion: GeoPoint
    timestamp: datetime = Field(default_factory=datetime.utcnow)
