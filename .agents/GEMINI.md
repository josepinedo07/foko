# FieldLens AR - Workspace Context & Development Guidelines

FieldLens AR es una plataforma web progresiva de asistencia visual remota con Realidad Aumentada (AR) diseñada para técnicos de campo y expertos remotos.

## Arquitectura del Proyecto

1. **Módulo Técnico en Campo (`field-tech.html`)**:
   - Orientado a dispositivos móviles / PWA.
   - Acceso a `navigator.mediaDevices.getUserMedia` (cámara trasera preferida) y flash/linterna.
   - Superposición de Canvas AR sincronizado vía WebRTC DataChannel.

2. **Módulo Cockpit de Experto (`remote-expert.html`)**:
   - Panel de control avanzado para el especialista.
   - Herramientas: Puntero Láser (radar pulse), Pines Secuenciales (1, 2, 3...), Dibujo AR, Congelamiento de fotograma (Freeze-Frame).
   - Visor y sincronizador de diagramas técnicos esquemáticos (`schematics-manager.js`).
   - Generador de informes de servicio con capturas anotadas (`report-generator.js`).

3. **Banco de Pruebas Dual (`simulator.html`)**:
   - Vista lado a lado para validar la sincronización WebRTC localmente sin requerir múltiples dispositivos.
   - Utiliza `equipment-simulator.js` para simular maquinaria industrial interactiva.

4. **Reglas de Calibración AR (`ar-canvas.js`)**:
   - Todas las coordenadas táctiles y de dibujo deben normalizarse en el rango `[0, 1]` relativo al área real visible del video (`normX`, `normY`).
   - Siempre considerar el modo `object-fit: contain` o `cover` para compensar diferencias de aspecto entre el monitor del experto y el teléfono móvil.
