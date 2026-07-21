import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Every authenticated project route uses the service client for a scoped
// membership check. Treat a missing service key as an explicit configuration
// problem instead of letting it surface later as an opaque 500.
const configured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
const publicClient = (accessToken) => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} },
  auth: { persistSession: false, autoRefreshToken: false }
});
const serviceClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for public review lookups.");
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};
const tokenHash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const bearer = (request) => request.headers.authorization?.replace(/^Bearer\s+/i, "");
const ASSET_BUCKET = "tinkr-assets";
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assetUploadInput(body = {}) {
  const assetId = String(body.assetId || "");
  const mimeType = String(body.mimeType || "").toLowerCase().trim();
  const byteSize = Number(body.byteSize || 0);
  if (!UUID_PATTERN.test(assetId)) return { error: "A valid asset identifier is required.", code: "ASSET_UPLOAD_INVALID" };
  if (!mimeType.startsWith("image/")) return { error: "Only image assets can be uploaded to the tinkr canvas.", code: "ASSET_TYPE_UNSUPPORTED" };
  if (!Number.isFinite(byteSize) || byteSize < 0 || byteSize > MAX_ASSET_BYTES) return { error: "Image assets must be 8 MB or smaller.", code: "ASSET_TOO_LARGE" };
  return { assetId, mimeType, byteSize };
}

function assetStoragePath(userId, projectId, assetId) {
  return `${userId}/${projectId}/${assetId}`;
}

async function signedAssetUrl(db, path) {
  const { data, error } = await db.storage.from(ASSET_BUCKET).createSignedUrl(path, 3600);
  if (error) return { error: error.message };
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + 3600 * 1000).toISOString() };
}

async function requireUser(req, res) {
  if (!configured()) { res.status(503).json({ error: "tinkr Cloud is not configured.", code: "CLOUD_NOT_CONFIGURED", retryable: false }); return null; }
  const token = bearer(req);
  if (!token) { res.status(401).json({ error: "Sign in is required.", code: "AUTH_REQUIRED", retryable: false }); return null; }
  const { data: { user }, error } = await publicClient().auth.getUser(token);
  if (error || !user) { res.status(401).json({ error: "Sign in is required.", code: "AUTH_REQUIRED", retryable: false }); return null; }
  return { client: publicClient(token), db: serviceClient(), user, token };
}

async function canAccessProject(db, userId, projectId) {
  const { data: project } = await db.from("projects").select("id, owner_id").eq("id", projectId).maybeSingle();
  if (!project) return null;
  if (project.owner_id === userId) return { ...project, role: "owner" };
  const { data: member } = await db.from("project_members").select("project_id,role").eq("project_id", projectId).eq("user_id", userId).maybeSingle();
  return member ? { ...project, role: member.role || "viewer" } : null;
}

const canEditProject = (access) => Boolean(access && ["owner", "editor"].includes(access.role));
const canCommentOnProject = (access) => Boolean(access && ["owner", "editor", "commenter"].includes(access.role));
function editorRequired(res) {
  res.status(403).json({ error: "Editor access is required to change this project.", code: "EDITOR_REQUIRED" });
}
const isMissingAtomicUpdateFunction = (error) => ["PGRST202", "42883"].includes(String(error?.code || ""));

