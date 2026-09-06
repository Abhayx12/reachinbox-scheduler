import { useState } from "react";
import { EmailRow } from "@/types";
import { EmptyState } from "./EmptyState";
import { TableSkeleton } from "./TableSkeleton";

interface Props {
  emails: EmailRow[] | undefined;
  isLoading: boolean;
  mode: "scheduled" | "sent";
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

function Pill({ mode, status }: { mode: "scheduled" | "sent"; status: string }) {
  if (mode === "sent") {
    const isFailed = status === "failed";
    return (
      <span
        className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
          isFailed ? "bg-signal-failedBg text-signal-failed" : "bg-signal-sentBg text-signal-sent"
        }`}
      >
        {isFailed ? "Failed" : "Sent"}
      </span>
    );
  }
  return (
    <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-signal-scheduledBg px-3 py-1 text-xs font-medium text-signal-scheduled">
      <ClockDot />
      {status === "rescheduled" ? "Rescheduled" : status === "processing" ? "Sending" : "Scheduled"}
    </span>
  );
}

function ClockDot() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C4C6CC" strokeWidth="1.5">
      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2" />
    </svg>
  );
}

export function EmailList({ emails, isLoading, mode }: Props) {
  const [query, setQuery] = useState("");

  if (isLoading) return <TableSkeleton />;

  const filtered = (emails || []).filter((e) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return e.recipient_email.toLowerCase().includes(q) || e.subject.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2.5">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
      </div>

      {filtered.length === 0 ? (
        mode === "scheduled" ? (
          <EmptyState
            title="No scheduled emails yet"
            description="Compose a new email to start filling your send queue."
          />
        ) : (
          <EmptyState
            title="Nothing sent yet"
            description="Emails will show up here once they're delivered by a worker."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          {filtered.map((e, i) => (
            <div
              key={e.id}
              className={`flex items-center gap-4 px-5 py-4 hover:bg-paper/70 ${
                i !== filtered.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <span className="w-40 flex-shrink-0 truncate text-sm font-semibold text-ink">
                To: {e.recipient_email.split("@")[0]}
              </span>
              <Pill mode={mode} status={e.status} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                <span className="font-medium">{e.subject}</span>
                <span className="text-muted"> — {e.error_message || "Scheduled cold outreach message"}</span>
              </span>
              <span className="flex-shrink-0 text-xs text-muted">
                {formatTime(mode === "scheduled" ? e.scheduled_time : e.sent_at)}
              </span>
              <StarIcon />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7080" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
    </svg>
  );
}
