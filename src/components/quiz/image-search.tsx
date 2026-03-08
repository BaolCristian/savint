"use client";

import { useState, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";

interface ImageHit {
  id: number;
  preview: string;
  web: string;
  thumb: string;
  user: string;
  tags: string;
}

export function ImageSearchDialog({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ImageHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const res = await fetch(`/api/image-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      console.log("[image-search] response:", res.status, data);

      if (!res.ok) {
        throw new Error(data.error || "Errore nella ricerca");
      }

      setResults(data.hits ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella ricerca");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Search className="size-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">Cerca immagini</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-4 border-b border-slate-100">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-3"
          >
            <div className="flex-1 flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 px-4 py-2.5 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-indigo-300 transition-all">
              <Search className="size-4 text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Es: scuola, matematica, natura, scienza..."
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 outline-none"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold px-6 py-2.5 rounded-xl transition-all active:scale-[0.97]"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Cerca"}
            </button>
          </form>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-5 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="size-8 animate-spin mb-3" />
              <p className="text-sm">Ricerca in corso...</p>
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <span className="text-5xl mb-3">🔍</span>
              <p className="text-sm font-medium">Nessun risultato trovato</p>
              <p className="text-xs mt-1">Prova con un termine diverso</p>
            </div>
          )}

          {!loading && !searched && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <span className="text-5xl mb-3">🖼️</span>
              <p className="text-sm font-medium">Cerca immagini gratuite da Pixabay</p>
              <p className="text-xs mt-1">Le immagini sono libere da copyright</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {results.map((hit) => (
                <button
                  key={hit.id}
                  onClick={() => onSelect(hit.web)}
                  className="group relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <img
                    src={hit.preview}
                    alt={hit.tags}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-[10px] truncate">📷 {hit.user}</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-white/90 text-indigo-700 font-bold text-xs px-3 py-1.5 rounded-full shadow">
                      Usa questa
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-center">
          <p className="text-[11px] text-slate-400">
            Immagini fornite da <a href="https://pixabay.com" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline font-medium">Pixabay</a> — libere da copyright
          </p>
        </div>
      </div>
    </div>
  );
}
