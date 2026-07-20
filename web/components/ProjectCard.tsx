import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean };

export function ProjectCard({ project }: { project: Project }) {
  const openUrl = `${project.source_url}${project.source_url.includes("?") ? "&" : "?"}tinkr_project=${project.id}`;
  let hostname = project.source_url;
  try { hostname = new URL(project.source_url).hostname; } catch { /* preserve saved source */ }
  return <article className="project-card">
    <div className="project-card__preview">
      {project.preview_path ? <img src={project.preview_path} alt={`Preview of ${project.name}`} /> : <Icon name="layers" size={28}/>}
      <span className="project-card__source">{hostname}</span>
    </div>
    <div className="project-card__body">
      <div><strong>{project.name}</strong><p>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(project.updated_at))}</p></div>
      <div className="project-card__actions">
        <Link className="tk-button" href={`/projects/${project.id}/edit`}><Icon name="edit"/>Edit</Link>
        <a className="tk-button tk-icon-button" href={openUrl} aria-label="Open in the Tinkr extension" title="Open in extension"><Icon name="external"/></a>
        <Link className="tk-button tk-icon-button" href={`/projects/${project.id}`} aria-label="More project options" title="Project options"><Icon name="more"/></Link>
      </div>
    </div>
  </article>;
}
