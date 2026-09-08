/**
 * FOKO — cliente único de Supabase (auth + base de datos + storage).
 *
 * La URL y la "anon key" son públicas por diseño en Supabase: la seguridad
 * de los datos la da Row Level Security (ver supabase/schema.sql), no el
 * secreto de esta key. La "service role key" NUNCA va aquí — solo vive en
 * el servidor, como variable de entorno de `api/report.js`.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const SUPABASE_URL = 'https://kjcsqyptjxdxzmaelglw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqY3NxeXB0anhkeHptYWVsZ2x3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MTc1NTMsImV4cCI6MjEwNDI5MzU1M30.5zmpRBkJmYUhgOU3qVXyQs2eV7Yq6CuO7QzcexmJqsU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Sesión actual + perfil (empresa, rol) + flag de super-admin de plataforma.
 *  Una sola llamada. Null si no hay sesión. */
export async function getSessionAndProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const [{ data: profile, error }, { data: isAdmin }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, full_name, companies ( id, name, logo_url, invite_code )')
      .eq('user_id', session.user.id)
      .single(),
    supabase.rpc('is_platform_admin'),
  ]);

  const isPlatformAdmin = !!isAdmin;
  if (error || !profile) return { session, profile: null, company: null, isPlatformAdmin };
  return { session, profile, company: profile.companies, isPlatformAdmin };
}

/** Redirige a login.html si no hay sesión. Úsalo al cargar una página protegida. */
export async function requireSession(loginUrl = 'login.html') {
  const state = await getSessionAndProfile();
  if (!state) {
    location.href = loginUrl;
    return null;
  }
  return state;
}
