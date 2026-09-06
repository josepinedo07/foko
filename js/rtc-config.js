/**
 * Servidores ICE para WebRTC.
 *
 * - STUN: basta cuando ninguno de los dos lados tiene NAT restrictivo.
 * - TURN: necesario cuando la conexión P2P directa falla — típico con VPN
 *   (Surfshark, etc.), datos móviles / CGNAT o NAT simétrico. El TURN reenvía
 *   el audio/video por un servidor, así que SIEMPRE conecta.
 *
 * Abajo van los TURN públicos y gratuitos de OpenRelay (Metered). Sirven para
 * pruebas. Para uso serio saca tu propia clave gratis (50 GB/mes) en
 * https://dashboard.metered.ca/  o monta coturn.
 */

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },

  // TURN público de pruebas (OpenRelay / Metered)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];
