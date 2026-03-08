"use client";

interface Props {
  options: { correctValue: number; tolerance: number; maxRange: number; unit?: string };
  onChange: (opts: Props["options"]) => void;
}

export function NumericEstimationEditor({ options, onChange }: Props) {
  const { correctValue, tolerance, maxRange, unit } = options;

  const update = (partial: Partial<Props["options"]>) => {
    onChange({ ...options, ...partial });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            Valore corretto
          </label>
          <input
            type="number"
            value={correctValue}
            onChange={(e) => update({ correctValue: Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            Unità di misura
          </label>
          <input
            type="text"
            value={unit ?? ""}
            onChange={(e) => update({ unit: e.target.value || undefined })}
            placeholder="es. km, kg, °C..."
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            Tolleranza (punteggio pieno)
          </label>
          <input
            type="number"
            min={0}
            value={tolerance}
            onChange={(e) => update({ tolerance: Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            Range massimo (punteggio parziale)
          </label>
          <input
            type="number"
            min={0}
            value={maxRange}
            onChange={(e) => update({ maxRange: Number(e.target.value) })}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 px-4 py-3 text-base text-indigo-700 dark:text-indigo-300 space-y-1">
        <p>
          <span className="font-semibold">Pieno:</span>{" "}
          {correctValue - tolerance} — {correctValue + tolerance} {unit ?? ""}
        </p>
        <p>
          <span className="font-semibold">Parziale:</span> fino a ±{maxRange} {unit ?? ""}
        </p>
      </div>
    </div>
  );
}
