import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { EmailList } from "@/components/EmailList";
import { SlackConnect } from "@/components/SlackConnect";
import { User } from "@/types";

type Tab = "scheduled" | "sent";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("scheduled");

  useEffect(() => {
    api
      .get("/api/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => router.replace("/"))
      .finally(() => setAuthChecked(true));
  }, [router]);

  const { data: scheduledData, isLoading: scheduledLoading } = useSWR(
    user ? "/api/emails?status=scheduled" : null,
    fetcher,
    { refreshInterval: 10000 }
  );
  const { data: sentData, isLoading: sentLoading } = useSWR(
    user ? "/api/emails?status=sent" : null,
    fetcher,
    { refreshInterval: 10000 }
  );

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Loading…</div>;
  }
  if (!user) return null;

  const activeData = tab === "scheduled" ? scheduledData : sentData;
  const activeLoading = tab === "scheduled" ? scheduledLoading : sentLoading;

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar
        user={user}
        scheduledCount={scheduledData?.emails?.length ?? 0}
        sentCount={sentData?.emails?.length ?? 0}
        activeTab={tab}
        onTabChange={setTab}
      />

      <main className="flex-1 px-8 py-6">
        <div className="mb-4 flex items-center justify-end">
          <SlackConnect />
        </div>

        <EmailList emails={activeData?.emails} isLoading={activeLoading} mode={tab} />
      </main>
    </div>
  );
}
