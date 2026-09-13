/**
 * FOKO — GET /api/turn-credentials
 *
 * Devuelve credenciales TURN efímeras de la cuenta de Metered.ca de FOKO, para
 * que las llamadas dejen de relayarse por el TURN público de pruebas
 * (openrelayproject/openrelayproject, compartido por cualquiera). Las
 * credenciales de Metered ya son de corta duración y rotan solas, así que
 * exponerlas al cliente no compromete la cuenta — en el peor caso alguien
 * consume cuota del plan, no hay acceso a nada de FOKO.
 *
 * Sin autenticación a propósito: field-tech.html conecta sin cuenta de
 * Supabase (es un enlace anónimo por código de sala), así que el pedido de
 * turno de ICE tiene que poder hacerse antes de cualquier login.
 *
 * Si METERED_API_KEY / METERED_SUBDOMAIN no están configuradas, devuelve una
 * lista vacía — js/rtc-config.js cae de vuelta al TURN público, la llamada
 * nunca se rompe por esto.
 *
 * Env vars: METERED_API_KEY, METERED_SUBDOMAIN (el subdominio *.metered.live
 * que asigna el dashboard, ej. "foko" para foko.metered.live).
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const apiKey = process.env.METERED_API_KEY;
  const subdomain = process.env.METERED_SUBDOMAIN;
  if (!apiKey || !subdomain) {
    return res.status(200).json({ iceServers: [] });
  }

  try {
    const url = `https://${subdomain}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(200).json({ iceServers: [] });
    const iceServers = await r.json();
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).json({ iceServers: Array.isArray(iceServers) ? iceServers : [] });
  } catch (_) {
    return res.status(200).json({ iceServers: [] });
  }
}
