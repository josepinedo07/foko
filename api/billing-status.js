/**
 * FOKO — GET /api/billing-status?checkout=<uuid>  (auth: usuario con sesión)
 *
 * La pantalla billing-success.html hace polling aquí hasta que el webhook
 * confirme el pago. No confía en el redirect para activar nada.
 *
 * Devuelve { status: 'pending'|'active'|'failed'|'expired', orgId?: uuid }.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configuración del servidor' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });
  const checkoutId = String(req.query.checkout || '').trim();
  if (!checkoutId) return res.status(400).json({ error: 'Falta el id de checkout' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Sesión inválida' });

  const { data: ck } = await db
    .from('billing_checkouts')
    .select('status, org_id, user_id')
    .eq('id', checkoutId)
    .maybeSingle();
  if (!ck || ck.user_id !== user.id) return res.status(404).json({ error: 'Checkout no encontrado' });

  const map = { completed: 'active', pending: 'pending', failed: 'failed', expired: 'expired' };
  return res.status(200).json({ status: map[ck.status] || 'pending', orgId: ck.org_id || null });
}
