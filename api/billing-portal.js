/** FOKO — POST /api/billing-portal — abre el Customer Portal de Stripe. */
import { stripe, STRIPE_ENABLED, callerOrgAdmin, siteBase } from './_stripe.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!STRIPE_ENABLED) return res.status(404).json({ error: 'Stripe no está habilitado' });

  const s = stripe();
  const ctx = await callerOrgAdmin(req);
  if (!ctx) return res.status(401).json({ error: 'No autorizado' });
  if (!ctx.company.stripe_customer_id) {
    return res.status(400).json({ error: 'Esta organización todavía no tiene facturación por Stripe.' });
  }

  try {
    const portal = await s.billingPortal.sessions.create({
      customer: ctx.company.stripe_customer_id,
      return_url: `${siteBase(req)}/billing.html`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Error de Stripe' });
  }
}
