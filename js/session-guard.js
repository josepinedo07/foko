/**
 * FOKO — sesión única por perfil. "Gana el último login".
 *
 * Al cargar una página protegida se llama a guardSession(session):
 *  1. Registra este dispositivo como la sesión vigente del perfil (claim_session).
 *     Si había otra, la DB anota un "takeover" y esa sesión queda superada.
 *  2. Escucha en realtime la fila del perfil en active_sessions. Si el
 *     session_id vigente deja de ser el nuestro → esta pestaña fue desplazada:
 *     cerramos sesión y mandamos a login.html?superseded=1.
 *  3. Respaldo: al volver a la pestaña se revalida con session_is_current().
 *
 * El enforcement duro vive en RLS (una sesión superada no lee ni escribe
 * sessions/session_media). Esto es la capa de UX.
 */

import { supabase } from './supabase-client.js';

/** session_id del JWT actual (claim que agrega GoTrue v2). */
function sessionIdFromJwt(session) {
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.session_id || null;
  } catch (_) {
    return null;
  }
}

function deviceLabel() {
  const ua = navigator.userAgent || '';
  const m = ua.match(/\((.*?)\)/);
  return (m ? m[1] : ua).slice(0, 120) + ' · ' + (navigator.platform || '');
}

let handled = false;
async function supersede(reason) {
  if (handled) return;
  handled = true;
  try { await supabase.auth.signOut(); } catch (_) {}
  location.replace('login.html?superseded=1' + (reason ? '&r=' + reason : ''));
}

export async function guardSession(session) {
  if (!session) return { ok: false };
  const mySid = sessionIdFromJwt(session);
  const uid = session.user.id;

  let claim = null;
  try {
    const { data } = await supabase.rpc('claim_session', { p_device: deviceLabel(), p_ip: null });
    claim = data || null;
  } catch (_) {}

  // Realtime: si la fila del perfil cambia y el session_id ya no es el nuestro.
  supabase
    .channel('sess-guard-' + uid)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'active_sessions', filter: 'profile_id=eq.' + uid },
      (payload) => {
        const row = payload.new || {};
        if (row.session_id && mySid && row.session_id !== mySid) supersede('rt');
      },
    )
    .subscribe();

  // Respaldo: revalidar al volver a la pestaña (realtime puede perderse).
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || handled) return;
    try {
      const { data: current } = await supabase.rpc('session_is_current');
      if (current === false) supersede('poll');
    } catch (_) {}
  });

  return { ok: true, sharedAccount: !!(claim && claim.shared_account) };
}
