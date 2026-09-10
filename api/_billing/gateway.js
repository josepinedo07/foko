/**
 * FOKO — abstracción de pasarela de pago. El resto del código NUNCA importa
 * un proveedor concreto: pide getGateway() y usa la interfaz.
 *
 * Interfaz BillingGateway:
 *   createCheckoutSession({ checkoutId, kind, orgId, orgName, planId, interval,
 *                           userId, email, amountCents, currency })
 *       -> { checkoutUrl, externalSessionId }
 *   parseWebhook(rawBody, headers)
 *       -> { type, eventId, checkoutId, externalId, status, amountCents,
 *            currency, currentPeriodEnd } | lanza si la firma es inválida
 *   createPortalUrl({ orgId }) -> string | null
 *   cancelSubscription({ orgId }) -> void
 *   capability -> { autoRecurring: boolean }
 *
 * Proveedor por env BILLING_PROVIDER (default 'sim').
 */

import { simGateway } from './sim.js';

const REGISTRY = {
  sim: simGateway,
  // dlocal:   () => import('./dlocal.js').then(m => m.dlocalGateway()),
  // instapago: ...
  // bancamiga: ...
};

export function getGateway() {
  const name = (process.env.BILLING_PROVIDER || 'sim').toLowerCase();
  const factory = REGISTRY[name];
  if (!factory) throw new Error(`BILLING_PROVIDER desconocido: ${name}`);
  return factory();
}

/** Monto en centavos para un plan + intervalo. Anual = 10 meses (2 de regalo). */
export function amountFor(plan, interval) {
  const monthly = plan.price_cents || 0;
  return interval === 'year' ? monthly * 10 : monthly;
}

/** Fin de período a partir de ahora. */
export function periodEndFrom(interval, from = new Date()) {
  const d = new Date(from);
  if (interval === 'year') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
