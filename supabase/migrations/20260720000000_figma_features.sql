-- Figma-like features: starred projects, full revision snapshots
ALTER TABLE projects ADD COLUMN IF NOT EXISTS starred boolean DEFAULT false;

ALTER TABLE revisions ADD COLUMN IF NOT EXISTS draft_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_projects_starred ON projects (owner_id, starred) WHERE starred = true;
