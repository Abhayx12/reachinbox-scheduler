export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{description}</p>
    </div>
  );
}
