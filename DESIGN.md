# FOKO — sistema de diseño

Instrumento de precisión, no app de consumo. Piensa consola de control de misión /
equipo de diagnóstico / HUD de visor de cámara: oscuro, calmado, alto contraste,
denso en datos pero nunca saturado. El feed de cámara **es** el producto; todo lo
demás es instrumentación alrededor de él.

Fuente de verdad: [`css/tokens.css`](css/tokens.css) (valores) +
[`css/design-system.css`](css/design-system.css) (componentes). Ningún color vive
fuera de esos dos archivos, salvo dos literales funcionales documentados ahí mismo
(negro detrás de un `<video>`, blanco detrás de un QR — no son decisiones de marca)
y los assets estáticos en `/brand` (imágenes, no hojas de estilo).

Para el wordmark, el favicon y las reglas de marca ver [`BRAND.md`](BRAND.md) —
este archivo es el sistema de **componentes de producto**; BRAND.md es
**identidad**.

## La regla: un solo color señal

`--accent` (lima, `#C6FF00`) es el **único** color que puede significar "mira
aquí", "esto está en vivo" o "esto se está señalando ahora mismo". Se usa en:
la acción primaria de cada pantalla, el puntero/cursor remoto, el destello de una
anotación recién transmitida, los corchetes y la retícula del visor mientras
alguien está apuntando, y el estado "dibujando" del HUD.

No se usa para decorar. Si algo no necesita atención inmediata, no lleva acento.
Los demás colores (`--ok`, `--warn`, `--critical`, `--info`) son de **estado**,
nunca de marca — nunca reemplazan al acento como "mira aquí".

## Tokens

Todos en [`css/tokens.css`](css/tokens.css); oscuro es el tema primario, claro se
deriva por `prefers-color-scheme` (y por `[data-theme]` si algún día hay un toggle).

| Grupo | Tokens |
|---|---|
| Acento | `--accent`, `--accent-pressed`, `--accent-wash`, `--on-accent`, `--accent-text` (versión legible como texto en claro) |
| Superficie (oscuro) | `--bg` `#0F1009`, `--surface` `#17180E`, `--surface-2` `#1F2015`, `--border` `#2E2F23`, `--border-strong` `#434435` |
| Texto (oscuro) | `--text` `#ECEBDE`, `--text-dim` `#9A9C88`, `--text-mute` `#6A6C5A` |
| Estado | `--ok`, `--warn`, `--critical` (también "grabando"), `--info`, `--on-critical` |
| Tipografía | `--font-ui` (Instrument Sans), `--font-display` (Archivo, momentos alternos), `--font-script` (Caveat, el wordmark), `--font-mono` (JetBrains Mono) |
| Marca | `--brand-ink` (color del wordmark: lima en oscuro, negro en claro — ver BRAND.md) |
| Escala tipo | `--fs-11` … `--fs-40` (nunca menos de 11px) |
| Espaciado | `--s-1` (4px) … `--s-16` (64px) — rejilla de 4px |
| Radio | `--r` (4px, default), `--r-cell` (2px, celdas de datos), `--r-full` (solo dots de estado) |
| Movimiento | `--snap` (120ms, cambios de estado), `--draw` (240ms, anotación transmitida) |

## Tipografía

- **UI:** Instrument Sans 400/500/600.
- **Display** (títulos grandes que no son el logo): Archivo a 700,
  `letter-spacing: -0.02em` (clase `.display`).
- **Wordmark/logo:** Caveat 600 — ver `js/logo.js` y [`BRAND.md`](BRAND.md).
  No se usa para nada más que el logo.
- **Telemetría / labels / IDs / timestamps / coordenadas:** JetBrains Mono
  400/500. Los labels van en MAYÚSCULAS con `letter-spacing: 0.08em`
  (clase `.label`).

## Movimiento

Mecánico y rápido, nunca ambiental:

- **Cambios de estado** ("snap"): 120ms, `cubic-bezier(0.2,0,0,1)`. Toggles,
  aparecer/desaparecer de paneles, hover.
- **Anotación transmitida**: cuando un trazo se confirma (local o remoto), se
  dibuja en ~240ms (draw-on: el trazo se revela progresivamente) con un
  destello de acento (`shadowBlur` lima) que decae. Implementado en
  `ARCanvas._drawStroke()`.
- **Pulso de estado** (`dot--live`, `dot--rec`): parpadeo binario cada
  0.5–0.8s, sin easing de opacidad continua.
- **`prefers-reduced-motion: reduce`**: todas las transiciones/animaciones caen
  a ~0. El draw-on se vuelve instantáneo, el pulso queda fijo en encendido, los
  pings de puntero pierden la expansión (aparecen como un anillo fijo que solo
  se desvanece). Ver el bloque `@media` al final de `design-system.css` y
  `ARCanvas.reduceMotion` / los checks de `matchMedia` en el JS de las páginas.

