/**
 * FOKO — POST /api/report — genera un reporte de servicio a partir de la
 * transcripción + notas de la llamada, usando Claude.
 *
 * Protegido por cuenta real: el header Authorization trae el access_token de
 * la sesión de Supabase del técnico de oficina (no una contraseña compartida).
 * Se valida con la service role key (nunca sale del servidor) y se resuelve
 * la empresa del usuario para incluirla en el contexto del reporte.
 *
 * Env vars requeridas: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// Modelo para redactar el reporte. Haiku es de sobra para esto y el más barato
// (~1 centavo por reporte). Sube a 'claude-sonnet-5' si quieres más calidad.
const MODEL = process.env.REPORT_MODEL || 'claude-haiku-4-5';

const SYSTEM = `Eres un asistente que redacta reportes de servicio técnico en español,
a partir de la transcripción de una videollamada de soporte remoto y las notas que
tomó el técnico. Sé fiel a lo que se dijo: no inventes datos, equipos, mediciones ni
nombres. Si algo no se mencionó, escribe "No especificado".

Devuelve SOLO el reporte en Markdown, con estas secciones:

# Reporte de servicio
- **Empresa:** (usa la que te den)
- **Fecha:** (usa la que te den)
- **Código de sesión:** (usa el que te den)
- **Duración:** (usa la que te den)

## Motivo / problema reportado
## Diagnóstico
## Acciones realizadas
## Materiales o repuestos
## Estado final
## Recomendaciones / pendientes

Usa viñetas donde ayude. Sé conciso y concreto.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Falta configurar Supabase en el servidor' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Falta iniciar sesión' });

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return res.status(401).json({ error: 'Sesión inválida o vencida. Vuelve a iniciar sesión.' });
  }

  let companyName = null;
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('companies ( name )')
      .eq('user_id', user.id)
      .single();
    companyName = profile?.companies?.name || null;
  } catch (_) { /* sin empresa asociada; seguimos sin membrete en el texto */ }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { transcript = '', notes = '', meta = {} } = body || {};

  if (!transcript.trim() && !notes.trim()) {
    return res.status(400).json({ error: 'No hay transcripción ni notas para procesar' });
  }

  const userMsg = [
    `Datos de la sesión:`,
    `- Empresa: ${companyName || 'No especificado'}`,
    `- Fecha: ${meta.date || 'No especificado'}`,
    `- Código de sesión: ${meta.room || 'No especificado'}`,
    `- Duración: ${meta.duration || 'No especificado'}`,
    `- Fotos tomadas: ${meta.photos ?? 'No especificado'}`,
    ``,
    `Transcripción de la llamada (voz del técnico de oficina):`,
    transcript.trim() || '(sin transcripción)',
    ``,
    `Notas escritas por el técnico durante la llamada:`,
    notes.trim() || '(sin notas)',
  ].join('\n');

  try {
    const anthropic = new Anthropic();
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
    const report = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return res.status(200).json({ report });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: err?.message || 'Error generando el reporte' });
  }
}
