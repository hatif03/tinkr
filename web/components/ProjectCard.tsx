import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatProjectDate } from "@/lib/format";
import { buildTinkrLaunchUrl, canLaunchInTinkr } from "@/lib/projects";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean };

export function ProjectCard({ project }: { project: Project }) {
  const launchable = canLaunchInTinkr(project.source_url);
  const openUrl = launchable ? buildTinkrLaunchUrl(project.source_url, project.id) : `/projects/${project.id}`;
  let hostname = project.source_url;
  try { hostname = new URL(project.source_url).hostname; } catch { /* preserve saved source */ }
  return <article className="project-card">
    <div className="project-card__preview">
      {project.preview_path ? <img src={project.preview_path} alt={`Preview of ${project.name}`} /> : <Icon name="layers" size={28}/>}
      <span className="project-card__source">{hostname}</span>
    </div>
    <div className="project-card__body">
      <div><strong>{project.name}</strong><p>Updated {formatProjectDate(project.updated_at)}</p></div>
      <div className="project-card__actions">
        <a className="tk-button tk-button--primary" href={openUrl} aria-label={launchable ? "Open in tinkr" : "Open project details"} title={launchable ? "Open in tinkr" : "Open project details"}><Icon name={launchable ? "external" : "more"}/>Open</a>
        <Link className="tk-button tk-icon-button" href={`/projects/${project.id}/edit`} aria-label="Open webboard" title="Open webboard"><Icon name="edit"/></Link>
        <Link className="tk-button tk-icon-button" href={`/projects/${project.id}`} aria-label="Project details" title="Project details"><Icon name="more"/></Link>
      </div>
    </div>
  </article>;
}
