/**
 * FOKO — POST /api/stripe-webhook — sincroniza companies con Stripe.
 *
 * Eventos: checkout.session.completed, customer.subscription.updated,
 * customer.subscription.deleted, invoice.payment_failed.
 * Idempotente: cada event.id se registra en stripe_events y se ignora si ya
 * se procesó.
 *
 * Necesita el body crudo para verificar la firma → bodyParser desactivado.
 * Env vars: STRIPE_WEBHOOK_SECRET (+ las de _stripe.js).
 */
import { stripe, STRIPE_ENABLED, admin, mapSubStatus } from './_stripe.js';

export const config = { api: { bodyParser: false } };

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!STRIPE_ENABLED) return res.status(404).end();

  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return res.status(500).end();

  let event;
  try {
    const raw = await readRaw(req);
    event = s.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (err) {
    return res.status(400).json({ error: `Firma inválida: ${err.message}` });
  }

  const db = admin();

  // Idempotencia
  const { error: dupErr } = await db.from('stripe_events').insert({ event_id: event.id, type: event.type });
  if (dupErr) {
    // clave duplicada → ya procesado
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    const patchByCustomer = async (customerId, patch) => {
      if (!customerId) return;
      await db.from('companies').update(patch).eq('stripe_customer_id', customerId);
    };
    const patchById = async (companyId, patch) => {
      if (!companyId) return;
      await db.from('companies').update(patch).eq('id', companyId);
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object;
        const companyId = sess.client_reference_id || sess.metadata?.company_id;
        await patchById(companyId, {
          stripe_customer_id: sess.customer,
          billing_mode: 'stripe',
          status: 'active',
          trial_ends_at: null,
          past_due_since: null,
        });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const mapped = mapSubStatus(sub.status);
        const qty = sub.items?.data?.[0]?.quantity;
        const patch = {};
        if (mapped) patch.status = mapped;
        if (mapped === 'past_due') patch.past_due_since = new Date().toISOString();
        if (mapped === 'active') patch.past_due_since = null;
        if (qty && Number.isFinite(qty)) patch.seat_limit = qty;
        if (Object.keys(patch).length) await patchByCustomer(sub.customer, patch);
        break;
      }
      case 'customer.subscription.deleted': {
        await patchByCustomer(event.data.object.customer, { status: 'canceled' });
        break;
      }
      case 'invoice.payment_failed': {
        await patchByCustomer(event.data.object.customer, {
          status: 'past_due', past_due_since: new Date().toISOString(),
        });
        break;
      }
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    // Deja el evento marcado como procesado igual (evita bucles); loguea.
    console.error('stripe-webhook', event.type, err);
    return res.status(200).json({ received: true, error: err.message });
  }
}