## Componentes

Clases documentadas en `design-system.css`, en el mismo orden que el encargo:

1. **`.viewer`** — `<video>` + `<canvas>` de anotación superpuestos,
   `.viewer__brackets` (corchetes de esquina) y `.viewer__reticle` (retícula
   central, visible solo con `.viewer--pointing`).
2. **`.hud`** — franja mono: `.bars` (barras de señal, `data-level` 0–4),
   `.hud__metric` (con modificadores `.is-warn` / `.is-critical` por umbral),
   alimentada por `js/ui.js`’s `Hud` con datos reales de `getStats()`.
3. **`.pill` / `.pill--live` / `.pill--rec`** — mono, mayúsculas, con `.dot`
   pulsante (`.dot--live` acento, `.dot--rec` crítico).
4. **`.toolkit` / `.tool`** — la herramienta activa lleva `aria-pressed="true"`
   y un subrayado de acento (`::after`), nunca un relleno. `.swatches` para
   color de anotación.
5. **`.btn--primary`** — relleno lima, texto `--on-accent`, sin borde,
   `border-radius` ≤ 4px. Una por pantalla.
6. **`.tray--dock`** (escritorio, flotante) / **`.tray--sheet`** (bottom sheet
   móvil) — el único elemento con `box-shadow` (`--shadow-float`), junto con
   `.modal__card`. `.fab` / `.fab--primary` para objetivos táctiles ≥56px.
7. **`.syscheck`** — filas que resuelven `CHECKING…` → `OK` / crítico. Motor en
   `runSystemsCheck()` (`js/ui.js`); usado en la puerta de conexión de
   `field-tech.html`.
8. **`.toast-stack` / `.toast`** — entra desde el borde superior, mono,
   auto-dismiss. Disparado por `toast()` en `js/ui.js`.

## Campo vs. oficina

- **`field-tech.html`** (teléfono): cámara a pantalla completa, chrome mínimo,
  objetivos táctiles ≥56px (`.fab`, `.fab--primary` a 72px), una sola acción
  primaria visible ("Señalar"), estado de conexión siempre visible en el HUD
  superior, chequeo de sistemas antes de conectar.
- **`remote-expert.html`** (escritorio/tablet): más denso — paleta de
  herramientas persistente, HUD de telemetría completo, tray de controles,
  panel de notas/reporte, atajos de teclado (`p/d/a/o/t` para herramientas,
  `Cmd/Ctrl+Z` deshacer, `f` congelar). Requiere sesión (empresa); sin ella
  redirige a `login.html`.

## Cuenta y marca de empresa

- **`login.html`** — mismo lenguaje visual, sin HUD (no hay sesión de video
  todavía): tarjeta con pestañas *Iniciar sesión / Crear empresa / Unirme con
  código*. Usa `.tab[aria-pressed]`, el mismo patrón que la toolkit de
  anotación.
- **Ajustes → "Marca de tu empresa"** (en `remote-expert.html`): nombre de la
  empresa (editable solo por el `owner`, según la política RLS de
  `companies`), logo (sube a Storage, bucket `logos`), y el código de
  invitación para sumar compañeros de oficina. El logo/nombre se repiten como
  **membrete** (`.brandbar`) arriba del modal de invitar y del reporte —
  la única vez que un color de marca ajeno (el logo del cliente) convive con
  el sistema; se enmarca en una caja neutra, nunca reemplaza al acento.
- Ver [`README.md`](README.md) para el modelo de datos (Supabase) detrás de
  esto.

## Accesibilidad

- Contraste verificado ≥ 4.5:1 en texto sobre fondo en ambos temas; el lima
  **nunca** se usa como color de texto sobre superficies oscuras claras ni
  como texto en el tema claro — para eso existe `--accent-text`
  (`#4B7A00` en claro, el propio acento en oscuro).
- `:focus-visible` con anillo de 2px en `--accent` en todos los elementos
  interactivos.
- La consola de oficina es operable por teclado completo (atajos arriba).
- `prefers-reduced-motion: reduce` respetado en CSS y en el canvas de
  anotación (ver "Movimiento").
- **Pendiente / limitación conocida:** las herramientas de anotación ya se
  distinguen por forma (flecha, elipse, trazo, texto), pero los 4 colores de
  swatch dentro de una misma forma solo se distinguen por color. Para daltonismo
  estricto, el siguiente paso es variar también el patrón de línea (sólida /
  discontinua / punteada) por swatch — no implementado todavía.
