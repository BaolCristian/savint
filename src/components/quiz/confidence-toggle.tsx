"use client";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function ConfidenceToggle({ enabled, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
        />
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </div>
      <span className="text-base text-slate-600 dark:text-slate-400 font-medium">
        Livello di confidenza
      </span>
    </label>
  );
}
