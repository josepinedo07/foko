# FOKO

**En vivo:** <https://fieldlens-nu.vercel.app>
(el alias `foko-jpc-hambeo.vercel.app` existe pero aún tiene la protección de
Vercel activada — ver nota al final. GitHub Pages
<https://josepinedo07.github.io/foko/> también sirve, pero sin el reporte IA.)

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
  genera un reporte de servicio con Claude.

El de campo puede voltear la cámara, encender la linterna, silenciar el micrófono y
tocar la pantalla para señalar de vuelta. Antes de conectar pasa por un chequeo de
sistemas (cámara / micrófono / red).

## Diseño

Ver [`DESIGN.md`](DESIGN.md) — sistema de tokens, componentes y reglas de
movimiento. Instrumento de precisión, no app de consumo: oscuro por defecto, un
solo color de acento (que siempre significa "mira aquí"), tipografía mono para
telemetría.

## Cómo funciona

- **Video/audio:** WebRTC punto a punto.
- **Señalización:** broker público de PeerJS (no hace falta servidor propio).
- **Recorrido de NAT:** STUN de Google. Para redes difíciles (datos móviles, CGNAT,
  VPN) hay TURN públicos de prueba en [`js/rtc-config.js`](js/rtc-config.js).
- **HUD de conexión:** latencia, resolución y FPS reales, leídos de
  `RTCPeerConnection.getStats()` — nada simulado.

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
   - `ANTHROPIC_API_KEY` — tu clave de la API de Anthropic (queda solo en el servidor).
   - `APP_PASSWORD` — un código de acceso que compartirás con quienes usen el reporte.
   - `REPORT_MODEL` (opcional) — por defecto `claude-haiku-4-5`.
3. Deploy. Redespliega solo en cada `git push` si conectas el repo de Git
   (ahora mismo el deploy en producción se hace a mano con `vercel deploy --prod`).

En la consola: **⚙ Ajustes → activar "Asistente de notas IA"**, pegar el mismo
`APP_PASSWORD` y dejar el endpoint en `/api/report`.

> **Nota sobre dominios en Vercel:** el proyecto vive bajo el slug antiguo
> `fieldlens` (renombrarlo requiere entrar a la cuenta). El alias público que
> funciona hoy es `fieldlens-nu.vercel.app`. Se creó también
> `foko-jpc-hambeo.vercel.app`, pero Vercel le aplica su pantalla de login
> ("Vercel Authentication") aunque el dominio principal esté sin protección —
> hay que desactivarla también para ese alias en
> *Project Settings → Deployment Protection*, o pedir un dominio propio.

### Solo la videollamada (sin IA)

Cualquier host estático sirve: Netlify Drop, GitHub Pages, Cloudflare Pages.
`server.py` no se usa en producción.

### Conexión con VPN / datos móviles

La P2P directa suele fallar detrás de VPN o CGNAT. El proyecto trae unos **TURN
públicos de prueba** en [`js/rtc-config.js`](js/rtc-config.js); si van lentos,
saca una clave gratis en <https://dashboard.metered.ca/> y reemplázalos.

## Estructura

```
index.html            Selector de rol
remote-expert.html    Consola del técnico de oficina
field-tech.html       Vista móvil del técnico de campo (viewer + systems check)
css/tokens.css         Tokens de diseño — única fuente de verdad de color/tipo/espacio
css/design-system.css  Componentes (viewer, HUD, toolkit, tray, systems check, toast…)
js/webrtc-manager.js   Conexión WebRTC (PeerJS): cámara, mic, pantalla
js/ar-canvas.js        Capa de anotación sincronizada
js/ui.js               Toast, HUD con estadísticas reales, systems check
js/notes-assistant.js  Transcripción por voz + llamada al reporte
js/rtc-config.js       Servidores ICE (STUN / TURN)
api/report.js          Función serverless: genera el reporte con Claude
server.py              Servidor estático para desarrollo local
DESIGN.md              Sistema de diseño
```

## Para cobrar por esto (siguiente paso)

El código de acceso único (`APP_PASSWORD`) sirve para validar y demostrar. Para
un producto de verdad falta: cuentas de usuario, medición de uso por cuenta y
facturación (Stripe). No está incluido.
