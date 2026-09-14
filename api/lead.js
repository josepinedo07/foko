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
 * Aviso por correo (best-effort, vía Resend): si RESEND_API_KEY y
 * LEAD_NOTIFY_EMAIL están configuradas, manda un correo con los datos del
 * lead. Si Resend falla o no está configurado, el lead se guarda igual —
 * nunca se pierde un lead por un aviso que no salió.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *           LEAD_NOTIFY_EMAIL.
 */

import { createClient } from '@supabase/supabase-js';

// Remitente interno (a ti): el compartido de Resend basta, nunca lo ve el cliente.
const INTERNAL_FROM = 'FOKO Leads <onboarding@resend.dev>';
// Remitente hacia el prospecto: idealmente @fokoremote.com una vez verificado
// el dominio en Resend (LEAD_CONFIRM_FROM). Hasta entonces cae al compartido
// — funciona, pero se ve menos profesional para quien no te conoce todavía.
const CONFIRM_FROM = process.env.LEAD_CONFIRM_FROM || 'FOKO <onboarding@resend.dev>';

async function sendEmail({ from, to, replyTo, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text }),
    });
  } catch (_) { /* el correo es un aviso, no el registro — nunca bloquea */ }
}

async function notifyByEmail(lead) {
  const to = process.env.LEAD_NOTIFY_EMAIL;
  if (!to) return;
  await sendEmail({
    from: INTERNAL_FROM, to, replyTo: lead.email,
    subject: `Nuevo lead: ${lead.name}${lead.company ? ' — ' + lead.company : ''}`,
    text: [
      `Nombre: ${lead.name}`,
      `Empresa: ${lead.company || '—'}`,
      `Correo: ${lead.email}`,
      `Teléfono: ${lead.phone || '—'}`,
      `Plan de interés: ${lead.plan_interest || '—'}`,
      `Origen: ${lead.source || '—'}`,
      '',
      `Mensaje:`,
      lead.message || '(sin mensaje)',
      '',
      `Revisa/marca como contactado en fokoremote.com/admin.html`,
    ].join('\n'),
  });
}

async function confirmToLead(lead) {
  await sendEmail({
    from: CONFIRM_FROM, to: lead.email, replyTo: 'ventas@fokoremote.com',
    subject: 'Recibimos tu mensaje — FOKO',
    text: [
      `Hola ${lead.name.split(' ')[0]},`,
      '',
      `Recibimos tu solicitud${lead.company ? ' sobre FOKO para ' + lead.company : ''} y te contactamos en breve desde este mismo correo para agendar una demo.`,
      '',
      `Si es urgente, escríbenos directo a ventas@fokoremote.com.`,
      '',
      `— Equipo FOKO`,
      `fokoremote.com`,
    ].join('\n'),
  });
}

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

  const lead = {
    name, email, company: company || null, phone: phone || null,
    plan_interest: planInterest || null, message: message || null, source: source || null,
  };
  const { error } = await db.from('leads').insert(lead);
  if (error) return res.status(500).json({ error: 'No se pudo enviar. Intenta de nuevo.' });

  // Se espera (aunque sea best-effort) porque Vercel puede congelar la
  // función apenas responde — sin este await el fetch a Resend a veces ni
  // llega a salir.
  await Promise.all([notifyByEmail(lead), confirmToLead(lead)]);

  return res.status(200).json({ ok: true });
}
