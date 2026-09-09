/**
 * FOKO — muro de facturación. El enforcement real está en RLS/RPCs de la DB;
 * esto es la capa de UX en el cliente.
 *
 * enforceAccess(state, opts) devuelve true si puede seguir en la página.
 * Si la organización está fuera de servicio (trial vencido, paused, canceled,
 * past_due > 7 días → org_access_state() = 'billing_only'):
 *   - org_admin: se le deja ver /billing (opts.allowBilling), si no, se le
 *     manda a /billing.
 *   - resto: muro a pantalla completa.
 * El superadmin nunca se bloquea.
 */

const MSG = {
  paused: 'La cuenta de tu organización está pausada.',
  canceled: 'La suscripción de tu organización fue cancelada.',
  trial: 'El periodo de prueba de tu organización terminó.',
  past_due: 'Hay un pago pendiente en tu organización.',
};

export function enforceAccess(state, { allowBilling = false } = {}) {
  if (!state || state.isPlatformAdmin) return true;
  if (state.accessState !== 'billing_only') return true;

  const isAdmin = state.profile && state.profile.role === 'org_admin';
  if (isAdmin && allowBilling) return true;
  if (isAdmin) { location.replace('billing.html'); return false; }

  renderWall(state);
  return false;
}

function renderWall(state) {
  const orgStatus = (state.company && state.company.status) || '';
  const reason = orgStatus === 'paused' ? MSG.paused
    : orgStatus === 'canceled' ? MSG.canceled
    : orgStatus === 'past_due' ? MSG.past_due
    : MSG.trial;

  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:16px;text-align:center;padding:32px;
                background:var(--bg);color:var(--text);">
      <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:0.08em;
                  text-transform:uppercase;color:var(--warn);border:1px solid var(--warn);
                  border-radius:2px;padding:2px 8px;">Acceso suspendido</div>
      <p style="font-size:18px;font-weight:600;max-width:32ch;">${reason}</p>
      <p style="color:var(--text-dim);font-size:14px;max-width:40ch;">
        Contacta al administrador de tu organización para reactivar el servicio.</p>
      <a href="login.html" style="font-family:var(--font-mono);font-size:12px;
         color:var(--accent-text);">Cerrar sesión</a>
    </div>`;
}
