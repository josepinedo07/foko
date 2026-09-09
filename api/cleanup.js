/**
 * FOKO — GET /api/cleanup — tarea programada (cron de Vercel, ver vercel.json).
 *
 * Borra las grabaciones fuera del plazo de retención **del plan de cada
 * organización** (plans.retention_days), no un valor global. La lógica de qué
 * sesión venció vive en la RPC public.expired_sessions().
 *
 * Protegida: Vercel manda `Authorization: Bearer ${CRON_SECRET}`.
 * Env vars: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || auth !== secret) return res.status(401).json({ error: 'No autorizado' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' });
  }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Sesiones vencidas según el retention_days del plan de su org (máx 500/corrida).
    const { data: expired, error: qErr } = await db.rpc('expired_sessions', { p_limit: 500 });
    if (qErr) throw qErr;
    if (!expired || !expired.length) {
      return res.status(200).json({ ok: true, deleted: 0 });
    }

    const paths = expired.flatMap((s) => s.paths || []).filter(Boolean);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: sErr } = await db.storage.from('sessions').remove(paths.slice(i, i + 100));
      if (sErr) console.error('storage remove', sErr.message);
    }

    const ids = expired.map((s) => s.id);
    const { error: dErr } = await db.from('sessions').delete().in('id', ids);
    if (dErr) throw dErr;

    return res.status(200).json({ ok: true, deleted: ids.length, files: paths.length });
  } catch (err) {
    console.error('cleanup', err);
    return res.status(500).json({ error: err?.message || 'Error en la limpieza' });
  }
}
