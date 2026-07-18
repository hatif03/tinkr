-- Add canvas metadata and extend draft structure for Tinkr infinite canvas
alter table public.projects
  add column if not exists canvas_meta jsonb not null default '{"sections":[],"viewportState":{"scale":1,"x":0,"y":0}}'::jsonb;

comment on column public.projects.canvas_meta is 'Scroll-anchored sections, viewport pan/zoom state, wireframe overlays';

-- Allow editors to update projects (not just owners) for collaborative draft sync
drop policy if exists "owners update projects" on public.projects;
create policy "editors update projects" on public.projects for update to authenticated using (
  (select auth.uid()) = owner_id
  or exists (select 1 from public.project_members m where m.project_id = id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))
) with check (
  (select auth.uid()) = owner_id
  or exists (select 1 from public.project_members m where m.project_id = id and m.user_id = (select auth.uid()) and m.role in ('owner','editor'))
);
