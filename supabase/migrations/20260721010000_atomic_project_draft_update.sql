-- Compare-and-swap project drafts in one database statement.  A browser can
-- have more than one tinkr tab open, so doing a SELECT followed by UPDATE in
-- the API server is not enough: two requests can both observe the same draft
-- version and the later write silently wins.
-- This migration runs after 20260721000000_fix_projects_rls_recursion.sql,
-- which provides public.can_edit_project().
--
-- This function deliberately runs as the calling authenticated user.  Project
-- RLS and public.can_edit_project() remain the authority for writes; the API
-- server merely calls this function with the user's access token.
CREATE OR REPLACE FUNCTION public.tinkr_update_project_if_version(
  p_project_id uuid,
  p_base_version bigint,
  p_patch jsonb
)
RETURNS TABLE (
  outcome text,
  current_version bigint,
  project jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_draft jsonb;
  v_current_version bigint;
  v_updated public.projects%ROWTYPE;
BEGIN
  IF p_base_version < 0 THEN
    RAISE EXCEPTION 'base version must be non-negative';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'project patch must be a JSON object';
  END IF;

  -- SELECT is RLS-scoped. Returning not_found for a row the caller cannot see
  -- avoids leaking project existence to unrelated users.
  SELECT p.current_draft
    INTO v_current_draft
    FROM public.projects p
   WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::bigint, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT public.can_edit_project(p_project_id) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::bigint, NULL::jsonb;
    RETURN;
  END IF;

  -- Drafts created before versioning (and malformed legacy versions) are
  -- treated as version zero. The regex guard keeps a bad legacy value from
  -- aborting every future save with an invalid bigint cast.
  v_current_version := COALESCE(
    CASE
      WHEN jsonb_typeof(v_current_draft -> 'version') IN ('number', 'string')
       AND (v_current_draft ->> 'version') ~ '^-?[0-9]+$'
      THEN (v_current_draft ->> 'version')::bigint
    END,
    0
  );

  -- The version predicate is evaluated by the UPDATE itself. This is the CAS:
  -- another writer cannot change the row between the check and this write.
  UPDATE public.projects p
     SET name = CASE WHEN p_patch ? 'name' THEN p_patch ->> 'name' ELSE p.name END,
         current_draft = CASE WHEN p_patch ? 'current_draft' THEN p_patch -> 'current_draft' ELSE p.current_draft END,
         canvas_meta = CASE WHEN p_patch ? 'canvas_meta' THEN p_patch -> 'canvas_meta' ELSE p.canvas_meta END,
         preview_path = CASE WHEN p_patch ? 'preview_path' THEN p_patch ->> 'preview_path' ELSE p.preview_path END,
         starred = CASE
           WHEN p_patch ? 'starred' AND (p_patch ->> 'starred') IN ('true', 'false')
             THEN (p_patch ->> 'starred')::boolean
           ELSE p.starred
         END,
         updated_at = now()
   WHERE p.id = p_project_id
     AND COALESCE(
       CASE
         WHEN jsonb_typeof(p.current_draft -> 'version') IN ('number', 'string')
          AND (p.current_draft ->> 'version') ~ '^-?[0-9]+$'
         THEN (p.current_draft ->> 'version')::bigint
       END,
       0
     ) = p_base_version
  RETURNING p.* INTO v_updated;

  IF FOUND THEN
    RETURN QUERY SELECT
      'updated'::text,
      COALESCE(
        CASE
          WHEN jsonb_typeof(v_updated.current_draft -> 'version') IN ('number', 'string')
           AND (v_updated.current_draft ->> 'version') ~ '^-?[0-9]+$'
          THEN (v_updated.current_draft ->> 'version')::bigint
        END,
        0
      ),
      to_jsonb(v_updated);
    RETURN;
  END IF;

  -- The conditional UPDATE failed. Read the post-write state to distinguish a
  -- concurrent save from a project that was removed or became view-only.
  SELECT p.current_draft
    INTO v_current_draft
    FROM public.projects p
   WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::bigint, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT public.can_edit_project(p_project_id) THEN
    RETURN QUERY SELECT 'forbidden'::text, NULL::bigint, NULL::jsonb;
    RETURN;
  END IF;

  v_current_version := COALESCE(
    CASE
      WHEN jsonb_typeof(v_current_draft -> 'version') IN ('number', 'string')
       AND (v_current_draft ->> 'version') ~ '^-?[0-9]+$'
      THEN (v_current_draft ->> 'version')::bigint
    END,
    0
  );
  RETURN QUERY SELECT 'conflict'::text, v_current_version, NULL::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.tinkr_update_project_if_version(uuid, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tinkr_update_project_if_version(uuid, bigint, jsonb) TO authenticated;
