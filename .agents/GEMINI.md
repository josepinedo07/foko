# FieldLens - Contexto para agentes

App web de **soporte remoto por video**. Sin build, sin framework: HTML + JS módulos
+ un servidor estático de Python para desarrollo.

## Objetivo

Práctico y directo. El técnico remoto genera un enlace/QR, el de campo lo abre y se
conectan en una videollamada con puntero, dibujo, congelado, foto, grabación y
compartir pantalla. Evitar relleno: nada de datos falsos, simuladores, estética
"tactical HUD", telemetría inventada ni funciones que no se pidieron.

## Piezas

- `remote-expert.html` - consola del técnico remoto (rol `expert`).
- `field-tech.html` - vista móvil del técnico en campo (rol `field`).
- `js/webrtc-manager.js` - `WebRTCManager`. PeerJS; el Peer ID del experto **es** el
  código de sala. El campo envía cámara+mic, el experto responde con mic y puede
  llamar de vuelta con la pantalla (`metadata.kind`: `camera` | `screen`).
- `js/ar-canvas.js` - `ARCanvas`. Coordenadas normalizadas `[0,1]` relativas al
  **rectángulo real del video** (object-fit: contain en ambos lados) para que las
  anotaciones caigan en el mismo punto. `composite()` fusiona video + anotaciones.
- `js/rtc-config.js` - `ICE_SERVERS` (STUN + hueco para TURN).

## Reglas

- Mantener ambos lados con `object-fit: contain` en el `<video>`; si se cambia,
  las anotaciones se desalinean.
- No añadir dependencias más allá de PeerJS y el qrcode local en `js/vendor/`.
