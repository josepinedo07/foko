-- FOKO — Fase 5: enforcement en la base de datos (además del muro en el cliente).
-- Bloquea guardar sesiones / subir media cuando la organización está fuera de
-- servicio (trial vencido, paused, canceled, past_due > 7 días).
-- Pega en el SQL Editor y Run. Re-ejecutable.

drop policy if exists "insert company sessions" on public.sessions;
create policy "insert company sessions" on public.sessions
  for insert with check (
    company_id = public.my_company_id()
    and created_by = auth.uid()
    and public.org_access_state() = 'ok'
  );

drop policy if exists "insert company session media" on public.session_media;
create policy "insert company session media" on public.session_media
  for insert with check (
    company_id = public.my_company_id()
    and public.org_access_state() = 'ok'
  );

-- El reporte con IA también se corta si la org está fuera de servicio.
-- (api/report.js además lo chequea en el servidor.)
