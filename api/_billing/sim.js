/**
 * FOKO — adapter de pasarela SIMULADA (sandbox). Prepago, sin recurrencia.
 *
 * No hay servidor de proveedor: la "firma" del webhook es un token HMAC que
 * este mismo servicio emite al crear la sesión de checkout. checkout-sim.html
 * lo devuelve tal cual junto al resultado ('paid' | 'failed'); aquí se verifica.
 *
 * Sustituir por dlocal.js / instapago.js / bancamiga.js sin tocar nada más.
 *
 * Env: BILLING_WEBHOOK_SECRET, PUBLIC_BASE_URL (o se infiere del request).
 */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const SECRET = () => process.env.BILLING_WEBHOOK_SECRET || 'dev-insecure-secret';

function sign(payloadB64) {
  return createHmac('sha256', SECRET()).update(payloadB64).digest('hex');
}
function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function makeToken(claims) {
  const body = b64url({ ...claims, iat: Date.now(), nonce: randomUUID() });
  return `${body}.${sign(body)}`;
}
function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) throw new Error('token mal formado');
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('firma inválida');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (Date.now() - claims.iat > 2 * 60 * 60 * 1000) throw new Error('token vencido');
  return claims;
}

export function simGateway() {
  return {
    capability: { autoRecurring: false },

    async createCheckoutSession({ checkoutId, kind, planId, interval, orgName, email, amountCents, currency, baseUrl }) {
      const externalSessionId = 'sim_' + randomUUID();
      const token = makeToken({
        checkoutId, externalSessionId, kind, planId, interval,
        orgName: orgName || null, email: email || null,
        amountCents, currency: currency || 'USD',
      });
      const base = baseUrl || process.env.PUBLIC_BASE_URL || '';
      const checkoutUrl = `${base}/checkout-sim.html?t=${encodeURIComponent(token)}`;
      return { checkoutUrl, externalSessionId };
    },

    /** rawBody: JSON string { token, outcome: 'paid'|'failed' }. */
    async parseWebhook(rawBody /*, headers */) {
      let body;
      try { body = JSON.parse(rawBody); } catch { throw new Error('cuerpo inválido'); }
      const claims = verifyToken(body.token); // lanza si la firma no cuadra
      const outcome = body.outcome === 'failed' ? 'failed' : 'succeeded';
      return {
        type: `payment.${outcome}`,
        eventId: `${claims.externalSessionId}:${outcome}`,
        checkoutId: claims.checkoutId,
        externalId: claims.externalSessionId,
        status: outcome,
        amountCents: claims.amountCents,
        currency: claims.currency,
        currentPeriodEnd: null, // lo calcula la ruta con periodEndFrom()
      };
    },

    async createPortalUrl() {
      return null; // prepago: no hay portal, se muestra "Renovar ahora"
    },

    async cancelSubscription() {
      // prepago: nada que cancelar del lado de la pasarela; el período corre hasta su fin.
    },
  };
}
