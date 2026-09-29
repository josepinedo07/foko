/**
 * FOKO - Tonos de llamada generados en el navegador (sin archivos de audio).
 *
 * Los navegadores no dejan sonar audio hasta que la persona toca la página:
 * el contexto se desbloquea en el primer toque/tecla. Si una llamada entra
 * antes de eso, el timbre queda mudo y avisan la tarjeta, la vibración, el
 * título de la pestaña y la notificación del sistema.
 */

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const unlock = () => { audio(); };
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', unlock, { capture: true });

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

function beep(c, freqs, start, dur, vol) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(vol, start + 0.02);
  g.gain.setValueAtTime(vol, start + dur - 0.04);
  g.gain.linearRampToValueAtTime(0, start + dur);
  g.connect(c.destination);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.frequency.value = f;
    o.connect(g);
    o.start(start);
    o.stop(start + dur);
  }
}

function loop(everyMs, play) {
  const tick = () => { const c = audio(); if (c) play(c, c.currentTime); };
  tick();
  const id = setInterval(tick, everyMs);
  return () => clearInterval(id);
}

/** Timbre de llamada entrante (oficina): doble repique cada 2 s. */
export function playRing() {
  return loop(2000, (c, t) => {
    beep(c, [440, 480], t, 0.4, 0.18);
    beep(c, [440, 480], t + 0.55, 0.4, 0.18);
  });
}

/** Tono de "llamando…" para quien llama: 1 s sonando, 3 s de silencio. */
export function playRingback() {
  return loop(4000, (c, t) => beep(c, [425], t, 1, 0.12));
}
