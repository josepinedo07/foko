# FOKO — identidad de marca

Ver también [`DESIGN.md`](DESIGN.md) para el sistema de componentes de producto
(HUD, visor, toolkit…). Este archivo es solo identidad: wordmark, favicon,
tipografía de marca y las reglas de uso. Fuente de verdad de tokens:
[`css/tokens.css`](css/tokens.css) — **ningún color de marca vive fuera de ese
archivo**, salvo los assets estáticos en `/brand` (son imágenes, no hojas de
estilo — llevan sus valores literales como cualquier ilustración).

## Nombre

**Foko** (en producto y wordmark, siempre minúsculas: "foko"). Personalidad:
instrumento de precisión + el gesto humano de "marcar lo que hay que mirar".

> Nota legal, no bloquea el desarrollo: existe "Foko Retail" (WorkForce
> Software) — pendiente una búsqueda formal de marca antes de registrar o
> imprimir nada.

## Regla: un solo color señal

La misma regla que en `DESIGN.md`. `--accent` (lima `#C6FF00`) es el único
color que significa "mira aquí / en vivo". El wordmark y el ícono usan
**solo** lima, negro (`--on-accent` `#141600`) y blanco — nunca otro color, y
nunca lima como texto sobre fondo claro (para eso existe `--accent-text` /
`--brand-ink`, ver abajo).

## El wordmark

Cursiva monolínea, minúsculas, sin florituras — se lee como una anotación
hecha a mano, no como caligrafía. Referencia tipográfica: **Caveat 600**.
Punto de acento centrado en la última "o" (el "foco").

- Componente reutilizable: [`js/logo.js`](js/logo.js) → `mountLogo(el, { height, showDot })`.
  Un solo `<svg fill="currentColor">`; el color lo decide la clase `.logo`
  vía el token `--brand-ink` (lima en oscuro, negro en claro), así no hay que
  mantener dos wordmarks para los dos temas.
- El punto se reposiciona por JS sobre la última "o" en cuanto la fuente
  Caveat termina de cargar (si no, con la fuente de reserva cargando primero
  queda mal puesto un instante).
- Assets estáticos de referencia en `/brand`: `wordmark-on-dark.svg` (lima) y
  `wordmark-on-light.svg` (negro).
- **Área de protección:** altura de la "x" del wordmark en los 4 lados.
- **Tamaño mínimo:** 120px de ancho. Por debajo, usar solo el ícono ("f").
- **Producción pendiente (v1):** lo de arriba es la referencia tipográfica
  (exactamente la que se pidió). Para no depender de que cargue una fuente
  web, el siguiente paso es redibujar "foko" a mano como un único trazo
  monolínea (stroke ~9/130, `stroke-linecap/linejoin: round`), inclinación
  ~4°, y convertirlo a outline. Es trabajo de diseño vectorial real (Illustrator
  /Figma), no algo que se pueda generar bien por código.

## El ícono ("f") — favicon / app icon

Un solo trazo: gancho superior + asta + travesaño. Legible hasta 16px.

| Archivo | Uso |
|---|---|
| `brand/favicon.svg` | Favicon SVG (moderno), fondo lima, `rx=20` |
| `brand/favicon-32.png`, `brand/favicon-16.png` | Favicon PNG (el de 16px lleva el trazo más grueso para legibilidad) |
| `brand/apple-touch-icon.png` | 180×180, sin esquina redonda (iOS la aplica), padding ~14% |
| `brand/icon-512-maskable.png` | 512×512, fondo lima, "f" al 80% dentro del safe zone para Android adaptive icons |
| `brand/favicon-inverse.svg` | Fondo oscuro / trazo lima, para superficies claras |

Todas rasterizadas desde el SVG master con Chromium headless a tamaño exacto
(sin herramientas externas de conversión).

## Tipografía

| Uso | Fuente |
|---|---|
| UI general | Instrument Sans (400/500/600) — `--font-ui` |
| Momentos display alternos (no el logo) | Archivo 700 — `--font-display` |
| Wordmark / logo | Caveat 600 — `--font-script` |
| Telemetría, labels, IDs, timestamps | JetBrains Mono (400/500) — `--font-mono`, mayúsculas, tracking 0.08em |

Escala UI: 11 / 12 / 14 / 16 / 20 / 28 / 40 px. Cuerpo 16/1.6.

## `<head>` de cada página

```html
<link rel="icon" href="brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="brand/apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#0F1009">
```

## Prohibido

- Engrosar el trazo del wordmark de forma desigual, enderezar la cursiva,
  ponerle sombra.
- Colores de marca fuera de lima / negro / blanco.
- Lima como color de texto sobre fondo claro (usar `--brand-ink` / `--accent-text`).
- Más de un lima "en primer plano" por pantalla — sigue siendo la regla de
  `DESIGN.md`.
