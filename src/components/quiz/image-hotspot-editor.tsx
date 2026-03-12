"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Upload } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { ImageSearchDialog } from "@/components/quiz/image-search";

interface Props {
  options: {
    imageUrl: string;
    hotspot: { x: number; y: number; radius: number };
    tolerance: number;
  };
  onChange: (opts: Props["options"]) => void;
}

export function ImageHotspotEditor({ options, onChange }: Props) {
  const t = useTranslations("imageHotspot");
  const tc = useTranslations("common");
  const { imageUrl, hotspot, tolerance } = options;
  const [showImageSearch, setShowImageSearch] = useState(false);

  const update = (partial: Partial<Props["options"]>) => {
    onChange({ ...options, ...partial });
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    update({ hotspot: { ...hotspot, x: +x.toFixed(3), y: +y.toFixed(3) } });
  };

  const handleUpload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(withBasePath("/api/upload"), { method: "POST", body: form });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      update({ imageUrl: url });
    } catch {
      alert(t("uploadError"));
    }
  };

  if (!imageUrl) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="url"
            placeholder={t("urlPlaceholder")}
            onBlur={(e) => {
              if (e.target.value && /^https?:\/\//.test(e.target.value))
                update({ imageUrl: e.target.value });
            }}
            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <button
            type="button"
            onClick={() => setShowImageSearch(true)}
            className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-2 rounded-xl text-base border border-indigo-200 dark:border-indigo-700 transition-colors shrink-0"
          >
            <Search className="size-4" />
            {tc("search")}
          </button>
          <label className="flex items-center gap-2 cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-semibold px-4 py-2 rounded-xl text-base transition-colors shrink-0">
            <Upload className="size-4" />
            {tc("upload")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        {showImageSearch && (
          <ImageSearchDialog
            onSelect={(url) => {
              update({ imageUrl: url });
              setShowImageSearch(false);
            }}
            onClose={() => setShowImageSearch(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative inline-block w-full">
        <div
          className="relative cursor-crosshair rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600"
          onClick={handleImageClick}
        >
          <img
            src={imageUrl.startsWith("/") ? withBasePath(imageUrl) : imageUrl}
            alt={t("altText")}
            className="w-full max-h-96 object-contain"
            draggable={false}
          />
          {/* Hotspot marker */}
          <div
            className="absolute rounded-full border-4 border-red-500 bg-red-500/20 pointer-events-none"
            style={{
              left: `${hotspot.x * 100}%`,
              top: `${hotspot.y * 100}%`,
              width: `${hotspot.radius * 200}%`,
              height: `${hotspot.radius * 200}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowImageSearch(true)}
          className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-2 rounded-xl text-sm border border-indigo-200 dark:border-indigo-700 transition-colors"
        >
          <Search className="size-3.5" />
          {t("searchAnother")}
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
          <Upload className="size-3.5" />
          {t("uploadNew")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => update({ imageUrl: "" })}
          className="flex items-center gap-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
        >
          {tc("remove")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            {t("radius")} ({Math.round(hotspot.radius * 100)}%)
          </label>
          <input
            type="range"
            min={0.02}
            max={0.3}
            step={0.01}
            value={hotspot.radius}
            onChange={(e) =>
              update({ hotspot: { ...hotspot, radius: Number(e.target.value) } })
            }
            className="w-full accent-indigo-600"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
            {t("tolerance")} ({Math.round(tolerance * 100)}%)
          </label>
          <input
            type="range"
            min={0}
            max={0.2}
            step={0.01}
            value={tolerance}
            onChange={(e) => update({ tolerance: Number(e.target.value) })}
            className="w-full accent-indigo-600"
          />
        </div>
      </div>

      {showImageSearch && (
        <ImageSearchDialog
          onSelect={(url) => {
            update({ imageUrl: url });
            setShowImageSearch(false);
          }}
          onClose={() => setShowImageSearch(false)}
        />
      )}
    </div>
  );
}
