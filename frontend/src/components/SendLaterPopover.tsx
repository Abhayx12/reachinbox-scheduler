import { useState } from "react";

interface Props {
  value: string; // ISO string
  onChange: (iso: string) => void;
  onClose: () => void;
}

function presetDate(hours: number, minutes: number, dayOffset = 1) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const PRESETS = [
  { label: "Tomorrow, 9:00 AM", date: () => presetDate(9, 0) },
  { label: "Tomorrow, 10:00 AM", date: () => presetDate(10, 0) },
  { label: "Tomorrow, 11:00 AM", date: () => presetDate(11, 0) },
  { label: "Tomorrow, 3:00 PM", date: () => presetDate(15, 0) },
];

export function SendLaterPopover({ value, onChange, onClose }: Props) {
  const [custom, setCustom] = useState(value ? value.slice(0, 16) : "");

  function applyCustomAndClose() {
    if (custom) onChange(new Date(custom).toISOString());
    onClose();
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-line bg-white p-4 shadow-lg">
      <p className="mb-3 text-sm font-semibold text-ink">Send Later</p>

      <label className="mb-1 block text-xs text-muted">Pick date &amp; time</label>
      <input
        type="datetime-local"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        className="mb-3 w-full rounded border border-line px-2 py-1.5 text-sm focus:border-accent"
      />

      <div className="mb-3 border-t border-line pt-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              onChange(p.date().toISOString());
              onClose();
            }}
            className="block w-full rounded px-2 py-1.5 text-left text-sm text-ink hover:bg-paper"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm font-medium text-muted hover:bg-paper">
          Cancel
        </button>
        <button
          type="button"
          onClick={applyCustomAndClose}
          className="rounded-full border border-accent px-4 py-1.5 text-sm font-medium text-accent hover:bg-accentBg"
        >
          Done
        </button>
      </div>
    </div>
  );
}
