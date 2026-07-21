-- Break RLS cycle between projects and project_members (fixes insert/select recursion)
CREATE OR REPLACE FUNCTION public.can_access_project(pid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pid AND p.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m
    WHERE m.project_id = pid AND m.user_id = auth.uid()
  );
$$;

-- Keep read access separate from write access. Viewers and commenters should
-- be able to open a project without gaining the ability to overwrite it.
CREATE OR REPLACE FUNCTION public.can_edit_project(pid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = pid AND p.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members m
    WHERE m.project_id = pid
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'editor')
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_project(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid) TO authenticated;

DROP POLICY IF EXISTS "project members can read projects" ON public.projects;
CREATE POLICY "project members can read projects" ON public.projects
  FOR SELECT TO authenticated
  USING (public.can_access_project(id));

DROP POLICY IF EXISTS "editors update projects" ON public.projects;
CREATE POLICY "editors update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.can_edit_project(id))
  WITH CHECK (public.can_edit_project(id));

DROP POLICY IF EXISTS "members list is visible to project readers" ON public.project_members;
CREATE POLICY "members list is visible to project readers" ON public.project_members
  FOR SELECT TO authenticated
  USING (public.can_access_project(project_id));
