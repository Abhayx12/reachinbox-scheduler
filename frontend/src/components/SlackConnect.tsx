import useSWR from "swr";
import { fetcher, API_BASE, api } from "@/lib/api";
import { Button } from "./Button";

export function SlackConnect() {
  const { data, mutate } = useSWR("/api/slack/status", fetcher);
  const connected = data?.connected;

  async function disconnect() {
    await api.post("/api/slack/disconnect");
    mutate();
  }

  return (
    <div className="flex items-center gap-2 rounded border border-line bg-white px-3 py-1.5 text-sm">
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-signal-sent" : "bg-line"}`} />
      <span className="text-muted">
        {connected ? `Slack connected (${data.integration?.team_name ?? "workspace"})` : "Slack not connected"}
      </span>
      {connected ? (
        <Button variant="ghost" onClick={disconnect} className="px-2 py-0.5 text-xs">
          Disconnect
        </Button>
      ) : (
        <a href={`${API_BASE}/api/slack/oauth/start`}>
          <Button variant="ghost" className="px-2 py-0.5 text-xs">
            Connect Slack
          </Button>
        </a>
      )}
    </div>
  );
}
