# FieldLens

**En vivo:** <https://josepinedo07.github.io/fieldlens/>

Soporte remoto por video entre un **técnico remoto** y un **técnico en campo**.

El técnico remoto abre la consola, genera un enlace / QR y lo comparte. El de campo
lo abre en su teléfono, permite la cámara y quedan conectados. Desde la consola el
remoto puede:

- **Señalar** en tiempo real (puntero) y **dibujar** (lápiz, flecha, círculo).
- **Congelar** la imagen para revisar un detalle.
- **Tomar fotos** con las anotaciones incrustadas.
- **Grabar** la sesión en video (imagen + anotaciones + audio).
- **Compartir su pantalla** hacia el teléfono del técnico.
- **Asistente de notas IA** (opcional): transcribe la llamada, junta tus notas y
  genera un reporte de servicio con Claude.

El de campo puede voltear la cámara, encender la linterna, silenciar el micrófono y
tocar la pantalla para señalar de vuelta.

## Cómo funciona

- **Video/audio:** WebRTC punto a punto.
- **Señalización:** broker público de PeerJS (no hace falta servidor propio).
- **Recorrido de NAT:** STUN de Google. Para redes difíciles (datos móviles, CGNAT)
  configura un TURN en [`js/rtc-config.js`](js/rtc-config.js).

## Uso local (dos ventanas en la misma compu)

```bash
python3 server.py
```

- Consola del técnico remoto: <http://localhost:8000/remote-expert.html>
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
3. Deploy. Redespliega solo en cada `git push`.

En la consola del técnico remoto: **⚙ Ajustes → activar "Asistente de notas IA"**,
pegar el mismo `APP_PASSWORD` y dejar el endpoint en `/api/report`.

### Solo la videollamada (sin IA)

Cualquier host estático sirve: Netlify Drop, GitHub Pages, Cloudflare Pages.
`server.py` no se usa en producción.

### Conexión con VPN / datos móviles

La P2P directa suele fallar detrás de VPN (Surfshark) o CGNAT. El proyecto trae
unos **TURN públicos de prueba** en [`js/rtc-config.js`](js/rtc-config.js); si van
lentos, saca una clave gratis en <https://dashboard.metered.ca/> y reemplázalos.

## Estructura

```
index.html            Selector de rol
remote-expert.html    Consola del técnico remoto
field-tech.html       Vista móvil del técnico en campo
js/webrtc-manager.js  Conexión WebRTC (PeerJS): cámara, mic, pantalla
js/ar-canvas.js       Capa de anotación sincronizada
js/notes-assistant.js Transcripción por voz + llamada al reporte
js/rtc-config.js      Servidores ICE (STUN / TURN)
api/report.js         Función serverless: genera el reporte con Claude
server.py             Servidor estático para desarrollo local
```

## Para cobrar por esto (siguiente paso)

El código de acceso único (`APP_PASSWORD`) sirve para validar y demostrar. Para
un producto de verdad falta: cuentas de usuario, medición de uso por cuenta y
facturación (Stripe). No está incluido.
