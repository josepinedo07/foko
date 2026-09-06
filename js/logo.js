/**
 * FOKO — wordmark reutilizable ("<Logo>" en un stack sin framework).
 *
 * Un solo trazo cursivo (Caveat 600), minúsculas, con un punto de acento
 * opcional sobre la última "o" — el "foco". El color lo decide la clase
 * `.logo` vía el token `--brand-ink` (lima en oscuro, negro en claro; el SVG
 * usa fill="currentColor" para heredarlo — así el mismo <svg> sirve para las
 * dos variantes "on-dark" / "on-light" sin duplicar markup).
 *
 * Referencia tipográfica: Caveat 600. Ver BRAND.md para la ruta de
 * producción (redibujar como trazo monolínea en outline, sin depender de la
 * fuente web).
 */

export const LOGO_VIEWBOX = '0 0 320 132';

export function logoSvg({ showDot = true } = {}) {
  const dot = showDot ? '<circle class="logo-dot" cx="210" cy="66" r="4.5" fill="currentColor"></circle>' : '';
  return (
    `<svg class="logo-mark" viewBox="${LOGO_VIEWBOX}" role="img" aria-label="foko">` +
    `<text class="logo-word" x="160" y="94" text-anchor="middle" font-family="Caveat, cursive" font-weight="600" font-size="104" fill="currentColor">foko</text>` +
    dot +
    `</svg>`
  );
}

/**
 * Inserta el wordmark en `el` y reubica el punto sobre la última "o" en
 * cuanto la fuente Caveat termina de cargar (si no se hace, el punto queda
 * mal puesto con la fuente de reserva mientras Caveat llega por red).
 */
export function mountLogo(el, { showDot = true, height = 40 } = {}) {
  if (!el) return;
  el.classList.add('logo');
  el.style.setProperty('--logo-h', `${height}px`);
  el.innerHTML = logoSvg({ showDot });
  if (showDot) placeDot(el);
}

function placeDot(el) {
  const svg = el.querySelector('svg');
  const word = svg && svg.querySelector('.logo-word');
  const dot = svg && svg.querySelector('.logo-dot');
  if (!word || !dot || typeof word.getExtentOfChar !== 'function') return;

  const place = () => {
    try {
      const ext = word.getExtentOfChar(word.textContent.length - 1);
      dot.setAttribute('cx', (ext.x + ext.width / 2).toFixed(1));
      dot.setAttribute('cy', (ext.y + ext.height / 2).toFixed(1));
    } catch (_) { /* la fuente aún no tiene métricas listas */ }
  };

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  window.addEventListener('load', place, { once: true });
  setTimeout(place, 350);
  setTimeout(place, 1200);
}
