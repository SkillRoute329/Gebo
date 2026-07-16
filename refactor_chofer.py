import re
import os

file_path = 'frontend/src/views/ChoferApp.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';",
    "import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';\nimport ChatPanel from '../components/ui/ChatPanel';\nimport { MessageSquare, AlertOctagon, X } from 'lucide-react';"
)

# 2. States
states_hook = "  const [fotoFile, setFotoFile] = useState(null);\n  const [isDemoSkipFoto, setIsDemoSkipFoto] = useState(false);\n"
new_states = "  const [showChat, setShowChat] = useState(false);\n  const [showIncidenteModal, setShowIncidenteModal] = useState(false);\n  const [incidenteDesc, setIncidenteDesc] = useState('');\n"
content = content.replace(states_hook, states_hook + new_states)

# 3. Timer Logic
timer_old_regex = r"  // Timer y Cálculo de Costo para Vista 5\n  useEffect\(\(\) => \{\n    let interval;\n    if \(faenaEnCurso\?.estado === 'en_curso' && faenaEnCurso\?.fecha_hora_inicio_real\) \{\n      interval = setInterval\(\(\) => \{\n        const start = new Date\(faenaEnCurso\.fecha_hora_inicio_real\)\.getTime\(\);\n        const now = new Date\(\)\.getTime\(\);\n        const elapsedSecs = Math\.max\(0, Math\.floor\(\(now - start\) / 1000\)\);\n        setFaenaTimer\(elapsedSecs\);"
timer_new = """  // Timer y Cálculo de Costo para Vista 5
  useEffect(() => {
    let interval;
    if ((faenaEnCurso?.estado === 'en_curso' || faenaEnCurso?.estado === 'incidente') && faenaEnCurso?.fecha_hora_inicio_real) {
      interval = setInterval(() => {
        const start = new Date(faenaEnCurso.fecha_hora_inicio_real).getTime();
        const now = new Date().getTime();
        let elapsedSecs = Math.floor((now - start) / 1000);
        if (faenaEnCurso.tiempo_pausa_acumulado_segundos) {
           elapsedSecs -= faenaEnCurso.tiempo_pausa_acumulado_segundos;
        }
        if (faenaEnCurso.estado === 'incidente' && faenaEnCurso.ultimo_inicio_pausa) {
           elapsedSecs -= Math.floor((now - new Date(faenaEnCurso.ultimo_inicio_pausa).getTime()) / 1000);
        }
        elapsedSecs = Math.max(0, elapsedSecs);
        setFaenaTimer(elapsedSecs);"""
content = re.sub(timer_old_regex, timer_new, content)

# 4. Filter fetching
content = content.replace(
    ".in('estado', ['chofer_en_camino', 'chofer_llegó', 'en_curso'])",
    ".in('estado', ['chofer_en_camino', 'chofer_llegó', 'en_curso', 'incidente'])"
)

# 5. Handle Report Incident
incident_handler = """  const handleReportIncidente = async () => {
    if (!incidenteDesc.trim()) return;
    const { error } = await supabase.from('incidentes_faena').insert({
      faena_id: faenaEnCurso.id,
      reportado_por_id: choferProfile.id,
      descripcion: incidenteDesc
    });
    if (!error) {
      await supabase.from('faenas').update({ estado: 'incidente' }).eq('id', faenaEnCurso.id);
      setFaenaEnCurso(prev => ({ ...prev, estado: 'incidente', ultimo_inicio_pausa: new Date().toISOString() }));
      setShowIncidenteModal(false);
      setIncidenteDesc('');
    }
  };\n"""

content = content.replace("  const toggleTurno = async () => {", incident_handler + "\n  const toggleTurno = async () => {")

# 6. Buttons in Vista 4 and 5
btn_chat_4 = """                <Button 
                  onClick={handleLlegueVehiculo}
                  style={{ width: '100%', padding: '16px', fontSize: '1.2rem', background: '#00ffcc', color: '#111', border: 'none', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  LLEGUÉ AL VEHÍCULO
                </Button>"""
btn_chat_4_new = btn_chat_4 + "\n                <Button onClick={() => setShowChat(true)} style={{ width: '100%', marginTop: '12px', background: 'transparent', color: '#00ffcc', border: '1px solid #00ffcc' }}>Abrir Chat</Button>"
content = content.replace(btn_chat_4, btn_chat_4_new)

btn_chat_5 = """                <Button 
                  onClick={handleFinalizarFaena}"""
btn_chat_5_new = """                {faenaEnCurso.estado === 'incidente' && (
                  <div style={{ backgroundColor: '#ff4444', color: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                    INCIDENTE EN REVISIÓN. Timer pausado.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <Button onClick={() => setShowChat(true)} style={{ flex: 1, background: 'transparent', color: '#00ffcc', border: '1px solid #00ffcc' }}>Chat</Button>
                  <Button onClick={() => setShowIncidenteModal(true)} style={{ flex: 1, background: 'transparent', color: '#ff4444', border: '1px solid #ff4444' }}>Incidente</Button>
                </div>\n""" + btn_chat_5
content = content.replace(btn_chat_5, btn_chat_5_new)

# 7. Render Modals
modals = """
      {showChat && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '90%', maxWidth: '400px', height: '80%' }}>
            <ChatPanel faenaId={faenaEnCurso?.id} userId={choferProfile?.id} userRole="chofer" onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}
      
      {showIncidenteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GlassCard style={{ width: '90%', maxWidth: '400px', padding: '24px' }}>
            <h3 style={{ marginTop: 0 }}>Reportar Incidente</h3>
            <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '16px' }}>Describe el problema (ej: daño en el vehículo, choque, problema con el cliente). El timer de cobro se pausará hasta que un administrador lo resuelva.</p>
            <textarea 
              value={incidenteDesc}
              onChange={e => setIncidenteDesc(e.target.value)}
              placeholder="Descripción del incidente..."
              style={{ width: '100%', height: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: 'rgba(255,255,255,0.1)', color: '#fff', marginBottom: '16px', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <Button variant="outline" onClick={() => setShowIncidenteModal(false)} style={{ flex: 1 }}>Cancelar</Button>
              <Button onClick={handleReportIncidente} style={{ flex: 1, background: '#ff4444', color: '#fff', border: 'none' }} disabled={!incidenteDesc.trim()}>Reportar</Button>
            </div>
          </GlassCard>
        </div>
      )}
"""
content = content.replace("      {/* BOTON SOS FLOTANTE */}", modals + "\n      {/* BOTON SOS FLOTANTE */}")

# 8. Render faenaEnCurso as incidente for step check
content = content.replace("faenaEnCurso?.estado === 'en_curso'", "(faenaEnCurso?.estado === 'en_curso' || faenaEnCurso?.estado === 'incidente')")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("ChoferApp refactored successfully.")
