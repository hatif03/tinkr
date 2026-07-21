"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { AuthSessionGuard } from "@/components/AuthSessionGuard";
import { SignOutButton } from "@/components/SignOutButton";

const links: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
  { href: "/dashboard", label: "Recents", icon: "clock", exact: true },
  { href: "/dashboard?filter=starred", label: "Starred", icon: "star" },
  { href: "/dashboard?filter=all", label: "All projects", icon: "folder" },
  { href: "/libraries", label: "Libraries", icon: "library" }
];

export function AppShell({ children, email }: { children: React.ReactNode; email?: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <div className="tk-shell">
    <AuthSessionGuard />
    <aside className="tk-sidebar">
      <Link href="/dashboard" className="tk-logo" aria-label="tinkr home">
        <span className="tk-logo-mark"><img src="/brand/tinkr-128.png" alt="" width={31} height={31} /></span><span>tinkr</span>
      </Link>
      <nav className="tk-nav" aria-label="Workspace">
        {links.map(link => {
          const linkFilter = link.href.split("filter=")[1];
          const active = link.exact ? pathname === link.href && !search.get("filter") : linkFilter ? pathname === "/dashboard" && search.get("filter") === linkFilter : pathname === link.href;
          return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} title={link.label}>
            <Icon name={link.icon} size={16}/><span>{link.label}</span>
          </Link>;
        })}
      </nav>
      <div className="tk-sidebar-compact-account" title={email || "Account"}>
        <SignOutButton compact />
      </div>
      <div className="tk-sidebar-foot">
        {email && <span className="tk-account" title={email}>{email}</span>}
        <SignOutButton />
      </div>
    </aside>
    <main className="tk-main">{children}</main>
  </div>;
}
