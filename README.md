# FOKO

**En vivo:** <https://fieldlens-nu.vercel.app>
(el alias `foko-jpc-hambeo.vercel.app` existe pero aún tiene la protección de
Vercel activada — ver nota al final. GitHub Pages
<https://josepinedo07.github.io/foko/> también sirve la videollamada, pero sin
el reporte IA porque no corre funciones serverless.)

Soporte visual remoto: el teléfono del **técnico de campo** se convierte en los
ojos del **técnico de oficina**.

El de oficina abre la consola, genera un enlace / QR y lo comparte. El de campo
lo abre en su teléfono, permite la cámara y quedan conectados. Desde la consola
el de oficina puede:

- **Señalar** en tiempo real (puntero) y **dibujar** (trazo, flecha, elipse, texto).
- **Congelar** la imagen para revisar un detalle.
- **Tomar fotos** con las anotaciones incrustadas.
- **Grabar** la sesión en video (imagen + anotaciones + audio).
- **Compartir su pantalla** hacia el teléfono del técnico.
- **Asistente de notas IA** (opcional): transcribe la llamada, junta tus notas y
  genera un reporte de servicio con Gemini (Google AI Studio).

El de campo puede voltear la cámara, encender la linterna, silenciar el micrófono y
tocar la pantalla para señalar de vuelta. Antes de conectar pasa por un chequeo de
sistemas (cámara / micrófono / red). No necesita cuenta — solo abre el enlace.

La consola de oficina sí requiere cuenta: cada **empresa** tiene su propio login,
su logo/nombre (aparece en la consola, la invitación y el reporte) y puede tener
varios técnicos de oficina (dueño + compañeros con un código de invitación).

## Identidad y diseño

Ver [`BRAND.md`](BRAND.md) (wordmark, favicon, tipografía de marca) y
[`DESIGN.md`](DESIGN.md) (sistema de tokens, componentes y reglas de
movimiento) — instrumento de precisión, no app de consumo: oscuro por
defecto, un solo color de acento (que siempre significa "mira aquí"),
tipografía mono para telemetría.

## Cómo funciona

- **Video/audio:** WebRTC punto a punto.
- **Señalización:** broker público de PeerJS (no hace falta servidor propio).
- **Recorrido de NAT:** STUN de Google. Para redes difíciles (datos móviles, CGNAT,
  VPN) hay TURN públicos de prueba en [`js/rtc-config.js`](js/rtc-config.js).
- **HUD de conexión:** latencia, resolución y FPS reales, leídos de
  `RTCPeerConnection.getStats()` — nada simulado.
- **Cuentas / empresas / logo:** Supabase (Postgres + Auth + Storage). Ver
  "Cuentas y base de datos" más abajo.

## Uso local (dos ventanas en la misma compu)

```bash
python3 server.py
```

- Consola de oficina: <http://localhost:8000/remote-expert.html>
- Copia el enlace que genera y ábrelo en otra ventana para simular al de campo.

## Probar con un teléfono en la misma Wi-Fi

`getUserMedia` solo funciona sobre **HTTPS** (o `localhost`), así que hace falta TLS:

```bash
python3 server.py --https
```

La primera vez genera un certificado autofirmado (`.cert/`, necesita `openssl`).
El servidor imprime la URL para el teléfono, p. ej. `https://192.168.0.102:8443/`.
En el teléfono el navegador avisará que el sitio "no es seguro" → **Avanzado →
continuar** (es tu propio certificado). A partir de ahí la cámara funciona.

## Desplegar

La videollamada + anotaciones son 100% estáticas (sirven en cualquier host con
HTTPS: GitHub Pages, Netlify, Vercel…). El **asistente de notas IA** necesita la
función serverless `api/report.js`, que solo corre en un host con funciones
(**Vercel** o Netlify Functions), no en GitHub Pages.

### Vercel (recomendado)

1. Importa el repo en <https://vercel.com/new>. Framework: **Other**. Sin build.
2. En *Settings → Environment Variables* añade:
   - `GEMINI_API_KEY` — tu clave de Google AI Studio (queda solo en el servidor).
   - `SUPABASE_URL` — la URL del proyecto de Supabase (ver abajo).
   - `SUPABASE_SERVICE_ROLE_KEY` — la *service role key* del mismo proyecto
     (Settings → API en el dashboard de Supabase). **Nunca** va en el frontend.
   - `REPORT_MODEL` (opcional) — por defecto `gemini-3.5-flash-lite`.
3. Deploy. Redespliega solo en cada `git push` si conectas el repo de Git
   (ahora mismo el deploy en producción se hace a mano con `vercel deploy --prod`).

