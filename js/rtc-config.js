/**
 * FOKO - Servidores ICE para WebRTC.
 *
 * - STUN: basta cuando ninguno de los dos lados tiene NAT restrictivo.
 * - TURN: necesario cuando la conexión P2P directa falla — típico con VPN
 *   (Surfshark, etc.), datos móviles / CGNAT (frecuente en Venezuela) o NAT
 *   simétrico. El TURN reenvía el audio/video por un servidor, así que
 *   SIEMPRE conecta — pero eso significa que el video de un cliente pasa por
 *   ese servidor.
 *
 * getIceServers() pide credenciales TURN de cuenta propia (Metered.ca) vía
 * api/turn-credentials.js — cortas, rotan solas, y quedan bajo la cuenta de
 * FOKO en vez del relay público de pruebas (openrelayproject/openrelayproject,
 * compartido por cualquiera en el mundo). Si el servidor no responde o la
 * cuenta de Metered no está configurada todavía, cae de vuelta al TURN público
 * — la llamada nunca se rompe por esto, solo pierde el refuerzo de seguridad.
 */

const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Respaldo si api/turn-credentials no está disponible o METERED_API_KEY aún
// no está configurada — el mismo TURN público de pruebas de siempre.
const FALLBACK_TURN = [
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export const ICE_SERVERS = [...STUN_SERVERS, ...FALLBACK_TURN];

export async function getIceServers() {
  try {
    const res = await fetch('/api/turn-credentials', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.iceServers) && data.iceServers.length) {
        return [...STUN_SERVERS, ...data.iceServers];
      }
    }
  } catch (_) { /* sin red / endpoint caído: seguimos con el respaldo */ }
  return ICE_SERVERS;
}
