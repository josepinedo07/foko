# 🚀 FieldLens AR

**Asistencia Visual Remota con Realidad Aumentada para Operaciones en Campo**

FieldLens AR permite conectar a un técnico en el lugar de trabajo con un experto remoto a través de video WebRTC de baja latencia con anotaciones interactivas en tiempo real, puntero láser virtual, esquemas técnicos sincronizados y generación automática de reportes de intervención.

---

## 📋 Estructura del Workspace

```text
fieldlens-ar/
├── fieldlens-ar.code-workspace # Archivo de espacio de trabajo para el IDE
├── .vscode/                   # Configuraciones, tareas y depurador
│   ├── settings.json
│   ├── tasks.json
│   └── launch.json
├── .agents/                   # Configuración y contexto del agente Antigravity
│   └── GEMINI.md
├── css/
│   ├── design-system.css      # Sistema visual industrial táctico oscuro
│   └── report.css             # Plantilla para exportar reportes a PDF/impresión
├── js/
│   ├── webrtc-manager.js      # Conectividad P2P y WebRTC DataChannels (<20ms)
│   ├── ar-canvas.js           # Motor de renderizado AR a 60 FPS y normalización
│   ├── schematics-manager.js  # Planos interactivos (eléctrico, HVAC, hidráulica, fibra)
│   ├── equipment-simulator.js # Simulador de maquinaria industrial animada
│   └── report-generator.js    # Generador de informes técnicos de intervención
├── field-tech.html            # Interfaz para el smartphone del técnico
├── remote-expert.html         # Cockpit de control para el experto remoto
├── simulator.html             # Banco de pruebas dual (Simulador lado a lado)
├── index.html                 # Selector de rol y bienvenida
├── server.py                  # Servidor local HTTP con detección de IP y CORS
└── package.json               # Metadatos y scripts
```

---

## ⚡ Inicio Rápido

### 1. Iniciar el servidor local
Puedes ejecutarlo desde la terminal con:

```bash
python3 server.py
```
O con npm:
```bash
npm start
```

El servidor quedará disponible en:
- **Banco de Pruebas Dual (Recomendado para pruebas)**: `http://localhost:8000/simulator.html`
- **Inicio / Selector de Modo**: `http://localhost:8000/`
- **Cockpit del Experto**: `http://localhost:8000/remote-expert.html?room=SALA-1`
- **Técnico en Campo**: `http://localhost:8000/field-tech.html?room=SALA-1`

### 2. Uso con Smartphone real
El servidor imprime en consola tu dirección IP local (por ejemplo `http://192.168.1.X:8000/`). Solo debes abrir esa URL desde el navegador de tu teléfono conectado a la misma red Wi-Fi.

---

## 🎯 Características Principales

1. **Puntero Láser Virtual con Ondas de Radar**: Permite al experto señalar componentes con precisión milimétrica.
2. **Pines Paso a Paso (1, 2, 3...)**: Guía visual numerada secuencial para procedimientos complejos.
3. **Congelador de Fotograma (Freeze-Frame)**: Permite detener la imagen para examinar detalles finos sin vibraciones.
4. **Esquemas Industriales Interactivos**: Biblioteca de diagramas técnicos que se envían directamente al teléfono del técnico.
5. **Generador de Órdenes de Trabajo**: Exportación en un clic de informe técnico formal con capturas de pantalla anotadas.
