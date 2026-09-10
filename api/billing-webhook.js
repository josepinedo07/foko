/**
 * FOKO — POST /api/billing-webhook?provider=sim
 *
 * Recibe el evento de la pasarela con el cuerpo crudo, verifica la firma vía
 * el adapter, deduplica por event_id y aplica la transición en la DB
 * (process_billing_payment). Responde 200 rápido.
 *
 * La activación de la cuenta ocurre SOLO aquí, nunca por el redirect del navegador.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BILLING_PROVIDER, BILLING_WEBHOOK_SECRET.
 */

import { createClient } from '@supabase/supabase-js';
import { getGateway, periodEndFrom } from './_billing/gateway.js';

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configuración del servidor' });
  }

  const provider = String(req.query.provider || process.env.BILLING_PROVIDER || 'sim').toLowerCase();
  const raw = await readRaw(req);

  let evt;
  try {
    const gateway = getGateway();
    evt = await gateway.parseWebhook(raw, req.headers);
  } catch (e) {
    // Firma inválida / cuerpo corrupto: 400, no reintentar.
    return res.status(400).json({ error: 'Firma inválida' });
  }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Necesitamos el intervalo del checkout para calcular el fin de período.
  const { data: ck } = await db
    .from('billing_checkouts')
    .select('interval')
    .eq('id', evt.checkoutId)
    .maybeSingle();
  const interval = ck?.interval === 'year' ? 'year' : 'month';
  const periodEnd = evt.currentPeriodEnd || periodEndFrom(interval);

  const { data, error } = await db.rpc('process_billing_payment', {
    p_provider: provider,
    p_event_id: evt.eventId,
    p_checkout_id: evt.checkoutId,
    p_external_id: evt.externalId || null,
    p_status: evt.status === 'failed' ? 'failed' : 'succeeded',
    p_amount_cents: evt.amountCents || 0,
    p_currency: evt.currency || 'USD',
    p_period_end: periodEnd,
  });

  if (error) {
    // 500 -> la pasarela reintentará; process_billing_payment es idempotente.
    return res.status(500).json({ error: 'No se pudo procesar el evento' });
  }
  return res.status(200).json({ ok: true, result: data });
}
