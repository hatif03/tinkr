import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatProjectDate } from "@/lib/format";
import { buildTinkrLaunchUrl, canLaunchInTinkr } from "@/lib/projects";

type Project = { id: string; name: string; source_url: string; updated_at: string; preview_path?: string; starred?: boolean };

export function ProjectCard({ project }: { project: Project }) {
  const launchable = canLaunchInTinkr(project.source_url);
  const openUrl = launchable ? buildTinkrLaunchUrl(project.source_url, project.id) : `/projects/${project.id}`;
  const openLabel = launchable ? "Open in tinkr" : "Open project details";
  let hostname = project.source_url;
  try { hostname = new URL(project.source_url).hostname; } catch { /* Keep the saved source visible when it cannot be parsed. */ }

  return <article className="project-card">
    <a className="project-card__open" href={openUrl} aria-label={`${openLabel}: ${project.name}`}>
      <div className="project-card__preview">
        {project.preview_path ? <img src={project.preview_path} alt="" /> : <Icon name="layers" size={28} />}
        <span className="project-card__source">{hostname}</span>
      </div>
      <div className="project-card__body">
        <div><strong>{project.name}</strong><p>Updated {formatProjectDate(project.updated_at)}</p></div>
        <span className="project-card__open-label"><Icon name={launchable ? "external" : "more"} size={13} /> {openLabel}</span>
      </div>
    </a>
    <details className="project-card__menu">
      <summary aria-label={`Actions for ${project.name}`} title="Project actions"><Icon name="more" size={17} /></summary>
      <div className="project-card__menu-list">
        {launchable && <a href={openUrl}><Icon name="external" size={14} /> Open in tinkr</a>}
        <Link href={`/projects/${project.id}/edit`}><Icon name="edit" size={14} /> Open webboard</Link>
        <Link href={`/projects/${project.id}`}><Icon name="more" size={14} /> Project details</Link>
      </div>
    </details>
  </article>;
}
