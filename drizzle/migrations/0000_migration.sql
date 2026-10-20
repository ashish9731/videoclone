create table public.projects (
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

create table public.media_assets (
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

create table public.caption_tracks (
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

create index on public.projects(user_id, updated_at desc);
create index on public.media_assets(user_id, project_id);
create index on public.caption_tracks(project_id);

create policy "own media files read" on storage.objects for select to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media files insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own media files delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);