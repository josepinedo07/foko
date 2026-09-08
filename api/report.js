/**
 * FOKO — POST /api/report — genera un reporte de servicio a partir de la
 * transcripción + notas de la llamada, usando Gemini (Google AI Studio).
 *
 * Protegido por cuenta real: el header Authorization trae el access_token de
 * la sesión de Supabase del técnico de oficina (no una contraseña compartida).
 * Se valida con la service role key (nunca sale del servidor) y se resuelve
 * la empresa del usuario para incluirla en el contexto del reporte.
 *
 * Env vars requeridas: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Modelo para redactar el reporte. Flash-Lite es de sobra para esto y el más
// barato (fracciones de centavo por reporte). Nota: 'gemini-2.5-flash-lite' ya
// no está disponible para cuentas nuevas (Google redirige a este). Sube a
// 'gemini-3.5-flash' si quieres más calidad.
const MODEL = process.env.REPORT_MODEL || 'gemini-3.5-flash-lite';

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

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Falta GEMINI_API_KEY en el servidor' });
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

  let companyName = null, companyId = null;
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id, companies ( name )')
      .eq('user_id', user.id)
      .single();
    companyName = profile?.companies?.name || null;
    companyId = profile?.company_id || null;
  } catch (_) { /* sin empresa asociada; seguimos sin membrete en el texto */ }

  // Límite: 30 reportes por usuario por hora (protege el costo de la API).
  try {
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor', user.id).eq('action', 'report.generated').gte('created_at', since);
    if ((count || 0) >= 30) {
      return res.status(429).json({ error: 'Límite de reportes por hora alcanzado. Intenta más tarde.' });
    }
  } catch (_) { /* si audit_log no existe todavía, no bloqueamos */ }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { transcript = '', notes = '', meta = {} } = body || {};

  if (!transcript.trim() && !notes.trim()) {
    return res.status(400).json({ error: 'No hay transcripción ni notas para procesar' });
  }

  // Tope de entrada (debe coincidir con MAX_REPORT_CHARS de js/limits.js).
  // Protege contra payloads gigantes / costo desbordado.
  const MAX_REPORT_CHARS = 20000;
  if ((transcript.length + notes.length) > MAX_REPORT_CHARS) {
    return res.status(413).json({ error: 'El texto enviado es demasiado largo.' });
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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: userMsg,
      config: { systemInstruction: SYSTEM, maxOutputTokens: 4000 },
    });
    const report = (response.text || '').trim();
    if (!report) throw new Error('El modelo no devolvió texto (puede haber sido bloqueado por seguridad)');
    // Registro para el límite por hora y la auditoría.
    try {
      await supabaseAdmin.from('audit_log').insert({
        company_id: companyId, actor: user.id, action: 'report.generated',
        target_type: 'session', target_id: (meta.room || null),
        meta: { chars: transcript.length + notes.length },
      });
    } catch (_) { /* audit_log opcional */ }
    return res.status(200).json({ report });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(status).json({ error: err?.message || 'Error generando el reporte' });
  }
}
