import re

file_path = 'frontend/src/views/AdminDashboard.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import ClientesPanel from './admin/ClientesPanel';",
    "import ClientesPanel from './admin/ClientesPanel';\nimport IncidentesPanel from './admin/IncidentesPanel';"
)
content = content.replace(
    "import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';",
    "import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';\nimport { AlertOctagon } from 'lucide-react';"
)

# 2. Add Tab
tabs_old = "{ id: 'vagonetas', icon: Truck, label: 'Vagonetas' },"
tabs_new = tabs_old + "\n            { id: 'incidentes', icon: AlertOctagon, label: 'Incidentes' },"
content = content.replace(tabs_old, tabs_new)

# 3. Render Tab Content
render_old = "      case 'clientes':\n        return <ClientesPanel />;"
render_new = render_old + "\n      case 'incidentes':\n        return <IncidentesPanel />;"
content = content.replace(render_old, render_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("AdminDashboard refactored successfully.")
