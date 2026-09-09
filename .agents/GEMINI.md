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

## Planes, organizaciones y facturación (multi-tenant)

Añadido sobre el modelo existente **sin renombrar tablas**:
`companies` = organización (columnas nuevas: `plan_id`, `seat_limit`, `status`
trialing|active|past_due|paused|canceled, `trial_ends_at`, `billing_mode`
manual|stripe, `stripe_customer_id`, `slug`, `notes`, `past_due_since`).
`profiles` = usuario (`status` invited|active|disabled, `last_active_at`,
`invited_by`). Roles: **owner→org_admin, member→expert**. El **superadmin** sigue
siendo una fila en `platform_admins`. El **técnico de campo NO es usuario** (entra
por link/QR); los asientos cuentan org_admin + expert activos.

- `plans` (tabla, fuente de verdad de precios): founder(oculto)/cuadrilla/taller/flota.
- `invitations` (token+email+role, 14 días). RPCs: `admin_create_organization`,
  `admin_update_organization`, `invite_user`, `accept_invitation`,
  `set_user_role`, `set_user_status`, `admin_orgs`, `admin_org_detail`,
  `org_team`, `org_billing`, `admin_find_user`, `seats_used`, `org_access_state`,
  `_mrr_cents`, `touch_activity`.
- Enforcement: RLS de INSERT en `sessions`/`session_media` exige
  `org_access_state() = 'ok'`; `api/report.js` idem (402 si walled).
  `js/gate.js` `enforceAccess(state)` pone el muro en el cliente.
- Páginas: `precios.html` (pública), `admin.html` (superadmin, reconstruida),
  `team.html` + `billing.html` (org_admin), `invite.html` (acepta invitación).
  `api/invite.js` manda el correo (Supabase Auth). Stripe: `api/_stripe.js` +
  `api/{stripe-checkout,stripe-webhook,billing-portal}.js` detrás de
  `BILLING_STRIPE_ENABLED` (off = todo manual, endpoints 404).
- SQL por fases: `supabase/phase1-plans-orgs.sql`, `phase2.sql`, `phase5.sql`,
  `phase6-stripe.sql`. Tests: `supabase/tests.sql` (pgTAP) + `QA.md`.
- `getSessionAndProfile()` ahora trae `accessState` y `profile.status`.
