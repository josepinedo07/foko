/**
 * FOKO — registro de auditoría (best-effort).
 * Escribe una entrada en audit_log vía la RPC write_audit. Nunca lanza:
 * si falla, no debe romper el flujo del usuario.
 */

import { supabase } from './supabase-client.js';

export async function logAudit(action, targetType = null, targetId = null, meta = {}) {
  try {
    await supabase.rpc('write_audit', {
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId ? String(targetId) : null,
      p_meta: meta || {},
    });
  } catch (_) { /* silencioso a propósito */ }
}