En la consola: **⚙ Ajustes → activar "Asistente de notas IA"**. Ya no hace
falta ningún código de acceso manual — el reporte usa la sesión real de la
cuenta (ver siguiente sección).

> **Nota sobre dominios en Vercel:** el proyecto vive bajo el slug antiguo
> `fieldlens` (renombrarlo requiere entrar a la cuenta). El alias público que
> funciona hoy es `fieldlens-nu.vercel.app`. Se creó también
> `foko-jpc-hambeo.vercel.app`, pero Vercel le aplica su pantalla de login
> ("Vercel Authentication") aunque el dominio principal esté sin protección —
> hay que desactivarla también para ese alias en
> *Project Settings → Deployment Protection*, o pedir un dominio propio.

### Sin el reporte con IA

El login, las empresas y el logo **sí** funcionan en cualquier host estático
(Netlify Drop, GitHub Pages, Cloudflare Pages) — hablan directo con Supabase
desde el navegador, no necesitan `api/`. Lo único que exige un host con
funciones serverless (Vercel/Netlify Functions) es `/api/report`, porque ahí
vive la API key de Gemini. `server.py` no se usa en producción en ningún caso.

### Conexión con VPN / datos móviles

La P2P directa suele fallar detrás de VPN o CGNAT. El proyecto trae unos **TURN
públicos de prueba** en [`js/rtc-config.js`](js/rtc-config.js); si van lentos,
saca una clave gratis en <https://dashboard.metered.ca/> y reemplázalos.

## Cuentas y base de datos (Supabase)

Cada empresa es una fila en `companies`; cada usuario (técnico de oficina) es
una fila en `profiles` que apunta a **una** empresa, con rol `owner` (la creó)
o `member` (se unió con el código de invitación). Todo con Row Level Security:
un usuario solo puede leer/escribir su propia empresa. El logo vive en un
bucket de Storage público de solo lectura (`logos`).

- **Esquema completo, con comentarios:** [`supabase/schema.sql`](supabase/schema.sql)
  — se puede volver a correr entero, todo usa `if not exists` / `or replace`.
- **Crear el proyecto desde cero:**
  1. Cuenta en <https://supabase.com> → *New Project*.
  2. En el *SQL Editor*, pega y corre `supabase/schema.sql`.
  3. *Settings → API*: copia la **Project URL** y la **anon key** públicas a
     [`js/supabase-client.js`](js/supabase-client.js) (ya están puestas las de
     este proyecto; para uno nuevo, reemplázalas ahí — son públicas por
     diseño, RLS es lo que protege los datos).
  4. La **service role key** (la secreta) va solo en Vercel, como
     `SUPABASE_SERVICE_ROLE_KEY` (ver arriba).
  5. En *Authentication → Settings*, si quieres alta instantánea sin
     verificar correo (lo que usa este proyecto para no fricción en el
     onboarding), activa *"Confirm email" = Off* — o déjalo activado y ajusta
     `login.html` para el paso de "revisa tu correo".
- **Unir un compañero de oficina:** el dueño comparte el código de invitación
  (Ajustes → Marca de tu empresa) y el compañero entra por `login.html` →
  "Unirme con código".

## Estructura

```
index.html             Selector de rol
login.html             Iniciar sesión / crear empresa / unirme con código
remote-expert.html     Consola del técnico de oficina (requiere sesión)
field-tech.html        Vista móvil del técnico de campo (viewer + systems check)
css/tokens.css         Tokens de diseño — única fuente de verdad de color/tipo/espacio
css/design-system.css  Componentes (viewer, HUD, toolkit, tray, systems check, toast…)
js/webrtc-manager.js   Conexión WebRTC (PeerJS): cámara, mic, pantalla
js/ar-canvas.js        Capa de anotación sincronizada
js/ui.js               Toast, HUD con estadísticas reales, systems check
js/notes-assistant.js  Transcripción por voz + llamada al reporte
js/rtc-config.js       Servidores ICE (STUN / TURN)
js/supabase-client.js  Cliente de Supabase (auth + empresa)
js/logo.js             Wordmark reutilizable (<Logo>)
api/report.js          Función serverless: valida sesión, genera el reporte con Gemini
supabase/schema.sql    Esquema de base de datos (tablas, RLS, RPCs, storage)
brand/                 Assets de marca (favicons, wordmark) — ver BRAND.md
server.py              Servidor estático para desarrollo local
DESIGN.md              Sistema de diseño de producto
BRAND.md               Identidad de marca
```

## Para cobrar por esto (siguiente paso)

Ya hay cuentas reales por empresa (Supabase Auth + RLS) — eso ya no es el
parche que era. Lo que falta para cobrar de verdad: medir uso por empresa
(cuántos reportes/minutos), un plan/límite, y Stripe para el checkout y la
suscripción. No está incluido.
