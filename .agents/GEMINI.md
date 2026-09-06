# FOKO - Contexto para agentes

App web de **soporte visual remoto**. Sin build, sin framework: HTML + JS módulos
+ un servidor estático de Python para desarrollo. El teléfono del técnico de campo
es la cámara; la consola del técnico de oficina es donde se dibuja y se dirige.

## Dirección de producto y diseño

Instrumento de precisión, no app de consumo: oscuro por defecto, denso en datos
pero nunca saturado, un único color de acento (lima, `--accent`) que **siempre**
significa "mira aquí / en vivo / lo que se está señalando" — nunca decorativo.
Toda la telemetría (latencia, resolución, FPS, timer de sesión) es real, leída de
`RTCPeerConnection.getStats()`; no se inventa ni se hardcodea. Ver [`DESIGN.md`](../DESIGN.md)
para tokens, componentes y reglas de movimiento — es la fuente de verdad de UI.

Evitar relleno: nada de datos falsos, simuladores, funciones no pedidas,
gradientes/glassmorphism genéricos de SaaS ni íconos emoji en la UI final
(se reemplazan por SVG inline con `currentColor`).

## Piezas

- `login.html` - iniciar sesión / crear empresa / unirme con código de invitación.
- `remote-expert.html` - consola del técnico de oficina (rol `expert`).
  **Requiere sesión** (`requireSession()` redirige a `login.html` si no hay).
- `field-tech.html` - vista móvil del técnico de campo (rol `field`), con
  chequeo de sistemas (cámara/mic/red) antes de conectar. Sin login — solo
  abre el enlace/QR.
- `js/webrtc-manager.js` - `WebRTCManager`. PeerJS; el Peer ID del técnico de
  oficina **es** el código de sesión (`FK-XXXX`). El de campo envía cámara+mic,
  el de oficina responde con mic y puede llamar de vuelta con la pantalla
  (`metadata.kind`: `camera` | `screen`). `getPeerConnection()` expone el
  `RTCPeerConnection` para leer estadísticas reales.
- `js/ar-canvas.js` - `ARCanvas`. Coordenadas normalizadas `[0,1]` relativas al
  **rectángulo real del video** (object-fit: contain en ambos lados) para que
  las anotaciones caigan en el mismo punto. Herramientas: puntero, trazo,
  flecha, elipse, texto. Cada trazo confirmado "se transmite": draw-on +
  destello de acento que decae en ~240ms (respeta `prefers-reduced-motion`).
  `composite()` fusiona video + anotaciones para foto/grabación.
- `js/ui.js` - `toast()`, `Hud` (telemetría real desde `getStats()`),
  `runSystemsCheck()` (chequeo previo cámara/mic/red).
- `js/notes-assistant.js` - transcripción por voz (Web Speech API, solo mic
  local) + `generateReport()` contra `/api/report`.
- `js/rtc-config.js` - `ICE_SERVERS` (STUN + TURN públicos de prueba).
- `js/supabase-client.js` - cliente de Supabase (URL + anon key, públicas por
  diseño). `getSessionAndProfile()` / `requireSession()`.
- `js/logo.js` - `mountLogo(el, {height, showDot})`: wordmark "foko" (Caveat),
  color vía `--brand-ink` (no hay dos SVGs por tema, uno con `currentColor`).
- `api/report.js` - función serverless (Vercel/Netlify Functions). Valida el
  `access_token` de Supabase (service role key, servidor), resuelve la empresa
  del usuario y genera el reporte con Gemini (`gemini-3.5-flash-lite` por defecto,
  vía `@google/genai`). `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` solo viven
  en el servidor.
- `supabase/schema.sql` - `companies`, `profiles` (1 usuario → 1 empresa, rol
  `owner`/`member`), RLS vía `my_company_id()`/`my_role()` (security definer,
  evita recursión), RPCs `create_company_and_join` / `join_company_by_code`,
  bucket de Storage `logos`. Re-ejecutable completo.
- `css/tokens.css` - única fuente de verdad de color/tipografía/espacio/radio/
  movimiento (oscuro + claro). Ningún hex fuera de este archivo (excepto
  literales funcionales documentados: negro tras el video, blanco del QR) y
  los assets estáticos de `/brand`.
- `css/design-system.css` - primitivas de componentes que consumen los tokens.

## Reglas

- Mantener ambos lados con `object-fit: contain` en el `<video>`; si se cambia,
  las anotaciones se desalinean.
- No añadir dependencias más allá de PeerJS, el qrcode local en `js/vendor/` y
  `@supabase/supabase-js` (CDN en el cliente, npm en `api/`); `@google/genai`
  solo corre en el servidor.
- La *service role key* de Supabase NUNCA va al frontend — solo como env var
  de Vercel. La *anon key* en `js/supabase-client.js` sí es pública por diseño.
- Un solo color de acento en toda la UI. Antes de usar un color nuevo, revisar
  si ya existe un token de estado (`--ok/--warn/--critical/--info`) para eso.
- Nada de emoji en botones/UI de producto; usar los SVG inline existentes como
  plantilla para íconos nuevos.
