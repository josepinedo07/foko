/**
 * FOKO — POST /api/stripe-checkout — inicia un Stripe Checkout para self-serve.
 * body: { plan_id, interval: 'month' | 'year' }
 * Devuelve { url }. Solo para org_admin. Detrás del flag.
 */
import { stripe, STRIPE_ENABLED, callerOrgAdmin, siteBase } from './_stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!STRIPE_ENABLED) return res.status(404).json({ error: 'Stripe no está habilitado' });

  const s = stripe();
  const ctx = await callerOrgAdmin(req);
  if (!ctx) return res.status(401).json({ error: 'No autorizado' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const planId = String(body?.plan_id || '');
  const interval = body?.interval === 'year' ? 'year' : 'month';

  const { data: plan } = await ctx.db.from('plans').select('*').eq('id', planId).single();
  if (!plan) return res.status(400).json({ error: 'Plan inválido' });
  const priceId = interval === 'year' ? plan.stripe_price_id_year : plan.stripe_price_id;
  if (!priceId) return res.status(400).json({ error: 'Ese plan no tiene precio configurado en Stripe' });

  try {
    const base = siteBase(req);
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: Math.max(1, ctx.company.seat_limit || 1) }],
      client_reference_id: ctx.company.id,
      customer: ctx.company.stripe_customer_id || undefined,
      customer_email: ctx.company.stripe_customer_id ? undefined : ctx.user.email,
      subscription_data: { metadata: { company_id: ctx.company.id, plan_id: planId } },
      metadata: { company_id: ctx.company.id, plan_id: planId },
      success_url: `${base}/billing.html?checkout=ok`,
      cancel_url: `${base}/billing.html?checkout=cancel`,
      allow_promotion_codes: true,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Error de Stripe' });
  }
}
