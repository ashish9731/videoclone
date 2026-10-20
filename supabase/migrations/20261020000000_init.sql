-- Cutroom initial schema for the live Supabase project (xtlxcgzicaugttdigrxh).
-- Real email/Google auth: user_id defaults to auth.uid(); all policies require the
-- authenticated role. storage + auth schemas already exist on hosted projects.

-- ===== Projects =====
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null default 'Untitled project',
  width int not null default 1920,
  height int not null default 1080,
  fps int not null default 30,
  timeline jsonb not null default '{"tracks":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
create policy "own projects select" on public.projects for select to authenticated using (auth.uid() = user_id);
create policy "own projects insert" on public.projects for insert to authenticated with check (auth.uid() = user_id);
create policy "own projects update" on public.projects for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own projects delete" on public.projects for delete to authenticated using (auth.uid() = user_id);
create index if not exists projects_user_idx on public.projects(user_id, updated_at desc);

-- ===== Media assets =====
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid references public.projects(id) on delete cascade,
  storage_path text not null,
  name text not null,
  kind text not null check (kind in ('video','audio','image')),
  mime text not null,
  size_bytes bigint not null default 0,
  duration double precision not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.media_assets to authenticated;
grant all on public.media_assets to service_role;
alter table public.media_assets enable row level security;
create policy "own media select" on public.media_assets for select to authenticated using (auth.uid() = user_id);
create policy "own media insert" on public.media_assets for insert to authenticated with check (auth.uid() = user_id);
create policy "own media update" on public.media_assets for update to authenticated using (auth.uid() = user_id);
create policy "own media delete" on public.media_assets for delete to authenticated using (auth.uid() = user_id);
create index if not exists media_assets_user_idx on public.media_assets(user_id, project_id);

-- ===== Caption tracks =====
create table if not exists public.caption_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'Captions',
  language text not null default 'en',
  cues jsonb not null default '[]'::jsonb,
  style jsonb not null default '{}'::jsonb,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.caption_tracks to authenticated;
grant all on public.caption_tracks to service_role;
alter table public.caption_tracks enable row level security;
create policy "own captions select" on public.caption_tracks for select to authenticated using (auth.uid() = user_id);
create policy "own captions insert" on public.caption_tracks for insert to authenticated with check (auth.uid() = user_id);
create policy "own captions update" on public.caption_tracks for update to authenticated using (auth.uid() = user_id);
create policy "own captions delete" on public.caption_tracks for delete to authenticated using (auth.uid() = user_id);
create index if not exists caption_tracks_project_idx on public.caption_tracks(project_id);

-- ===== Private media storage bucket + per-user folder policies =====
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

create policy "own media files read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media files update" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== Profiles: store user details, auto-populated on sign-up =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile select" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Keep the profile in sync whenever an auth user is created (email or OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, provider)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.raw_app_meta_data->>'provider'
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
