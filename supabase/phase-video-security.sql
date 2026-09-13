-- FOKO — refuerzo de seguridad de fotos/video de clientes.
-- Quita al superadmin de plataforma la LECTURA de facto del contenido de
-- cualquier organización (nunca se usó: admin.html no lee session_media ni
-- storage directo, todo pasa por RPCs). Se conserva la capacidad de BORRAR
-- (soporte / cumplimiento), pero ver el contenido de un cliente deja de ser
-- un permiso permanente alcanzable desde el navegador — si algún día hace
-- falta soporte real sobre un video puntual, se hace con la service role
-- key server-side (queda en los logs del servidor, no es un botón silencioso
-- en la app). Re-ejecutable.

drop policy if exists "read company session media" on public.session_media;
create policy "read company session media" on public.session_media
  for select using (
    company_id = public.my_company_id()
    and public.session_is_current()
  );

drop policy if exists "company reads session files" on storage.objects;
create policy "company reads session files" on storage.objects
  for select using (
    bucket_id = 'sessions' and (storage.foldername(name))[1] = public.my_company_id()::text
  );
