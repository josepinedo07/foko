/**
 * FOKO — POST /api/lead — recibe el formulario de contacto (contacto.html).
 *
 * Público, sin autenticación (es un formulario de venta, no hay cuenta
 * todavía). Guarda en public.leads con la service role key; se revisa desde
 * /admin (RPC admin_leads).
 *
 * Anti-spam:
 *  - Honeypot ("website"): campo oculto que un humano nunca llena; si viene
 *    con contenido, se responde 200 sin insertar nada (no delatamos el
 *    filtro a un bot).
 *  - Cloudflare Turnstile: el widget del formulario manda un token que se
 *    verifica aquí contra la API de Cloudflare antes de guardar nada. Si
 *    TURNSTILE_SECRET_KEY no está configurada, se salta la verificación
 *    (no rompe el formulario mientras se configura).
 *
 * Aviso por correo (best-effort, vía Resend): si RESEND_API_KEY y
 * LEAD_NOTIFY_EMAIL están configuradas, manda un correo con los datos del
 * lead. Si Resend falla o no está configurado, el lead se guarda igual —
 * nunca se pierde un lead por un aviso que no salió.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
 *           LEAD_NOTIFY_EMAIL, LEAD_CONFIRM_FROM, TURNSTILE_SECRET_KEY.
 */

import { createClient } from '@supabase/supabase-js';

async function verifyTurnstile(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // no configurada todavía: no bloquear el formulario
  if (!token) return false;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteip) params.set('remoteip', remoteip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const d = await r.json();
    return !!d.success;
  } catch (_) {
    return false; // si Cloudflare no responde, no dejamos pasar sin verificar
  }
}

// Remitente interno (a ti): el compartido de Resend basta, nunca lo ve el cliente.
const INTERNAL_FROM = 'FOKO Leads <onboarding@resend.dev>';
// Remitente hacia el prospecto: idealmente @fokoremote.com una vez verificado
// el dominio en Resend (LEAD_CONFIRM_FROM). Hasta entonces cae al compartido
// — funciona, pero se ve menos profesional para quien no te conoce todavía.
const CONFIRM_FROM = process.env.LEAD_CONFIRM_FROM || 'FOKO <onboarding@resend.dev>';

async function sendEmail({ from, to, replyTo, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text, html }),
    });
  } catch (_) { /* el correo es un aviso, no el registro — nunca bloquea */ }
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Membrete + tipografía Arial (segura en cualquier cliente de correo) — mismo
 *  criterio que la firma de correo y el reporte impreso: nada de fuentes web,
 *  todo en línea, el logo es la imagen ya alojada en fokoremote.com/brand. */
function leadConfirmHtml(lead) {
  const firstName = esc(lead.name.split(' ')[0]);
  const companyLine = lead.company ? ` para <strong>${esc(lead.company)}</strong>` : '';
  return `<div style="background:#F1F0E9;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <tr><td style="padding:32px 32px 20px;">
      <img src="https://fokoremote.com/brand/wordmark-signature.png" alt="foko" width="84" height="51" style="display:block;border:0;">
    </td></tr>
    <tr><td style="padding:0 32px;"><div style="height:3px;width:48px;background:#C6FF00;"></div></td></tr>
    <tr><td style="padding:24px 32px 8px;">
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#14150F;">Recibimos tu mensaje</p>
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#4A4D42;">Hola ${firstName},</p>
      <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#4A4D42;">Recibimos tu solicitud${companyLine} y te contactamos en breve desde este mismo correo para agendar una demo de FOKO.</p>
      <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#4A4D42;">Si es urgente, escríbenos directo a <a href="mailto:ventas@fokoremote.com" style="color:#5C7A00;font-weight:bold;text-decoration:none;">ventas@fokoremote.com</a>.</p>
    </td></tr>
    <tr><td style="padding:20px 32px 32px;border-top:1px solid #ECECEA;">
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#8A8F7E;">Grupo Chambeo, C.A. · <a href="https://fokoremote.com" style="color:#8A8F7E;text-decoration:none;">fokoremote.com</a></p>
    </td></tr>
  </table>
</div>`;
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
    html: leadConfirmHtml(lead),
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

  const remoteip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || undefined;
  const humanOk = await verifyTurnstile(body.turnstileToken, remoteip);
  if (!humanOk) return res.status(400).json({ error: 'No se pudo verificar que eres una persona. Intenta de nuevo.' });

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
