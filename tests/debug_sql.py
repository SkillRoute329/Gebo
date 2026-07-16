import psycopg2

conn = psycopg2.connect("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
cursor = conn.cursor()

cursor.execute("SELECT id FROM faenas LIMIT 1;")
faena_id = cursor.fetchone()[0]

cursor.execute("""
    SELECT c.id
    FROM choferes c
    JOIN posiciones p ON p.chofer_id = c.id
    JOIN faenas f ON f.id = %s
    JOIN vehiculos_cliente v_vehiculo ON v_vehiculo.id = f.vehiculo_cliente_id
    WHERE c.estado = 'disponible'
      AND c.horas_conduccion_continua <= 8
      AND p.timestamp >= NOW() - INTERVAL '5 minutes'
      AND (
          (v_vehiculo.transmision = 'manual' AND c.maneja_manual = TRUE) OR
          (v_vehiculo.transmision = 'automatico' AND c.maneja_automatico = TRUE)
      )
      AND (v_vehiculo.es_electrico = FALSE OR c.maneja_electrico = TRUE)
      AND (v_vehiculo.tipo != 'suv' OR c.maneja_suv = TRUE)
      AND (v_vehiculo.tipo != 'camion' OR c.maneja_camion = TRUE)
""", (faena_id,))

res = cursor.fetchall()
print("SQL Match:", res)

# Check all positions
cursor.execute("SELECT chofer_id, timestamp >= NOW() - INTERVAL '5 minutes' FROM posiciones;")
print("Posiciones valid?:", cursor.fetchall())

conn.close()
