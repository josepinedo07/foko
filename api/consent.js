/**
 * FOKO — POST /api/consent — registra la aceptación del aviso de cámara/
 * grabación en field-tech.html, para tener evidencia (timestamp, versión de
 * la política, IP, user agent) de que se pidió y se dio el consentimiento.
 *
 * Público, sin autenticación (field-tech se conecta sin cuenta). No bloquea
 * la conexión si falla — el checkbox del lado del cliente ya es la barrera
 * real; esto es solo el registro para poder demostrarlo después.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const POLICY_VERSION = 'privacidad-1.0-2026-09-08';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(200).json({ ok: false }); // no bloquear la conexión por esto
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const roomCode = String(body?.roomCode || '').trim().slice(0, 32).toUpperCase();
  if (!roomCode) return res.status(400).json({ error: 'Falta el código de sala' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const userAgent = (req.headers['user-agent'] || '').slice(0, 300) || null;

  const { error } = await db.from('consent_log').insert({
    room_code: roomCode, policy_version: POLICY_VERSION, ip, user_agent: userAgent,
  });

  return res.status(200).json({ ok: !error });
}
