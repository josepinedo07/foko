/**
 * FOKO — GET /api/cleanup — tarea programada (cron de Vercel, ver vercel.json).
 *
 * Borra sesiones del historial con más de RETENTION_MONTHS meses (por defecto 24)
 * y sus archivos del bucket privado `sessions`. Coincide con el plazo de
 * conservación de la Política de Privacidad.
 *
 * Protegida: Vercel manda `Authorization: Bearer ${CRON_SECRET}` si esa env var
 * está configurada. Sin CRON_SECRET la ruta queda abierta a cualquiera, así que
 * es obligatoria en producción.
 *
 * Env vars: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const RETENTION_MONTHS = Number(process.env.RETENTION_MONTHS || 24);

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || auth !== secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' });
  }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);

  try {
    // Sesiones vencidas (máximo 500 por corrida; el cron es diario).
    const { data: old, error: qErr } = await db
      .from('sessions')
      .select('id, session_media ( storage_path )')
      .lt('created_at', cutoff.toISOString())
      .limit(500);
    if (qErr) throw qErr;

    if (!old || !old.length) {
      return res.status(200).json({ ok: true, deleted: 0, cutoff: cutoff.toISOString() });
    }

    const paths = old.flatMap((s) => (s.session_media || []).map((m) => m.storage_path)).filter(Boolean);
    // Storage: borrar en lotes de 100.
    for (let i = 0; i < paths.length; i += 100) {
      const { error: sErr } = await db.storage.from('sessions').remove(paths.slice(i, i + 100));
      if (sErr) console.error('storage remove', sErr.message);
    }

    // Filas (session_media cae por ON DELETE CASCADE).
    const ids = old.map((s) => s.id);
    const { error: dErr } = await db.from('sessions').delete().in('id', ids);
    if (dErr) throw dErr;

    return res.status(200).json({
      ok: true, deleted: ids.length, files: paths.length, cutoff: cutoff.toISOString(),
    });
  } catch (err) {
    console.error('cleanup', err);
    return res.status(500).json({ error: err?.message || 'Error en la limpieza' });
  }
}
