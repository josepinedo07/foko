/**
 * FOKO — POST /api/log — ingesta de errores de cliente (best-effort).
 * Lo llama js/errlog.js. Escribe en client_errors con service role.
 *
 * Defensa contra abuso: cap de tamaño de payload, límite simple por IP en
 * memoria (se reinicia con cada cold start; suficiente para spam casual) y
 * verificación de Origin.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const HITS = new Map(); // ip -> { n, ts }
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

const ALLOWED_HOST = /(^|\.)fokoremote\.com$|\.vercel\.app$|josepinedo07\.github\.io$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const origin = req.headers.origin || '';
    if (origin) {
      const h = new URL(origin).hostname;
      if (!ALLOWED_HOST.test(h)) return res.status(204).end();
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const now = Date.now();
    const rec = HITS.get(ip);
    if (rec && now - rec.ts < WINDOW_MS) {
      if (rec.n >= MAX_PER_WINDOW) return res.status(204).end();
      rec.n++;
    } else {
      HITS.set(ip, { n: 1, ts: now });
    }
    if (HITS.size > 5000) HITS.clear();

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(204).end();

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

    const row = {
      user_id: /^[0-9a-f-]{36}$/i.test(body?.user_id || '') ? body.user_id : null,
      page: clip(body?.page, 200),
      message: clip(body?.message, 500),
      stack: clip(body?.stack, 4000),
      ua: clip(body?.ua, 300),
    };
    if (!row.message) return res.status(204).end();

    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await db.from('client_errors').insert(row);
    return res.status(204).end();
  } catch (_) {
    return res.status(204).end();
  }
}
