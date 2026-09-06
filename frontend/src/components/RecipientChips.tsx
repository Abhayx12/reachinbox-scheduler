interface Props {
  recipients: string[];
  maxVisible?: number;
}

export function RecipientChips({ recipients, maxVisible = 3 }: Props) {
  if (recipients.length === 0) return null;
  const visible = recipients.slice(0, maxVisible);
  const overflow = recipients.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visible.map((r) => (
        <span
          key={r}
          className="rounded-full border border-signal-sent/40 bg-signal-sentBg px-3 py-1 text-xs font-medium text-signal-sent"
        >
          {r}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-muted">
          +{overflow}
        </span>
      )}
    </div>
  );
}
