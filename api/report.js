/**
 * POST /api/report  — genera un reporte de servicio a partir de la
 * transcripción + notas de la llamada, usando Claude.
 *
 * Protegido por un código de acceso simple (env APP_PASSWORD). La API key
 * de Anthropic vive solo en el servidor (env ANTHROPIC_API_KEY).
 *
 * Para producción/cobro real: reemplazar el código de acceso por cuentas
 * de usuario + medición de uso + facturación.
 */

import Anthropic from '@anthropic-ai/sdk';

// Modelo para redactar el reporte. Haiku es de sobra para esto y el más barato
// (~1 centavo por reporte). Sube a 'claude-sonnet-5' si quieres más calidad.
const MODEL = process.env.REPORT_MODEL || 'claude-haiku-4-5';

const SYSTEM = `Eres un asistente que redacta reportes de servicio técnico en español,
a partir de la transcripción de una videollamada de soporte remoto y las notas que
tomó el técnico. Sé fiel a lo que se dijo: no inventes datos, equipos, mediciones ni
nombres. Si algo no se mencionó, escribe "No especificado".

Devuelve SOLO el reporte en Markdown, con estas secciones:

# Reporte de servicio
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

  const expected = process.env.APP_PASSWORD;
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected || given !== expected) {
    return res.status(401).json({ error: 'Código de acceso inválido' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { transcript = '', notes = '', meta = {} } = body || {};

  if (!transcript.trim() && !notes.trim()) {
    return res.status(400).json({ error: 'No hay transcripción ni notas para procesar' });
  }

  const userMsg = [
    `Datos de la sesión:`,
    `- Fecha: ${meta.date || 'No especificado'}`,
    `- Código de sesión: ${meta.room || 'No especificado'}`,
    `- Duración: ${meta.duration || 'No especificado'}`,
    `- Fotos tomadas: ${meta.photos ?? 'No especificado'}`,
    ``,
    `Transcripción de la llamada (voz del técnico remoto):`,
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
