import { useRouter } from "next/router";
import { User } from "@/types";
import { api } from "@/lib/api";

interface Props {
  user: User;
  scheduledCount: number;
  sentCount: number;
  activeTab: "scheduled" | "sent";
  onTabChange: (tab: "scheduled" | "sent") => void;
}

export function Sidebar({ user, scheduledCount, sentCount, activeTab, onTabChange }: Props) {
  const router = useRouter();

  async function handleLogout() {
    await api.post("/api/auth/logout");
    router.push("/");
  }

  return (
    <aside className="flex h-screen w-72 flex-shrink-0 flex-col border-r border-line bg-white px-4 py-5">
      <div className="mb-6 flex items-center gap-2 px-1">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-ink text-xs font-bold text-white">
          R
        </div>
        <span className="text-sm font-bold tracking-tight text-ink">REACHINBOX</span>
      </div>

      <button
        onClick={() => router.push("/compose")}
        className="mb-2 flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2 text-left hover:bg-line/40"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 flex-shrink-0 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {user.name.charAt(0)}
            </div>
          )}
          <div className="overflow-hidden leading-tight">
            <p className="truncate text-sm font-medium text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>
      </button>

      <button
        onClick={() => router.push("/compose")}
        className="mb-6 w-full rounded-full border border-accent py-2 text-sm font-medium text-accent hover:bg-accentBg"
      >
        Compose
      </button>

      <p className="mb-2 px-2 text-xs font-semibold tracking-wide text-muted">CORE</p>
      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onTabChange("scheduled")}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "scheduled" ? "bg-accentBg text-ink" : "text-muted hover:bg-paper"
          }`}
        >
          <span className="flex items-center gap-2">
            <ClockIcon active={activeTab === "scheduled"} />
            Scheduled
          </span>
          <span className="text-xs text-muted">{scheduledCount}</span>
        </button>
        <button
          onClick={() => onTabChange("sent")}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === "sent" ? "bg-accentBg text-ink" : "text-muted hover:bg-paper"
          }`}
        >
          <span className="flex items-center gap-2">
            <SentIcon active={activeTab === "sent"} />
            Sent
          </span>
          <span className="text-xs text-muted">{sentCount}</span>
        </button>
      </nav>

      <div className="mt-auto pt-4">
        <button onClick={handleLogout} className="w-full rounded px-3 py-2 text-left text-xs text-muted hover:bg-paper hover:text-ink">
          Log out
        </button>
      </div>
    </aside>
  );
}

function ClockIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "#16A34A" : "#6B7080"} strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" />
    </svg>
  );
}

function SentIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "#16A34A" : "#6B7080"} strokeWidth="2">
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
