import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const configured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
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

async function requireUser(req, res) {
  if (!configured()) { res.status(503).json({ error: "Supabase is not configured." }); return null; }
  const client = publicClient(bearer(req));
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) { res.status(401).json({ error: "Sign in is required." }); return null; }
  return { client, user };
}

function draftPayload(body) {
  const draft = body?.current_draft ?? body?.patches ?? body?.draft;
  if (Array.isArray(draft)) return { patches: draft, labs: body?.labs || [], tokens: body?.tokens || {}, sections: body?.sections || [], prototypeLinks: body?.prototypeLinks || [], motion: body?.motion || [] };
  if (draft && typeof draft === "object") return draft;
  return { patches: [], labs: [], tokens: {}, sections: [], prototypeLinks: [], motion: [] };
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
    const { data, error } = await auth.client.from("projects").select("id,name,source_url,preview_path,updated_at,created_at").order("updated_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ projects: data });
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
    const { data, error } = await auth.client.from("projects").insert(project).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ project: data });
  });

  app.get("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { data: project, error } = await auth.client.from("projects").select("*").eq("id", req.params.projectId).single();
    if (error || !project) return res.status(404).json({ error: "Project not found." });
    const [{ data: revisions }, { data: members }, { data: comments }] = await Promise.all([
      auth.client.from("revisions").select("id,name,description,created_at,preview_path").eq("project_id", project.id).order("created_at", { ascending: false }),
      auth.client.from("project_members").select("user_id,role,created_at").eq("project_id", project.id),
      auth.client.from("comments").select("id,body,target_anchor,created_at,resolved_at,author_id").eq("project_id", project.id).order("created_at", { ascending: false })
    ]);
    res.json({ project, revisions: revisions || [], members: members || [], comments: comments || [] });
  });

  app.patch("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.name) patch.name = String(req.body.name).slice(0, 120);
    if (req.body?.current_draft !== undefined || req.body?.patches !== undefined || req.body?.draft !== undefined) patch.current_draft = draftPayload(req.body);
    if (req.body?.canvas_meta !== undefined) patch.canvas_meta = req.body.canvas_meta;
    if (req.body?.preview_path) patch.preview_path = req.body.preview_path;
    const { data, error } = await auth.client.from("projects").update(patch).eq("id", req.params.projectId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ project: data });
  });

  app.delete("/api/projects/:projectId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { error } = await auth.client.from("projects").delete().eq("id", req.params.projectId);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.get("/api/projects/:projectId/revisions", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { data, error } = await auth.client.from("revisions").select("*").eq("project_id", req.params.projectId).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ revisions: data });
  });

  app.post("/api/projects/:projectId/revisions", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const draft = draftPayload(req.body);
    const row = {
      project_id: req.params.projectId,
      author_id: auth.user.id,
      name: req.body?.name || null,
      description: req.body?.description || null,
      source_fingerprint: req.body?.fingerprint || {},
      patch_snapshot: draft.patches || draft,
      preview_path: req.body?.previewPath || null
    };
    const { data, error } = await auth.client.from("revisions").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ revision: data });
  });

  app.get("/api/projects/:projectId/comments", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const { data, error } = await auth.client.from("comments").select("*").eq("project_id", req.params.projectId).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ comments: data });
  });

  app.post("/api/projects/:projectId/comments", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const row = {
      project_id: req.params.projectId,
      revision_id: req.body?.revisionId || null,
      author_id: auth.user.id,
      target_anchor: req.body?.target_anchor || req.body?.anchor || null,
      body: String(req.body?.body || "").trim()
    };
    if (!row.body) return res.status(400).json({ error: "body is required" });
    const { data, error } = await auth.client.from("comments").insert(row).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ comment: data });
  });

  app.patch("/api/projects/:projectId/comments/:commentId", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const patch = {};
    if (req.body?.resolved === true) patch.resolved_at = new Date().toISOString();
    if (req.body?.resolved === false) patch.resolved_at = null;
    if (req.body?.body) patch.body = String(req.body.body).trim();
    const { data, error } = await auth.client.from("comments").update(patch).eq("id", req.params.commentId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ comment: data });
  });

  app.post("/api/projects/:projectId/members", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const email = String(req.body?.email || "").trim();
    const role = req.body?.role || "viewer";
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!userId) {
      const listed = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = listed?.data?.users?.find(u => u.email === email)?.id;
    }
    if (!userId) return res.status(404).json({ error: "User not found. They must sign up first." });
    const { data, error } = await auth.client.from("project_members").upsert({ project_id: req.params.projectId, user_id: userId, role }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ member: data });
  });

  app.post("/api/projects/:projectId/assets/upload-url", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const mime = String(req.body?.mimeType || "image/png");
    const path = `${auth.user.id}/${req.params.projectId}/${crypto.randomUUID()}`;
    const { data, error } = await auth.client.storage.from("tinkr-assets").createSignedUploadUrl(path);
    if (error) return res.status(400).json({ error: error.message });
    await auth.client.from("assets").insert({ project_id: req.params.projectId, uploader_id: auth.user.id, storage_path: path, mime_type: mime, byte_size: Number(req.body?.byteSize || 0) });
    res.json({ uploadUrl: data.signedUrl, path, token: data.token });
  });

  app.post("/api/projects/:projectId/share", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
    const token = crypto.randomBytes(32).toString("base64url");
    const row = { project_id: req.params.projectId, revision_id: req.body?.revisionId, created_by: auth.user.id, token_hash: tokenHash(token), expires_at: req.body?.expiresAt || null };
    const { error } = await auth.client.from("share_links").insert(row);
    if (error) return res.status(400).json({ error: error.message });
    const base = process.env.PUBLIC_APP_URL || "http://localhost:3000";
    res.status(201).json({ url: `${base}/review/${token}` });
  });

  app.get("/api/review/:token", async (req, res) => {
    if (!configured()) return res.status(503).json({ error: "Supabase is not configured." });
    try {
      const { data: link, error } = await serviceClient().from("share_links").select("id, expires_at, revoked_at, revisions(id, name, description, patch_snapshot, preview_path, created_at, projects(id, name, source_url, preview_path))").eq("token_hash", tokenHash(req.params.token)).maybeSingle();
      if (error || !link || link.revoked_at || (link.expires_at && new Date(link.expires_at) <= new Date())) return res.status(404).json({ error: "This share link is unavailable." });
      res.json({ revision: link.revisions });
    } catch (error) { res.status(503).json({ error: error.message }); }
  });

  app.get("/api/projects/:projectId/realtime", async (req, res) => {
    const auth = await requireUser(req, res);
    if (!auth) return;
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
    res.json({ presence: getPresence(req.params.projectId) });
  });
}
