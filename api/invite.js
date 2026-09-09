/**
 * FOKO — POST /api/invite — envía el correo de invitación (Supabase Auth).
 *
 * La fila de `invitations` ya la creó la RPC (invite_user / admin_create_organization).
 * Aquí solo se manda el email con un magic link que aterriza en
 * /invite.html?token=<token de la invitación>, donde se llama accept_invitation().
 *
 * Autorización: el llamante debe ser superadmin, o org_admin de la organización
 * de esa invitación.
 *
 * Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED = /(^|\.)fokoremote\.com$|\.vercel\.app$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' });
  }

  const callerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!callerToken) return res.status(401).json({ error: 'Falta iniciar sesión' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(callerToken);
  if (authErr || !user) return res.status(401).json({ error: 'Sesión inválida' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const inviteToken = String(body?.token || '');
  const email = String(body?.email || '').trim().toLowerCase();
  if (!inviteToken || !email) return res.status(400).json({ error: 'Faltan datos' });

  const { data: inv } = await admin.from('invitations').select('company_id, email').eq('token', inviteToken).single();
  if (!inv) return res.status(404).json({ error: 'Invitación no encontrada' });
  if (inv.email !== email) return res.status(400).json({ error: 'El correo no coincide con la invitación' });

  // Autorización del llamante
  const { data: sa } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!sa) {
    const { data: prof } = await admin.from('profiles').select('company_id, role').eq('user_id', user.id).single();
    if (!prof || prof.company_id !== inv.company_id || prof.role !== 'org_admin') {
      return res.status(403).json({ error: 'No autorizado' });
    }
  }

  const originHeader = req.headers.origin || '';
  let base = 'https://fokoremote.com';
  try { if (originHeader && ALLOWED.test(new URL(originHeader).hostname)) base = originHeader; } catch (_) {}
  const redirectTo = `${base}/invite.html?token=${encodeURIComponent(inviteToken)}`;

  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (invErr) {
    // Ya tiene cuenta: mandamos un magic link en su lugar.
    if (/already|registered|exists/i.test(invErr.message)) {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink', email, options: { redirectTo },
      });
      if (linkErr) {
        return res.status(200).json({ ok: false, existing: true, error: linkErr.message,
          hint: 'El usuario ya tiene cuenta. Comparte manualmente: ' + redirectTo });
      }
      return res.status(200).json({ ok: true, existing: true, action_link: link?.properties?.action_link || null });
    }
    return res.status(500).json({ error: invErr.message });
  }
  return res.status(200).json({ ok: true });
}
