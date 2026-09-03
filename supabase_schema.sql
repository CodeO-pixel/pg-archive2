-- Esquema inferido de app/page.tsx para PG-Archive.
-- Si ya tienes estas tablas/buckets creados en tu proyecto de Supabase, IGNORA este archivo.
-- Ejecuta esto en el SQL Editor de Supabase (Project > SQL Editor) solo si estás empezando de cero.

-- 1. Tabla de perfiles (rol de cada usuario)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  role text not null default 'lector' check (role in ('admin', 'scan', 'lector')),
  created_at timestamptz default now()
);

-- Si la tabla ya existía sin la columna username, esto la agrega sin romper nada:
alter table public.profiles add column if not exists username text unique;

-- ⚠️ IMPORTANTE si ya tenías usuarios registrados antes de este cambio:
-- el login ahora es por username, así que cualquier cuenta vieja sin username asignado
-- no podrá iniciar sesión hasta que le pongas uno manualmente, por ejemplo:
--   update public.profiles set username = 'mi_usuario' where email = 'correo@ejemplo.com';

-- 2. Tabla de series (obras)
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null default 'Manga',
  synopsis text,
  cover_url text,
  tags text[] default '{}',
  created_at timestamptz default now()
);

-- 3. Tabla de capítulos
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series(id) on delete cascade,
  chapter_number text not null,
  title text,
  uploaded_by text,
  pages jsonb default '[]',
  created_at timestamptz default now()
);

-- 4. Seguridad a nivel de fila (RLS)
alter table public.profiles enable row level security;
alter table public.series enable row level security;
alter table public.chapters enable row level security;

-- Lectura pública de series y capítulos (biblioteca visible sin login)
drop policy if exists "Lectura pública de series" on public.series;
create policy "Lectura pública de series" on public.series for select using (true);
drop policy if exists "Lectura pública de capítulos" on public.chapters;
create policy "Lectura pública de capítulos" on public.chapters for select using (true);

-- Cada usuario puede leer/crear su propio perfil
drop policy if exists "Ver el propio perfil" on public.profiles;
create policy "Ver el propio perfil" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Crear el propio perfil" on public.profiles;
create policy "Crear el propio perfil" on public.profiles for insert with check (auth.uid() = id);

-- Un admin puede crear el perfil de otra persona (botón "Crear Usuario para Amigo")
drop policy if exists "Admin crea perfiles de otros" on public.profiles;
create policy "Admin crea perfiles de otros" on public.profiles for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Función usada por el login: dado un nombre de usuario, devuelve su correo (para poder iniciar
-- sesión con Supabase Auth, que internamente exige correo). No expone el resto de la tabla.
create or replace function public.get_email_by_username(lookup_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.profiles where username = lookup_username limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- Le dice al formulario de registro si el usuario que se está creando es el primero
-- (para asignarle el rol admin automáticamente) sin necesitar leer toda la tabla.
create or replace function public.is_first_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles limit 1);
$$;

grant execute on function public.is_first_user() to anon, authenticated;

-- Crea automáticamente la fila en profiles cuando se registra alguien nuevo, usando el
-- username/role que la app manda en las opciones del signUp. Esto es necesario porque si
-- tu proyecto de Supabase pide "confirmar correo", el navegador NO queda autenticado
-- inmediatamente después de registrarse, y por lo tanto no podría insertar su propio
-- perfil por sí mismo (las políticas RLS se lo impedirían). El trigger corre con
-- permisos de servidor, así que no tiene ese problema.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, username, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'username',
    coalesce(new.raw_user_meta_data->>'role', 'lector')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo usuarios autenticados con rol admin/scan pueden escribir series y capítulos
drop policy if exists "Admin/Scan crea series" on public.series;
create policy "Admin/Scan crea series" on public.series for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','scan'))
);
drop policy if exists "Admin/Scan borra series" on public.series;
create policy "Admin/Scan borra series" on public.series for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','scan'))
);
drop policy if exists "Admin/Scan crea capítulos" on public.chapters;
create policy "Admin/Scan crea capítulos" on public.chapters for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','scan'))
);
drop policy if exists "Admin/Scan borra capítulos" on public.chapters;
create policy "Admin/Scan borra capítulos" on public.chapters for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','scan'))
);

-- 5. Buckets de Storage (crear manualmente en Storage > New bucket, o vía SQL si tienes permisos)
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('chapter-pages', 'chapter-pages', true)
on conflict (id) do nothing;

-- Permitir lectura pública de los buckets
drop policy if exists "Lectura pública covers" on storage.objects;
create policy "Lectura pública covers" on storage.objects for select using (bucket_id = 'covers');
drop policy if exists "Lectura pública chapter-pages" on storage.objects;
create policy "Lectura pública chapter-pages" on storage.objects for select using (bucket_id = 'chapter-pages');

-- Permitir subir/borrar archivos a cualquier usuario autenticado
-- (el control real de quién puede subir ya lo hace la app vía userRole en la tabla profiles)
drop policy if exists "Subir covers autenticado" on storage.objects;
create policy "Subir covers autenticado" on storage.objects for insert to authenticated with check (bucket_id = 'covers');
drop policy if exists "Borrar covers autenticado" on storage.objects;
create policy "Borrar covers autenticado" on storage.objects for delete to authenticated using (bucket_id = 'covers');
drop policy if exists "Subir chapter-pages autenticado" on storage.objects;
create policy "Subir chapter-pages autenticado" on storage.objects for insert to authenticated with check (bucket_id = 'chapter-pages');
drop policy if exists "Borrar chapter-pages autenticado" on storage.objects;
create policy "Borrar chapter-pages autenticado" on storage.objects for delete to authenticated using (bucket_id = 'chapter-pages');

-- 6. Seguir obras (botón "Seguir" / "Siguiendo")
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, series_id)
);
alter table public.follows enable row level security;

drop policy if exists "Ver las obras que sigo" on public.follows;
create policy "Ver las obras que sigo" on public.follows for select using (auth.uid() = user_id);
drop policy if exists "Seguir una obra" on public.follows;
create policy "Seguir una obra" on public.follows for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Dejar de seguir una obra" on public.follows;
create policy "Dejar de seguir una obra" on public.follows for delete using (auth.uid() = user_id);

-- 7. Notificaciones internas (aviso cuando se publica un capítulo nuevo de una obra que sigues)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid references public.series(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;

drop policy if exists "Ver mis notificaciones" on public.notifications;
create policy "Ver mis notificaciones" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Marcar mi notificación como leída" on public.notifications;
create policy "Marcar mi notificación como leída" on public.notifications for update using (auth.uid() = user_id);
drop policy if exists "Borrar mi notificación" on public.notifications;
create policy "Borrar mi notificación" on public.notifications for delete using (auth.uid() = user_id);

-- Solo admin/scan pueden crear notificaciones (se disparan al publicar un capítulo nuevo,
-- una por cada persona que sigue esa obra)
drop policy if exists "Admin/Scan crea notificaciones" on public.notifications;
create policy "Admin/Scan crea notificaciones" on public.notifications for insert to authenticated with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','scan'))
);
