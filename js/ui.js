/* FOKO — primitivas de UI con estado en vivo (toast + HUD de conexión).
   Nada aquí inventa datos: el HUD lee getStats() real del RTCPeerConnection. */

/* -- 8 · Toast ----------------------------------------------------------- */
function stack() {
  let s = document.querySelector('.toast-stack');
  if (!s) {
    s = document.createElement('div');
    s.className = 'toast-stack';
    document.body.appendChild(s);
  }
  return s;
}

export function toast(message, kind = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  stack().appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 200);
  }, ms);
  return el;
}

/* -- 2 · HUD de conexión ---------------------------------------------------
   Espera en `root` elementos con [data-hud="bars|lat|res|fps|time"].
   `pc()` debe devolver el RTCPeerConnection (o null); `video` el <video>. */
export class Hud {
  constructor({ root, pc, video, since }) {
    this.root = root;
    this.pc = pc || (() => null);
    this.video = video || null;
    this.since = since || (() => null);
    this.timer = null;
    this._lastBytes = 0;
    this._lastTs = 0;
  }

  start() {
    this.stop();
    this._tick();
    this.timer = setInterval(() => this._tick(), 2000);
    this._clock = setInterval(() => this._renderClock(), 1000);
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this._clock);
    this.timer = this._clock = null;
  }

  _el(name) { return this.root.querySelector(`[data-hud="${name}"]`); }

  _renderClock() {
    const el = this._el('time');
    if (!el) return;
    const start = this.since();
    if (!start) { el.textContent = '00:00:00'; return; }
    const s = Math.floor((Date.now() - start) / 1000);
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
  }

  _res() {
    const v = this.video;
    if (!v || !v.videoHeight) return null;
    const h = v.videoHeight;
    const std = [2160, 1440, 1080, 720, 540, 480, 360].find((x) => Math.abs(x - h) <= 40);
    return std ? `${std}P` : `${v.videoWidth}×${h}`;
  }

  async _tick() {
    const resEl = this._el('res');
    if (resEl) resEl.textContent = this._res() || '—';

    const pc = this.pc();
    if (!pc || typeof pc.getStats !== 'function') return;

    let rttMs = null, loss = 0, fps = null;
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.nominated || r.state === 'succeeded') && r.currentRoundTripTime != null) {
          if (!pair || (r.bytesReceived || 0) > (pair.bytesReceived || 0)) pair = r;
        }
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          if (r.framesPerSecond != null) fps = Math.round(r.framesPerSecond);
          const lost = r.packetsLost || 0;
          const recv = r.packetsReceived || 0;
          if (recv + lost > 0) loss = lost / (recv + lost);
        }
        if (r.type === 'remote-inbound-rtp' && r.roundTripTime != null && rttMs == null) {
          rttMs = Math.round(r.roundTripTime * 1000);
        }
      });
      if (pair && pair.currentRoundTripTime != null) rttMs = Math.round(pair.currentRoundTripTime * 1000);
    } catch (_) { /* getStats puede fallar puntualmente */ }

    // Latencia
    const latEl = this._el('lat');
    if (latEl) {
      latEl.textContent = rttMs == null ? '— MS' : `${rttMs} MS`;
      latEl.classList.toggle('is-warn', rttMs != null && rttMs >= 150 && rttMs < 350);
      latEl.classList.toggle('is-critical', rttMs != null && rttMs >= 350);
    }

    // FPS
    const fpsEl = this._el('fps');
    if (fpsEl) fpsEl.textContent = fps == null ? '—' : `${fps} FPS`;

    // Barras de señal a partir de rtt + pérdida
    const barsEl = this._el('bars');
    if (barsEl) {
      let level = 4;
      if (rttMs == null) level = 1;
      else if (rttMs > 500 || loss > 0.08) level = 1;
      else if (rttMs > 300 || loss > 0.04) level = 2;
      else if (rttMs > 150 || loss > 0.02) level = 3;
      barsEl.dataset.level = String(level);
    }
  }
}

/* -- 7 · Systems check ---------------------------------------------------
   checks: [{ key, label, run: async () => true|string(errमsg) }]
   Actualiza filas .syscheck__row[data-key] con estados CHECKING… → OK / FALLA. */
export async function runSystemsCheck(rootEl, checks) {
  const results = {};
  for (const c of checks) {
    const row = rootEl.querySelector(`.syscheck__row[data-key="${c.key}"]`);
    const state = row && row.querySelector('.syscheck__state');
    if (row) { row.className = 'syscheck__row is-checking'; }
    if (state) state.innerHTML = '<span class="dot"></span>CHECKING…';
    let ok = false, detail = '';
    try {
      const r = await c.run();
      ok = r === true;
      if (typeof r === 'string') detail = r;
    } catch (e) { detail = e.message || 'error'; }
    results[c.key] = ok;
    if (row) row.className = `syscheck__row ${ok ? 'is-ok' : 'is-fail'}`;
    if (state) state.innerHTML = ok
      ? '<span class="dot dot--ok"></span>OK'
      : `<span class="dot dot--critical"></span>${(detail || 'FALLA').toUpperCase()}`;
  }
  return results;
}