async function listProjectsForUser(db, userId) {
  const [{ data: owned, error: ownedError }, { data: memberships, error: memberError }] = await Promise.all([
    db.from("projects").select("id,name,source_url,preview_path,updated_at,created_at,starred").eq("owner_id", userId).order("updated_at", { ascending: false }),
    db.from("project_members").select("projects(id,name,source_url,preview_path,updated_at,created_at,starred)").eq("user_id", userId)
  ]);
  if (ownedError) throw ownedError;
  if (memberError) throw memberError;
  const shared = (memberships || []).map(m => m.projects).filter(Boolean);
  const byId = new Map();
  [...(owned || []), ...shared].forEach(p => byId.set(p.id, p));
  return [...byId.values()].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

function draftPayload(body) {
  const draft = body?.current_draft ?? body?.patches ?? body?.draft;
  const base = { patches: [], labs: [], tokens: {}, sections: [], slices: [], prototypeLinks: [], motion: [], vectorLayers: [], styles: {}, components: [] };
  if (Array.isArray(draft)) return { ...base, patches: draft, labs: body?.labs || [], tokens: body?.tokens || {} };
  if (draft && typeof draft === "object") return { ...base, ...draft };
  return base;
}

const presenceStore = new Map();

function setPresence(projectId, userId, payload) {
  const key = `${projectId}:${userId}`;
  presenceStore.set(key, { ...payload, userId, updatedAt: Date.now() });
}

function getPresence(projectId) {
  const now = Date.now();
  const out = [];
  for (const [key, value] of presenceStore) {
    if (!key.startsWith(`${projectId}:`)) continue;
    if (now - value.updatedAt > 15000) { presenceStore.delete(key); continue; }
    out.push(value);
  }
  return out;
}

export function mountCloudRoutes(app) {
  app.post("/api/auth/magic-link", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Supabase is not configured." });
    const email = String(req.body?.email || "").trim();
    const redirectTo = String(req.body?.redirectTo || "").trim();
    if (!email || !redirectTo) return res.status(400).json({ error: "email and redirectTo are required" });
    const { error } = await publicClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) return res.status(400).json({ error: error.message });
    res.status(202).json({ ok: true });
  });

  app.post("/api/auth/session-bridge", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    res.json({ ok: true, user: { id: auth.user.id, email: auth.user.email }, expires_at: req.body?.expires_at || null });
  });

  app.get("/api/projects", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    try {
      const projects = await listProjectsForUser(auth.db, auth.user.id);
      res.json({ projects });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/projects", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const draft = draftPayload(req.body);
    const project = {
      owner_id: auth.user.id,
      name: String(req.body?.name || "Untitled remix"),
      source_url: String(req.body?.sourceUrl || req.body?.source_url || ""),
      source_fingerprint: req.body?.fingerprint || {},
      current_draft: draft,
      canvas_meta: req.body?.canvas_meta || { sections: draft.sections || [], viewportState: { scale: 1, x: 0, y: 0 } }
    };
    const { data, error } = await auth.db.from("projects").insert(project).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ project: data });
  });

  app.get("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const { data: project, error } = await auth.db.from("projects").select("*").eq("id", req.params.projectId).single();
    if (error || !project) return res.status(404).json({ error: "Project not found." });
    const [{ data: revisions }, { data: members }, { data: comments }] = await Promise.all([
      auth.db.from("revisions").select("id,name,description,created_at,preview_path").eq("project_id", project.id).order("created_at", { ascending: false }),
      auth.db.from("project_members").select("user_id,role,created_at").eq("project_id", project.id),
      auth.db.from("comments").select("id,body,target_anchor,created_at,resolved_at,author_id").eq("project_id", project.id).order("created_at", { ascending: false })
    ]);
    res.json({ project, revisions: revisions || [], members: members || [], comments: comments || [] });
  });

  app.patch("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.name) patch.name = String(req.body.name).slice(0, 120);
    if (req.body?.current_draft !== undefined || req.body?.patches !== undefined || req.body?.draft !== undefined) patch.current_draft = draftPayload(req.body);
    if (req.body?.canvas_meta !== undefined) patch.canvas_meta = req.body.canvas_meta;
    if (req.body?.preview_path) patch.preview_path = req.body.preview_path;
    if (req.body?.starred !== undefined) patch.starred = Boolean(req.body.starred);

    const suppliedBaseVersion = req.body?.base_version;
    const hasBaseVersion = suppliedBaseVersion !== undefined && suppliedBaseVersion !== null && suppliedBaseVersion !== "";
    const requestedBaseVersion = Number(suppliedBaseVersion);
    if (hasBaseVersion && (!Number.isSafeInteger(requestedBaseVersion) || requestedBaseVersion < 0)) {
      return res.status(400).json({ error: "base_version must be a non-negative integer.", code: "INVALID_BASE_VERSION" });
    }

    // The extension includes a base version for every draft save. Perform that
    // comparison inside Postgres, rather than SELECTing then UPDATEing here:
    // two requests can otherwise both observe the same version and the latter
    // silently overwrites the former.
    if (hasBaseVersion) {
      const { data: result, error } = await auth.client
        .rpc("tinkr_update_project_if_version", {
          p_project_id: req.params.projectId,
          p_base_version: requestedBaseVersion,
          p_patch: patch
        })
        .maybeSingle();

      if (error) {
        if (isMissingAtomicUpdateFunction(error)) {
          return res.status(503).json({
            error: "tinkr Cloud needs the latest project-save migration before versioned drafts can sync.",
            code: "CLOUD_MIGRATION_REQUIRED",
            retryable: false
          });
        }
        return res.status(400).json({ error: error.message });
      }

      if (!result || result.outcome === "not_found") return res.status(404).json({ error: "Project not found." });
      if (result.outcome === "forbidden") return editorRequired(res);
      if (result.outcome === "conflict") {
        return res.status(409).json({
          error: "This project changed in another tinkr session. Review or reopen it before overwriting newer work.",
          code: "CONFLICT",
          current_version: Number(result.current_version || 0)
        });
      }
      if (result.outcome !== "updated" || !result.project) {
        return res.status(400).json({ error: "tinkr Cloud could not apply this project update.", code: "PROJECT_UPDATE_FAILED" });
      }
      return res.json({ project: result.project });
    }

    const { data, error } = await auth.db.from("projects").update(patch).eq("id", req.params.projectId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ project: data });
  });

  app.patch("/api/projects/:projectId/star", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const { data, error } = await auth.db.from("projects").update({ starred: Boolean(req.body?.starred), updated_at: new Date().toISOString() }).eq("id", req.params.projectId).select("id,starred").single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ project: data });
  });

  app.get("/api/projects/:projectId/dev-spec", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const selector = String(req.query.selector || "");
    const { data: project, error } = await auth.db.from("projects").select("current_draft").eq("id", req.params.projectId).single();
    if (error || !project) return res.status(404).json({ error: "Project not found." });
    const patches = project.current_draft?.patches || [];
    const match = patches.filter(p => p.selector === selector || p.target?.selector === selector);
    res.json({ selector, patches: match, draft: project.current_draft });
  });

  app.delete("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { data: project } = await auth.db.from("projects").select("owner_id").eq("id", req.params.projectId).maybeSingle();
    if (!project || project.owner_id !== auth.user.id) return res.status(404).json({ error: "Project not found." });
    const { error } = await auth.db.from("projects").delete().eq("id", req.params.projectId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.get("/api/projects/:projectId/revisions", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const { data, error } = await auth.db.from("revisions").select("*").eq("project_id", req.params.projectId).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ revisions: data });
  });

  app.post("/api/projects/:projectId/revisions", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const draft = draftPayload(req.body);
    const row = {
      project_id: req.params.projectId,
      author_id: auth.user.id,
      name: req.body?.name || null,
      description: req.body?.description || null,
      source_fingerprint: req.body?.fingerprint || {},
      patch_snapshot: draft.patches || draft,
      draft_snapshot: req.body?.draft_snapshot || draft,
      preview_path: req.body?.previewPath || null
    };
    const { data, error } = await auth.db.from("revisions").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ revision: data });
  });

  app.get("/api/projects/:projectId/comments", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const { data, error } = await auth.db.from("comments").select("*").eq("project_id", req.params.projectId).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ comments: data });
  });

  app.post("/api/projects/:projectId/comments", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canCommentOnProject(access)) return res.status(403).json({ error: "Commenter access is required to add a comment.", code: "COMMENTER_REQUIRED" });
    const row = {
      project_id: req.params.projectId,
      revision_id: req.body?.revisionId || null,
      author_id: auth.user.id,
      target_anchor: req.body?.target_anchor || req.body?.anchor || null,
      body: String(req.body?.body || "").trim()
    };
    if (!row.body) return res.status(400).json({ error: "body is required" });
    const { data, error } = await auth.db.from("comments").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ comment: data });
  });

  app.patch("/api/projects/:projectId/comments/:commentId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canCommentOnProject(access)) return res.status(403).json({ error: "Commenter access is required to change a comment.", code: "COMMENTER_REQUIRED" });
    const patch = {};
    if (req.body?.resolved === true) patch.resolved_at = new Date().toISOString();
    if (req.body?.resolved === false) patch.resolved_at = null;
    if (req.body?.body) patch.body = String(req.body.body).trim();
    const { data, error } = await auth.db.from("comments").update(patch).eq("id", req.params.commentId).eq("project_id", req.params.projectId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ comment: data });
  });

  app.post("/api/projects/:projectId/members", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { data: project } = await auth.db.from("projects").select("owner_id").eq("id", req.params.projectId).maybeSingle();
    if (!project || project.owner_id !== auth.user.id) return res.status(404).json({ error: "Project not found." });
    const email = String(req.body?.email || "").trim();
    const role = req.body?.role || "viewer";
    if (!email) return res.status(400).json({ error: "email is required" });
    let userId = req.body?.userId;
    if (!userId) {
      const listed = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = listed?.data?.users?.find(u => u.email === email)?.id;
    }
    if (!userId) return res.status(404).json({ error: "User not found. They must sign up first." });
    const { data, error } = await auth.db.from("project_members").upsert({ project_id: req.params.projectId, user_id: userId, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ member: data });
  });

  app.get("/api/projects/:projectId/assets", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const { data, error } = await auth.db.from("assets").select("id,storage_path,mime_type,byte_size,created_at").eq("project_id", req.params.projectId).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ assets: data || [] });
  });

  app.get("/api/projects/:projectId/assets/:assetId/url", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    const { data: asset, error } = await auth.db.from("assets").select("id,storage_path,mime_type,byte_size,created_at").eq("id", req.params.assetId).eq("project_id", req.params.projectId).single();
    if (error || !asset) return res.status(404).json({ error: "Asset not found." });
    const signed = await signedAssetUrl(auth.db, asset.storage_path);
    if (signed.error) return res.status(400).json({ error: signed.error, code: "ASSET_URL_FAILED" });
    res.json({ asset, ...signed });
  });

  app.delete("/api/projects/:projectId/assets/:assetId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const { data: asset } = await auth.db.from("assets").select("storage_path").eq("id", req.params.assetId).eq("project_id", req.params.projectId).single();
    if (asset?.storage_path) await auth.db.storage.from(ASSET_BUCKET).remove([asset.storage_path]);
    const { error } = await auth.db.from("assets").delete().eq("id", req.params.assetId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.post("/api/projects/:projectId/assets/upload-url", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const input = assetUploadInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error, code: input.code, retryable: false });
    const path = assetStoragePath(auth.user.id, req.params.projectId, input.assetId);
    const { data, error } = await auth.db.storage.from(ASSET_BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error) return res.status(400).json({ error: error.message, code: "ASSET_UPLOAD_URL_FAILED" });
    // Do not create an assets row until the signed upload has actually
    // completed. This keeps a failed/offline upload from becoming a broken
    // cloud asset and makes completion idempotent for a retried message.
    res.json({ assetId: input.assetId, uploadUrl: data.signedUrl, path });
  });

  app.post("/api/projects/:projectId/assets/complete", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const input = assetUploadInput(req.body);
    if (input.error) return res.status(400).json({ error: input.error, code: input.code, retryable: false });

    const path = assetStoragePath(auth.user.id, req.params.projectId, input.assetId);
    if (req.body?.path && String(req.body.path) !== path) {
      return res.status(400).json({ error: "That asset does not belong to this project.", code: "ASSET_PATH_INVALID", retryable: false });
    }
    const folder = `${auth.user.id}/${req.params.projectId}`;
    const { data: objects, error: listError } = await auth.db.storage.from(ASSET_BUCKET).list(folder, { limit: 100, search: input.assetId });
    if (listError) return res.status(400).json({ error: listError.message, code: "ASSET_LOOKUP_FAILED" });
    const object = (objects || []).find(item => item.name === input.assetId);
    if (!object) {
      return res.status(409).json({ error: "The asset upload has not completed yet. Keep the local copy and try again.", code: "ASSET_UPLOAD_PENDING", retryable: true });
    }

    const { data: existing, error: existingError } = await auth.db.from("assets").select("id,storage_path,mime_type,byte_size,created_at").eq("id", input.assetId).eq("project_id", req.params.projectId).maybeSingle();
    if (existingError) return res.status(400).json({ error: existingError.message, code: "ASSET_LOOKUP_FAILED" });
    let asset = existing;
    if (!asset) {
      const storedSize = Number(object.metadata?.size);
      const storedMime = String(object.metadata?.mimetype || input.mimeType).toLowerCase();
      const { data, error } = await auth.db.from("assets").insert({
        id: input.assetId,
        project_id: req.params.projectId,
        uploader_id: auth.user.id,
        storage_path: path,
        mime_type: storedMime.startsWith("image/") ? storedMime : input.mimeType,
        byte_size: Number.isFinite(storedSize) && storedSize >= 0 ? storedSize : input.byteSize
      }).select("id,storage_path,mime_type,byte_size,created_at").single();
      if (error) {
        // The object is private and user-scoped. Leave it intact on a transient
        // database failure so the same completion request can safely retry.
        return res.status(400).json({ error: error.message, code: "ASSET_REGISTER_FAILED", retryable: true });
      }
      asset = data;
    }
    const signed = await signedAssetUrl(auth.db, asset.storage_path);
    if (signed.error) return res.status(400).json({ error: signed.error, code: "ASSET_URL_FAILED" });
    res.status(existing ? 200 : 201).json({ asset, ...signed });
  });

  app.post("/api/projects/:projectId/share", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    if (!canEditProject(access)) return editorRequired(res);
    const token = crypto.randomBytes(32).toString("base64url");
    const row = { project_id: req.params.projectId, revision_id: req.body?.revisionId, created_by: auth.user.id, token_hash: tokenHash(token), expires_at: req.body?.expiresAt || null };
    const { error } = await auth.db.from("share_links").insert(row);
    if (error) return res.status(400).json({ error: error.message });
    const base = process.env.PUBLIC_APP_URL || "http://localhost:3000";
    res.status(201).json({ url: `${base}/review/${token}` });
  });

  app.get("/api/review/:token", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Supabase is not configured." });
    try {
      const { data: link, error } = await serviceClient().from("share_links").select("id, expires_at, revoked_at, revisions(id, name, description, patch_snapshot, draft_snapshot, preview_path, created_at, projects(id, name, source_url, preview_path))").eq("token_hash", tokenHash(req.params.token)).maybeSingle();
      if (error || !link || link.revoked_at || (link.expires_at && new Date(link.expires_at) <= new Date())) return res.status(404).json({ error: "This share link is unavailable." });
      res.json({ revision: link.revisions });
    } catch (error) { res.status(503).json({ error: error.message }); }
  });

  app.get("/api/projects/:projectId/realtime", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    res.json({
      supabaseUrl: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      accessToken: bearer(req),
      channel: `project:${req.params.projectId}`
    });
  });

  app.post("/api/projects/:projectId/presence", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    setPresence(req.params.projectId, auth.user.id, {
      email: auth.user.email,
      cursor: req.body?.cursor || null,
      message: req.body?.message || null,
      color: req.body?.color || null
    });
    res.json({ ok: true });
  });

  app.get("/api/projects/:projectId/presence", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const access = await canAccessProject(auth.db, auth.user.id, req.params.projectId);
    if (!access) return res.status(404).json({ error: "Project not found." });
    res.json({ presence: getPresence(req.params.projectId) });
  });
}
