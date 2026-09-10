/**
 * FOKO — GET /api/billing-cron — tarea programada (cron de Vercel, ver vercel.json).
 *
 * Prepago / renovación manual:
 *  - Marca como past_due las orgs cuyo período venció (billing_lapse_overdue()).
 *  - Cancela las que llevan > 14 días en past_due.
 *  - Deja registrado en audit_log un aviso por cada org que vence en <= 3 días
 *    (el email vía Resend queda para después; el banner de /billing ya lo muestra).
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
    const { data, error } = await db.rpc('billing_lapse_overdue');
    if (error) throw error;

    const dueSoon = Array.isArray(data?.due_soon) ? data.due_soon : [];
    for (const org of dueSoon) {
      // Un aviso por org por día como máximo (dedupe por fecha en meta).
      const day = new Date().toISOString().slice(0, 10);
      const { data: seen } = await db
        .from('audit_log')
        .select('id')
        .eq('company_id', org.org_id)
        .eq('action', 'billing.renewal_due')
        .gte('created_at', day + 'T00:00:00Z')
        .maybeSingle();
      if (seen) continue;
      await db.from('audit_log').insert({
        company_id: org.org_id, actor: null, action: 'billing.renewal_due',
        target_type: 'company', target_id: org.org_id,
        meta: { current_period_end: org.current_period_end, day },
      });
    }

    return res.status(200).json({ ok: true, ...data, notified: dueSoon.length });
  } catch (err) {
    console.error('billing-cron', err);
    return res.status(500).json({ error: err?.message || 'Error en el cron de facturación' });
  }
}
