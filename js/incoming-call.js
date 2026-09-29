/**
 * FOKO - Timbre de llamada entrante para la oficina.
 *
 * Escucha (Supabase Realtime) las solicitudes de llamada de la empresa que
 * entran por un enlace de llamada. Le suena a todos los técnicos de oficina
 * (org_admin / pro) que tengan FOKO abierto; el primero que contesta se
 * queda con la llamada (accept_call en SQL es atómico) y a los demás se les
 * apaga el timbre.
 */

import { toast } from './ui.js';
import { RING_SECONDS } from './limits.js';
import { playRing, audioReady } from './tones.js';

const OFFICE_ROLES = ['org_admin', 'pro'];

export function newRoomCode() {
  const b = new Uint8Array(3);
  crypto.getRandomValues(b);
  return 'FK-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Pide permiso para notificaciones del sistema (avisan con la pestaña en segundo plano). */
export async function enableCallAlerts() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch (_) {}
  }
  return Notification.permission;
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function injectStyles() {
  if (document.getElementById('callring-css')) return;
  const st = document.createElement('style');
  st.id = 'callring-css';
  st.textContent = `
    .callring {
      position: fixed; z-index: 400; top: calc(var(--s-4) + env(safe-area-inset-top)); left: 50%;
      transform: translateX(-50%); width: min(420px, calc(100vw - 2 * var(--s-3)));
      display: flex; align-items: center; gap: var(--s-4);
      padding: var(--s-4); background: var(--surface); color: var(--text);
      border: 1px solid var(--accent); border-radius: var(--r); box-shadow: var(--shadow-float);
    }
    .callring__icon {
      flex: none; width: 48px; height: 48px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: var(--accent); color: var(--on-accent); animation: callring-pulse 1s ease-in-out infinite;
    }
    .callring--busy { border-color: var(--border-strong); }
    .callring--busy .callring__icon { background: var(--surface-2); color: var(--text-dim); animation: none; }
    @keyframes callring-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
    @media (prefers-reduced-motion: reduce) { .callring__icon { animation: none; } }
    .callring__who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .callring__eyebrow { font-family: var(--font-mono); font-size: var(--fs-11); letter-spacing: var(--tracking-label); text-transform: uppercase; color: var(--accent-text); }
    .callring__name { font-size: var(--fs-16); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .callring__meta { font-size: var(--fs-12); color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .callring__actions { display: flex; flex-direction: column; gap: var(--s-2); flex: none; }
    .callring__actions .btn { min-width: 104px; }
  `;
  document.head.appendChild(st);
}

/**
 * @param {object} o
 * @param {object} o.supabase  cliente autenticado
 * @param {object} o.company   { id, name }
 * @param {string} o.role      rol del perfil
 * @param {string} o.userId
 * @param {() => boolean} [o.isBusy]  true si ya está en una llamada (no suena, no deja contestar)
 * @param {() => void} [o.onChange]   cualquier cambio en las llamadas de la empresa
 */
