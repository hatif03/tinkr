"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const COLORS = ["#b8ff37", "#7ce9ff", "#ff9da2", "#c4a1ff", "#ffb347", "#6ee7b7"];

export function LivePresence({ projectId }: { projectId: string }) {
  const [users, setUsers] = useState<Array<{ userId: string; email?: string }>>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`project:${projectId}`, { config: { presence: { key: "web" } } });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const list = Object.values(state).flat() as unknown as Array<{ userId: string; email?: string }>;
      setUsers(list);
    }).subscribe(async status => {
      if (status === "SUBSCRIBED") {
        const { data: { user } } = await supabase.auth.getUser();
        await channel.track({ userId: user?.id, email: user?.email, online_at: new Date().toISOString() });
      }
    });
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  if (!users.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {users.map((u, i) => (
        <span key={u.userId || i} style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#111" }}>
          {(u.email || "?")[0].toUpperCase()}
        </span>
      ))}
    </div>
  );
}
