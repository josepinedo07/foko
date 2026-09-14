/**
 * FOKO — POST /api/lead — recibe el formulario de contacto (contacto.html).
 *
 * Público, sin autenticación (es un formulario de venta, no hay cuenta
 * todavía). Guarda en public.leads con la service role key; se revisa desde
 * /admin (RPC admin_leads).
 *
 * Anti-spam liviano: campo honeypot ("website") que un humano nunca llena;
 * si viene con contenido, se responde 200 sin insertar nada (no delatamos
 * el filtro a un bot).
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  if (String(body.website || '').trim()) {
    return res.status(200).json({ ok: true }); // honeypot: bot atrapado, respuesta normal
  }

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const company = String(body.company || '').trim().slice(0, 200);
  const phone = String(body.phone || '').trim().slice(0, 40);
  const planInterest = String(body.plan || '').trim().slice(0, 40);
  const message = String(body.message || '').trim().slice(0, 2000);
  const source = String(body.source || '').trim().slice(0, 60);

  if (!name || name.length > 200) return res.status(400).json({ error: 'Escribe tu nombre' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo inválido' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await db.from('leads').insert({
    name, email, company: company || null, phone: phone || null,
    plan_interest: planInterest || null, message: message || null, source: source || null,
  });
  if (error) return res.status(500).json({ error: 'No se pudo enviar. Intenta de nuevo.' });

  return res.status(200).json({ ok: true });
}
