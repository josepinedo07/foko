/**
 * FOKO — POST /api/billing-checkout  (auth: usuario con sesión)
 *
 * Body: { planId, interval?: 'month'|'year', orgName? }
 * - Sin organización  -> kind 'create' (pago para crear la org). orgName requerido.
 * - org_admin de una org -> kind 'upgrade' (cambio de plan / renovación).
 * - Otro rol -> 403.
 *
 * Crea la fila billing_checkouts (pending), pide la sesión de pago a la pasarela
 * y devuelve { checkoutUrl, checkoutId }. El frontend hace window.location = checkoutUrl.
 * La activación NO ocurre aquí: la confirma el webhook.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BILLING_PROVIDER, BILLING_WEBHOOK_SECRET.
 */

import { createClient } from '@supabase/supabase-js';
import { getGateway, amountFor } from './_billing/gateway.js';

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
  if (authErr || !user) return res.status(401).json({ error: 'Sesión inválida. Vuelve a iniciar sesión.' });

  const body = typeof req.body === 'object' && req.body ? req.body : safeJson(req.body);
  const planId = String(body.planId || '').trim();
  const interval = body.interval === 'year' ? 'year' : 'month';
  const orgName = String(body.orgName || '').trim();
  if (!planId) return res.status(400).json({ error: 'Falta el plan' });

  // Plan válido y visible
  const { data: plan } = await db.from('plans').select('*').eq('id', planId).maybeSingle();
  if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });
  if (plan.visible === false) return res.status(400).json({ error: 'Ese plan no está disponible' });

  // ¿Alta o upgrade?
  const { data: profile } = await db
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  let kind, orgId = null;
  if (!profile) {
    kind = 'create';
    if (!orgName) return res.status(400).json({ error: 'Escribe el nombre de tu organización' });
  } else if (profile.role === 'org_admin') {
    kind = 'upgrade';
    orgId = profile.company_id;
  } else {
    return res.status(403).json({ error: 'Solo el administrador de la organización puede cambiar el plan' });
  }

  const gateway = getGateway();
  const provider = (process.env.BILLING_PROVIDER || 'sim').toLowerCase();
  const amountCents = amountFor(plan, interval);

  const { data: checkout, error: ckErr } = await db
    .from('billing_checkouts')
    .insert({
      kind, user_id: user.id, email: user.email || null,
      org_id: orgId, org_name: kind === 'create' ? orgName : null,
      plan_id: planId, interval, provider,
    })
    .select('id')
    .single();
  if (ckErr) return res.status(500).json({ error: 'No se pudo iniciar el checkout' });

  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const baseUrl = process.env.PUBLIC_BASE_URL || `${proto}://${req.headers.host}`;

  let session;
  try {
    session = await gateway.createCheckoutSession({
      checkoutId: checkout.id, kind, orgId, orgName, planId, interval,
      userId: user.id, email: user.email || null,
      amountCents, currency: 'USD', baseUrl,
    });
  } catch (e) {
    await db.from('billing_checkouts').update({ status: 'failed' }).eq('id', checkout.id);
    return res.status(502).json({ error: 'La pasarela de pago no respondió. Intenta de nuevo.' });
  }

  await db.from('billing_checkouts')
    .update({ external_session_id: session.externalSessionId })
    .eq('id', checkout.id);

  return res.status(200).json({ checkoutUrl: session.checkoutUrl, checkoutId: checkout.id });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
