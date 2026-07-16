import re

file_path = 'frontend/src/views/ClienteApp.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import DireccionInput from '../components/ui/DireccionInput';",
    "import DireccionInput from '../components/ui/DireccionInput';\nimport ChatPanel from '../components/ui/ChatPanel';"
)

# 2. States
content = re.sub(
    r"const \[mensajes, setMensajes\] = useState\(\[\]\);\n\s*const \[nuevoMensaje, setNuevoMensaje\] = useState\(''\);",
    "",
    content
)

# 3. Load initial state mapping
content = content.replace(
    "} else if (faena.estado === 'en_curso') {",
    "} else if (faena.estado === 'en_curso' || faena.estado === 'incidente') {"
)

# 4. Postgres change mapping
content = content.replace(
    "} else if (f.estado === 'en_curso') {",
    "} else if (f.estado === 'en_curso' || f.estado === 'incidente') {"
)

# 5. Timer logic
timer_old = '''    if (step === 'en_curso' && faenaActual?.fecha_hora_inicio_real) {
      interval = setInterval(() => {
        const transcurrido = Math.floor((new Date() - new Date(faenaActual.fecha_hora_inicio_real)) / 1000);
        setTiempoTranscurrido(transcurrido > 0 ? transcurrido : 0);
      }, 1000);
    }'''

timer_new = '''    if (step === 'en_curso' && faenaActual?.fecha_hora_inicio_real) {
      interval = setInterval(() => {
        let transcurrido = Math.floor((new Date() - new Date(faenaActual.fecha_hora_inicio_real)) / 1000);
        if (faenaActual.tiempo_pausa_acumulado_segundos) transcurrido -= faenaActual.tiempo_pausa_acumulado_segundos;
        if (faenaActual.estado === 'incidente' && faenaActual.ultimo_inicio_pausa) {
           transcurrido -= Math.floor((new Date() - new Date(faenaActual.ultimo_inicio_pausa)) / 1000);
        }
        setTiempoTranscurrido(transcurrido > 0 ? transcurrido : 0);
      }, 1000);
    }'''
content = content.replace(timer_old, timer_new)

# 6. Remove send message logic and postgres changes for chat
content = re.sub(r"const handleSendMensaje = async \(\w+\) => \{.*?\n  \};\n", "", content, flags=re.DOTALL)
content = re.sub(r"// Cargar mensajes previos.*?\n      \.subscribe\(\);\n", "", content, flags=re.DOTALL)

# 7. Replace renderChat with ChatPanel overlay
chat_old = re.search(r"const renderChat = \(\) => \{.*?    \};\n", content, re.DOTALL)
if chat_old:
    chat_new = '''  const renderChat = () => {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '90%', maxWidth: '400px', height: '80%' }}>
          <ChatPanel faenaId={viajeId} userId={clienteId} userRole="cliente" onClose={() => setShowChat(false)} />
        </div>
      </div>
    );
  };\n'''
    content = content.replace(chat_old.group(0), chat_new)

# 8. Add incidente warning
banner_old = "{faenaActual?.estado === 'chofer_llegó' && ("
banner_new = """{faenaActual?.estado === 'incidente' && (
                  <div style={{ backgroundColor: '#f44336', color: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center', fontWeight: 'bold' }}>
                    ¡Incidente Reportado! Administrador evaluando.
                  </div>
                )}
                {faenaActual?.estado === 'chofer_llegó' && ("""
content = content.replace(banner_old, banner_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('ClienteApp refactored successfully.')
