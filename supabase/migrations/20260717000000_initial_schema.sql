-- Tinkr Studio cloud schema. Apply in the Supabase SQL editor, then configure
-- the extension with its project URL and publishable key. All public tables use RLS.
create extension if not exists pgcrypto;

create type public.tinkr_role as enum ('owner', 'editor', 'commenter', 'viewer');
create type public.tinkr_revision_status as enum ('draft', 'checkpoint');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  source_url text not null,
  source_fingerprint jsonb not null default '{}'::jsonb,
  preview_path text,
  current_draft jsonb not null default '[]'::jsonb,
  canvas_meta jsonb not null default '{"sections":[],"viewportState":{"scale":1,"x":0,"y":0}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tinkr_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  name text,
  description text,
  status public.tinkr_revision_status not null default 'checkpoint',
  source_fingerprint jsonb not null,
  patch_snapshot jsonb not null,
  preview_path text,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_id uuid references public.revisions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  target_anchor jsonb,
  body text not null check (char_length(body) between 1 and 4000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uploader_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  created_at timestamptz not null default now()
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision_id uuid not null references public.revisions(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index revisions_project_created_idx on public.revisions(project_id, created_at desc);
create index comments_project_created_idx on public.comments(project_id, created_at);
create index share_links_token_idx on public.share_links(token_hash) where revoked_at is null;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.revisions enable row level security;
alter table public.comments enable row level security;
alter table public.assets enable row level security;
alter table public.share_links enable row level security;

create policy "project members can read projects" on public.projects for select to authenticated using (
  (select auth.uid()) = owner_id or exists (select 1 from public.project_members m where m.project_id = id and m.user_id = (select auth.uid()))
);
create policy "users create own projects" on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "editors update projects" on public.projects for update to authenticated using (
  (select auth.uid()) = owner_id or exists (select 1 from public.project_members m where m.project_id = id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))
) with check (
  (select auth.uid()) = owner_id or exists (select 1 from public.project_members m where m.project_id = id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))
);
create policy "owners delete projects" on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "members list is visible to project readers" on public.project_members for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members mine where mine.project_id = p.id and mine.user_id = (select auth.uid()))))
);
create policy "owners manage members" on public.project_members for all to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create policy "members read revisions" on public.revisions for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()))))
);
create policy "editors create revisions" on public.revisions for insert to authenticated with check (
  (select auth.uid()) = author_id and exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))))
);

create policy "members read comments" on public.comments for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid())))));
create policy "commenters create comments" on public.comments for insert to authenticated with check ((select auth.uid()) = author_id and exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor','commenter')))));
create policy "authors or editors update comments" on public.comments for update to authenticated using ((select auth.uid()) = author_id or exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))))) with check ((select auth.uid()) = author_id or exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor')))));

create policy "members read assets" on public.assets for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid())))));
create policy "editors create assets" on public.assets for insert to authenticated with check ((select auth.uid()) = uploader_id and exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor')))));

create policy "members read share links" on public.share_links for select to authenticated using (exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid())))));
create policy "editors create share links" on public.share_links for insert to authenticated with check ((select auth.uid()) = created_by and exists (select 1 from public.projects p where p.id = project_id and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid()) and m.role in ('owner','editor')))));
create policy "owners revoke share links" on public.share_links for update to authenticated using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))) with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

insert into storage.buckets (id, name, public) values ('tinkr-assets', 'tinkr-assets', false) on conflict (id) do nothing;
create policy "authenticated users access only project assets" on storage.objects for select to authenticated using (bucket_id = 'tinkr-assets' and exists (select 1 from public.assets a join public.projects p on p.id = a.project_id where a.storage_path = name and (p.owner_id = (select auth.uid()) or exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = (select auth.uid())))));
create policy "users upload only beneath their own asset prefix" on storage.objects for insert to authenticated with check (bucket_id = 'tinkr-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "users update only beneath their own asset prefix" on storage.objects for update to authenticated using (bucket_id = 'tinkr-assets' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'tinkr-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects, public.project_members, public.revisions, public.comments, public.assets, public.share_links to authenticated;
