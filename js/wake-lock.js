/**
 * FOKO - Mantener la pantalla encendida durante la llamada.
 *
 * Si el teléfono se bloquea (30-60 s sin tocarlo, típico mientras el técnico
 * apunta la cámara), el navegador corta cámara y micrófono. El navegador
 * suelta el bloqueo al cambiar de pestaña, así que se vuelve a pedir al volver.
 * Sin soporte (navegadores viejos) no hace nada.
 */

let wanted = false;
let sentinel = null;

async function acquire() {
  if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch (_) { sentinel = null; }
}

document.addEventListener('visibilitychange', acquire);

export function keepAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (sentinel) { sentinel.release().catch(() => {}); sentinel = null; }
}
