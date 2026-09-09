# FOKO — checklist de QA (planes, multi-tenant, admin, facturación)

Complementa `supabase/tests.sql` (pgTAP). Estos flujos se prueban a mano en
`fokoremote.com` porque tocan UI, correo y webhook.

## Antes de probar
- [ ] Corridos en orden: `phase1-plans-orgs.sql`, `phase2.sql`, `phase5.sql`,
      `phase6-stripe.sql` (opcional), y `CRON_SECRET` en Vercel.
- [ ] Existe la org demo **Foko Demo** (founder, trial 30d).

## Superadmin (`/admin`)
- [ ] Entrar con `josepinedo@chambeoapp.com` → carga la lista de organizaciones.
- [ ] Tiles: Organizaciones / Asientos / MRR / En trial cuadran.
- [ ] Filtros por status y por plan filtran la tabla.
- [ ] **Crear organización**: nombre + correo + plan + asientos + días trial →
      aparece en la lista como `trialing`, y el correo de invitación llega.
- [ ] Abrir una org → editar plan/seats/status/trial/billing/notas → **Guardar** →
      se refleja en la lista.
- [ ] En el detalle: cambiar el rol de un usuario, deshabilitar/activar, invitar
      (correo llega), reenviar invitación.
- [ ] Timeline de actividad muestra `org.created`, `org.updated`, `user.invited`, etc.
- [ ] Búsqueda de usuario por correo devuelve resultados y abre su organización.

## Invitación (`/invite.html`)
- [ ] El invitado hace clic en el enlace del correo → aterriza en `invite.html` →
      "Ya eres parte del equipo".
- [ ] Puede poner una contraseña (opcional) → **Entrar** → llega a `/historial`.
- [ ] Enlace ya usado o vencido → mensaje claro, no crashea.
- [ ] Invitación para otro correo (abrir con otra sesión) → "es para otro correo".

## org_admin (`/team`, `/billing`)
- [ ] `/historial` muestra los enlaces **Equipo** y **Facturación** solo al org_admin.
- [ ] `/team`: barra "N de M asientos"; invitar hasta el límite.
- [ ] Al llegar al límite → el alta se **bloquea** con el mensaje de upsell.
- [ ] Cambiar rol / deshabilitar a otro usuario funciona; **no** puede tocarse a sí mismo.
- [ ] Un `expert` que entra a `/team` o `/billing` → redirigido a `/historial`.
- [ ] `/billing`: plan, asientos, status, cuenta regresiva de trial correctos.
- [ ] Modo `manual` → texto "contáctanos". Modo `stripe` → link al portal (+ checkout si no hay suscripción).

## Enforcement (muro de facturación)
- [ ] Poner la org demo en `status = paused` (o `trial_ends_at` en el pasado) desde `/admin`.
- [ ] Un `expert` de esa org: al entrar a `/historial` o `/remote-expert` → **muro** a pantalla completa.
- [ ] El `org_admin` de esa org: es redirigido a `/billing` (sí puede verla).
- [ ] Intentar `Guardar en historial` una sesión con la org walled → RLS lo rechaza.
- [ ] `Generar reporte` con la org walled → `/api/report` responde 402.
- [ ] El **superadmin** nunca ve el muro.
- [ ] Volver la org a `active` → todo se desbloquea.

## Límites operativos (fases previas)
- [ ] Sesión se corta a los 30 min (aviso a los 25).
- [ ] Código de sala expira si nadie se conecta en 10 min.
- [ ] Máx. 30 reportes IA por usuario/hora → el 31 devuelve 429.
- [ ] `/api/cleanup` con el `CRON_SECRET` correcto borra sesiones > 24 meses (probar con una fecha vieja de prueba).

## Stripe (solo si `BILLING_STRIPE_ENABLED=true`)
- [ ] `plans.stripe_price_id` cargados; `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` en Vercel.
- [ ] `/billing` en modo stripe → botón de plan → Checkout de Stripe → pago de prueba.
- [ ] Webhook `checkout.session.completed` → la org pasa a `active`, `billing_mode=stripe`, `stripe_customer_id` seteado.
- [ ] Reenviar el mismo evento (Stripe CLI `stripe events resend`) → **no** cambia nada (idempotente; fila en `stripe_events`).
- [ ] `invoice.payment_failed` → org a `past_due` con `past_due_since`.
- [ ] `customer.subscription.deleted` → org a `canceled`.
- [ ] Con el flag **off**: `/api/stripe-checkout` y `/api/billing-portal` → 404; el flujo es manual.
