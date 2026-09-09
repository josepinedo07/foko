/**
 * FOKO — helpers de Stripe. Todo el módulo está detrás del flag
 * BILLING_STRIPE_ENABLED. Si está apagado, los endpoints responden 404 y el
 * flujo de facturación es 100% manual (el superadmin mueve companies.status).
 *
 * Env vars: BILLING_STRIPE_ENABLED, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const STRIPE_ENABLED =
  ['1', 'true', 'yes'].includes(String(process.env.BILLING_STRIPE_ENABLED || '').toLowerCase());

export function stripe() {
  if (!STRIPE_ENABLED || !process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function admin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resuelve al org_admin que llama. null si no lo es. */
export async function callerOrgAdmin(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const db = admin();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await db.from('profiles').select('company_id, role').eq('user_id', user.id).single();
  if (!p || p.role !== 'org_admin') return null;
  const { data: c } = await db.from('companies').select('*').eq('id', p.company_id).single();
  return c ? { user, company: c, db } : null;
}

const ALLOWED = /(^|\.)fokoremote\.com$|\.vercel\.app$/;
export function siteBase(req) {
  const o = req.headers.origin || '';
  try { if (o && ALLOWED.test(new URL(o).hostname)) return o; } catch (_) {}
  return 'https://fokoremote.com';
}

/** Mapea el status de una suscripción de Stripe al status de companies. */
export function mapSubStatus(s) {
  switch (s) {
    case 'active':
    case 'trialing': return 'active';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled':
    case 'incomplete_expired': return 'canceled';
    case 'paused': return 'paused';
    default: return null;
  }
}
