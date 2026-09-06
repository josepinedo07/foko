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

## Desplegar (recomendado si usas VPN o quieres probar desde cualquier red)

Son archivos estáticos + PeerJS, así que `server.py` NO se usa en producción.
Sube la carpeta a cualquier hosting estático con HTTPS:

- **Netlify Drop** (lo más rápido, sin git): <https://app.netlify.com/drop> — arrastra
  la carpeta del proyecto. En segundos tienes una URL `*.netlify.app`.
- **Vercel**: sube el proyecto a un repo de GitHub y en <https://vercel.com/new>
  impórtalo. Framework: "Other". Sin comandos de build. Redespliega solo en cada push.
- **Cloudflare Pages / GitHub Pages**: también funcionan (rutas relativas, OK en subcarpeta).

Con VPN (Surfshark) o datos móviles, la conexión P2P directa suele fallar: el
proyecto ya trae unos **TURN públicos de prueba** en
[`js/rtc-config.js`](js/rtc-config.js). Si van lentos o caídos, saca una clave
gratis en <https://dashboard.metered.ca/> y reemplázalos.

## Estructura

```
index.html            Selector de rol
remote-expert.html    Consola del técnico remoto
field-tech.html       Vista móvil del técnico en campo
js/webrtc-manager.js  Conexión WebRTC (PeerJS): cámara, mic, pantalla
js/ar-canvas.js       Capa de anotación sincronizada
js/rtc-config.js      Servidores ICE (STUN / TURN)
server.py             Servidor estático para desarrollo local
```