export function startCallListener({ supabase, company, role, userId, isBusy = () => false, onChange = () => {} }) {
  if (!company || !OFFICE_ROLES.includes(role)) return;
  injectStyles();

  const labels = new Map();     // link_id -> label del enlace
  const queue = new Map();      // id -> fila sonando
  const ignored = new Set();
  let current = null;
  let stopRing = null, tickTimer = null, titleTimer = null, notif = null;
  const baseTitle = document.title;

  const el = document.createElement('div');
  el.className = 'callring';
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-live', 'assertive');
  el.hidden = true;
  el.innerHTML = `
    <div class="callring__icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg></div>
    <div class="callring__who">
      <span class="callring__eyebrow" data-r="eyebrow">Llamada entrante</span>
      <strong class="callring__name" data-r="name"></strong>
      <span class="callring__meta" data-r="meta"></span>
    </div>
    <div class="callring__actions">
      <button class="btn btn--primary" data-r="accept">Contestar</button>
      <button class="btn btn--ghost" data-r="ignore">Ignorar</button>
    </div>`;
  document.body.appendChild(el);
  const q = (k) => el.querySelector(`[data-r="${k}"]`);

  const remainingMs = (row) => RING_SECONDS * 1000 - Math.max(0, Date.now() - Date.parse(row.created_at));

  async function labelFor(row) {
    if (labels.has(row.link_id)) return labels.get(row.link_id);
    const { data } = await supabase.from('call_links').select('label').eq('id', row.link_id).maybeSingle();
    const label = (data && data.label) || '';
    labels.set(row.link_id, label);
    return label;
  }

  function stopAlerts() {
    if (stopRing) { stopRing(); stopRing = null; }
    clearInterval(tickTimer); clearInterval(titleTimer);
    document.title = baseTitle;
    if (notif) { try { notif.close(); } catch (_) {} notif = null; }
    if (navigator.vibrate) navigator.vibrate(0);
  }

  function hide() {
    stopAlerts();
    current = null;
    el.hidden = true;
    const next = [...queue.values()].find((r) => remainingMs(r) > 0);
    if (next) show(next);
  }

  async function show(row) {
    current = row;
    const label = await labelFor(row);
    if (current !== row) return;
    const busy = isBusy();
    el.classList.toggle('callring--busy', busy);
    q('eyebrow').textContent = busy ? 'Llamada entrante · estás en otra llamada' : 'Llamada entrante';
    q('name').textContent = row.caller_name;
    q('accept').hidden = busy;
    q('accept').disabled = false;
    q('ignore').textContent = busy ? 'Cerrar' : 'Ignorar';
    const meta = () => {
      const s = Math.max(0, Math.ceil(remainingMs(row) / 1000));
      q('meta').innerHTML = `${label ? esc(label) + ' · ' : ''}${s}s`;
    };
    meta();
    el.hidden = false;

    tickTimer = setInterval(() => {
      if (remainingMs(row) <= 0) {
        queue.delete(row.id);
        if (current === row) { hide(); toast(`Llamada perdida de ${row.caller_name}`, 'warn', 6000); }
        return;
      }
      meta();
    }, 500);

    if (busy) return;
    stopRing = playRing();
    if (navigator.vibrate) navigator.vibrate([400, 200, 400, 1000, 400, 200, 400]);
    let on = false;
    titleTimer = setInterval(() => { on = !on; document.title = on ? `● Llamada de ${row.caller_name}` : baseTitle; }, 1000);
    // Aviso del sistema si la pestaña no está a la vista o el navegador aún no deja sonar.
    if ('Notification' in window && Notification.permission === 'granted' && (document.hidden || !audioReady())) {
      try {
        notif = new Notification(`${row.caller_name} está llamando`, {
          body: label ? `Enlace: ${label} · FOKO` : 'FOKO', tag: 'foko-call-' + row.id, requireInteraction: true,
        });
        notif.onclick = () => { window.focus(); notif && notif.close(); };
      } catch (_) {}
    }
  }

  q('ignore').addEventListener('click', () => {
    if (!current) return;
    ignored.add(current.id);
    queue.delete(current.id);
    hide();
  });

  q('accept').addEventListener('click', async () => {
    const row = current;
    if (!row) return;
    q('accept').disabled = true;
    stopAlerts();
    const code = newRoomCode();
    const { data: ok, error } = await supabase.rpc('accept_call', { p_id: row.id, p_room: code });
    if (error || !ok) {
      queue.delete(row.id);
      hide();
      toast(error ? 'No se pudo contestar: ' + error.message : 'Otro compañero ya contestó o se venció la llamada', 'warn', 5000);
      return;
    }
    const label = labels.get(row.link_id) || '';
    location.href = `remote-expert.html?room=${code}&caller=${encodeURIComponent(row.caller_name)}&label=${encodeURIComponent(label)}`;
  });

  function handle(row) {
    if (!row || !row.id) return;
    onChange();
    if (row.status === 'ringing') {
      if (ignored.has(row.id) || remainingMs(row) <= 0) return;
      queue.set(row.id, row);
      if (!current) show(row);
      return;
    }
    const wasShown = current && current.id === row.id;
    queue.delete(row.id);
    if (!wasShown) return;
    hide();
    if (row.status === 'accepted' && row.answered_by !== userId) toast(`Un compañero contestó la llamada de ${row.caller_name}`, 'info', 5000);
    else if (row.status === 'cancelled') toast(`${row.caller_name} colgó antes de que contestaras`, 'info', 5000);
    else if (row.status === 'missed') toast(`Llamada perdida de ${row.caller_name}`, 'warn', 6000);
  }

  supabase
    .channel('calls-' + company.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'call_requests', filter: `company_id=eq.${company.id}` },
      (payload) => handle(payload.new))
    .subscribe();

  // Llamadas que ya estaban sonando al abrir la página.
  supabase.from('call_requests')
    .select('id, link_id, caller_name, status, created_at, answered_by')
    .eq('company_id', company.id).eq('status', 'ringing')
    .gte('created_at', new Date(Date.now() - RING_SECONDS * 1000).toISOString())
    .then(({ data }) => (data || []).forEach(handle));
}
