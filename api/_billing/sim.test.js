/**
 * Prueba del adapter sim. Corre:  node api/_billing/sim.test.js
 * No usa runner: assert + salida por consola. Exit != 0 si algo falla.
 */

import assert from 'node:assert/strict';
import { simGateway } from './sim.js';

process.env.BILLING_WEBHOOK_SECRET = 'test-secret';
const g = simGateway();
let ok = 0;

async function t(name, fn) {
  try { await fn(); console.log('PASS', name); ok++; }
  catch (e) { console.error('FAIL', name, '\n  ', e.message); process.exitCode = 1; }
}

await t('capability.autoRecurring es false', () => {
  assert.equal(g.capability.autoRecurring, false);
});

const sess = await g.createCheckoutSession({
  checkoutId: 'ck_1', kind: 'create', planId: 'equipo', interval: 'month',
  orgName: 'ACME', email: 'a@b.co', amountCents: 3900, currency: 'USD', baseUrl: 'https://x.test',
});
const token = new URL(sess.checkoutUrl, 'https://x.test').searchParams.get('t');

await t('checkoutUrl apunta a checkout-sim.html con token', () => {
  assert.match(sess.checkoutUrl, /\/checkout-sim\.html\?t=/);
  assert.ok(token && token.includes('.'));
});

await t('parseWebhook acepta un token válido (paid)', async () => {
  const evt = await g.parseWebhook(JSON.stringify({ token, outcome: 'paid' }), {});
  assert.equal(evt.type, 'payment.succeeded');
  assert.equal(evt.checkoutId, 'ck_1');
  assert.equal(evt.amountCents, 3900);
});

await t('parseWebhook mapea outcome failed', async () => {
  const evt = await g.parseWebhook(JSON.stringify({ token, outcome: 'failed' }), {});
  assert.equal(evt.status, 'failed');
});

await t('parseWebhook RECHAZA firma inválida', async () => {
  const bad = token.split('.')[0] + '.deadbeef';
  await assert.rejects(() => g.parseWebhook(JSON.stringify({ token: bad, outcome: 'paid' }), {}), /firma inválida/);
});

await t('parseWebhook RECHAZA token de otra clave', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'otra-clave';
  const other = simGateway();
  await assert.rejects(() => other.parseWebhook(JSON.stringify({ token, outcome: 'paid' }), {}), /firma inválida/);
  process.env.BILLING_WEBHOOK_SECRET = 'test-secret';
});

await t('createPortalUrl es null (prepago)', async () => {
  assert.equal(await g.createPortalUrl({ orgId: 'x' }), null);
});

console.log(`\n${ok} pruebas OK`);
