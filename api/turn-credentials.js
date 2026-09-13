/**
 * FOKO — GET /api/turn-credentials
 *
 * Acuña una credencial TURN de corta duración en la cuenta de Metered.ca de
 * FOKO (POST con la secret key, que se queda en el servidor) y devuelve solo
 * el usuario/contraseña temporales — nunca la secret key. Con esto las
 * llamadas dejan de relayarse por el TURN público de pruebas
 * (openrelayproject/openrelayproject, compartido por cualquiera).
 *
 * Sin autenticación de Supabase a propósito: field-tech.html conecta sin
 * cuenta (enlace anónimo por código de sala), así que el pedido de ICE tiene
 * que poder hacerse antes de cualquier login. La credencial que se entrega
 * expira sola (1h) y solo sirve para relayar tráfico, no da acceso a nada de
 * FOKO — en el peor caso alguien consume cuota del plan de Metered.
 *
 * Si METERED_SECRET_KEY / METERED_SUBDOMAIN no están configuradas, o Metered
 * no responde, devuelve una lista vacía — js/rtc-config.js cae de vuelta al
 * TURN público, la llamada nunca se rompe por esto.
 *
 * Env vars: METERED_SECRET_KEY, METERED_SUBDOMAIN (el subdominio
 * *.metered.live que asigna el dashboard, ej. "fokoremote").
 */

const CREDENTIAL_TTL_SECONDS = 3600; // cubre de sobra el límite de 30 min de sesión

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const secretKey = process.env.METERED_SECRET_KEY;
  const subdomain = process.env.METERED_SUBDOMAIN;
  if (!secretKey || !subdomain) {
    return res.status(200).json({ iceServers: [] });
  }

  try {
    const url = `https://${subdomain}.metered.live/api/v1/turn/credential?secretKey=${encodeURIComponent(secretKey)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'foko-call', expiryInSeconds: CREDENTIAL_TTL_SECONDS }),
    });
    if (!r.ok) return res.status(200).json({ iceServers: [] });

    const cred = await r.json();
    if (!cred.username || !cred.password) return res.status(200).json({ iceServers: [] });

    // Patrón de URLs fijo de Metered para el relay global; solo cambian el
    // usuario/contraseña de la credencial recién acuñada.
    const iceServers = [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: 'turn:global.relay.metered.ca:80', username: cred.username, credential: cred.password },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: cred.username, credential: cred.password },
      { urls: 'turn:global.relay.metered.ca:443', username: cred.username, credential: cred.password },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: cred.username, credential: cred.password },
    ];

    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).json({ iceServers });
  } catch (_) {
    return res.status(200).json({ iceServers: [] });
  }
}
