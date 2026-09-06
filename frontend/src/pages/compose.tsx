import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { api, fetcher } from "@/lib/api";
import { RecipientChips } from "@/components/RecipientChips";
import { SendLaterPopover } from "@/components/SendLaterPopover";
import { Sender } from "@/types";

function defaultStartTime() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export default function Compose() {
  const router = useRouter();
  const { data: sendersData } = useSWR("/api/senders", fetcher);
  const senders: Sender[] = sendersData?.senders ?? [];

  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [delayMs, setDelayMs] = useState(2000);
  const [hourlyLimit, setHourlyLimit] = useState(200);
  const [sendAt, setSendAt] = useState(defaultStartTime());
  const [showSendLater, setShowSendLater] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!senderId && senders.length > 0) setSenderId(senders[0].id);
  }, [senders, senderId]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await api.post("/api/parse-leads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setRecipients(data.emails);
    } catch {
      setError("Couldn't parse that file. Try a CSV with an email column.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSend() {
    setError(null);
    if (!subject || !body || recipients.length === 0 || !senderId) {
      setError("Fill in subject, body, sender, and upload at least one recipient.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/schedule", {
        subject,
        body,
        senderId,
        startTime: sendAt,
        delayBetweenEmailsMs: delayMs,
        hourlyLimit,
        recipients,
      });
      router.push("/dashboard");
    } catch (err: any) {
      setError(
        err?.response?.data?.error ? JSON.stringify(err.response.data.error) : "Failed to schedule."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const sendAtLabel = new Date(sendAt).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-3 text-lg font-semibold text-ink"
          >
            <BackArrow />
            Compose New Email
          </button>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer text-muted hover:text-ink" title="Attach / upload list">
              <PaperclipIcon />
              <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            </label>
            <div className="relative">
              <button
                onClick={() => setShowSendLater((s) => !s)}
                className="text-muted hover:text-ink"
                title="Send later"
              >
                <ClockIcon />
              </button>
              {showSendLater && (
                <SendLaterPopover
                  value={sendAt}
                  onChange={setSendAt}
                  onClose={() => setShowSendLater(false)}
                />
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={submitting}
              className="rounded-full border border-accent px-5 py-1.5 text-sm font-medium text-accent hover:bg-accentBg disabled:opacity-50"
            >
              {submitting ? "Scheduling…" : "Send Later"}
            </button>
          </div>
        </div>

        <p className="mb-4 text-xs text-muted">
          Sending <span className="font-medium text-ink">{sendAtLabel}</span>
        </p>

        <div className="space-y-4 border-b border-line pb-4">
          <div className="flex items-center gap-4">
            <span className="w-16 flex-shrink-0 text-sm text-muted">From</span>
            <select
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm"
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.email}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-4">
            <span className="mt-2 w-16 flex-shrink-0 text-sm text-muted">To</span>
            <div className="flex-1">
              {recipients.length > 0 ? (
                <RecipientChips recipients={recipients} maxVisible={4} />
              ) : (
                <input
                  disabled
                  placeholder="recipient@example.com"
                  className="w-full rounded border-0 bg-transparent px-0 py-2 text-sm text-muted"
                />
              )}
            </div>
            <label className="flex flex-shrink-0 cursor-pointer items-center gap-1 text-sm font-medium text-accent">
              <UploadIcon />
              Upload List
              <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
            </label>
          </div>
          {parsing && <p className="pl-20 text-xs text-muted">Parsing file…</p>}
          {!parsing && recipients.length > 0 && (
            <p className="pl-20 text-xs text-signal-sent">{recipients.length} email address(es) detected</p>
          )}

          <div className="flex items-center gap-4">
            <span className="w-16 flex-shrink-0 text-sm text-muted">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 border-0 border-b border-transparent bg-transparent px-0 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-8 pl-20">
            <label className="flex items-center gap-2 text-sm text-ink">
              Delay between 2 emails
              <input
                type="number"
                min={0}
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value || "0", 10))}
                className="w-16 rounded border border-line bg-paper px-2 py-1 text-center text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              Hourly Limit
              <input
                type="number"
                min={1}
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(parseInt(e.target.value || "1", 10))}
                className="w-16 rounded border border-line bg-paper px-2 py-1 text-center text-sm"
              />
            </label>
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type Your Reply..."
          rows={12}
          className="mt-4 w-full resize-none rounded-lg bg-paper px-4 py-4 text-sm text-ink outline-none placeholder:text-muted"
        />

        {error && <p className="mt-3 text-sm text-signal-failed">{error}</p>}
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95L10.13 17.02a2 2 0 01-2.83-2.83l8.49-8.49" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12M7 8l5-5 5 5M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
