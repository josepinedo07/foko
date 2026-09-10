/**
 * FOKO — POST /api/billing-portal  (auth: org_admin)
 *
 * Devuelve { url } al portal de la pasarela para cambiar tarjeta / cancelar,
 * o { url: null } cuando la pasarela es prepago (no hay portal): el frontend
 * muestra entonces las instrucciones de "Renovar ahora".
 */

import { createClient } from '@supabase/supabase-js';
import { getGateway } from './_billing/gateway.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configuración del servidor' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Sesión inválida' });

  const { data: profile } = await db
    .from('profiles').select('company_id, role').eq('user_id', user.id).maybeSingle();
  if (!profile || profile.role !== 'org_admin') {
    return res.status(403).json({ error: 'Solo el administrador puede gestionar el pago' });
  }

  const gateway = getGateway();
  let url = null;
  try {
    url = await gateway.createPortalUrl({ orgId: profile.company_id });
  } catch (_) { url = null; }

  return res.status(200).json({
    url,
    autoRecurring: !!gateway.capability?.autoRecurring,
  });
}
