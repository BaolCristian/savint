/**
 * Sorgente unica per i colori del gioco live (host + player).
 * Mapping colore↔forma coerente su entrambe le viste (utile anche ai daltonici).
 * Ordine tessere: 0=blu ▲, 1=arancio ◆, 2=magenta ●, 3=verde ■.
 */

export const ANSWER_TILES = [
  { gradient: "from-brand-blue to-blue-700",       solid: "bg-brand-blue",    shape: "▲", ring: "ring-blue-300" },     // ▲
  { gradient: "from-brand-orange to-orange-600",   solid: "bg-brand-orange",  shape: "◆", ring: "ring-orange-300" },   // ◆
  { gradient: "from-brand-magenta to-pink-700",    solid: "bg-brand-magenta", shape: "●", ring: "ring-pink-300" },     // ●
  { gradient: "from-brand-green to-green-700",     solid: "bg-brand-green",   shape: "■", ring: "ring-green-300" },     // ■
] as const;

/** Palette coriandoli unica (prima duplicata in host-view e player-view). */
export const CONFETTI_COLORS = [
  "#2C7BE5", "#F5921E", "#5DB82C", "#E01B6A",
  "#4D96FF", "#FFD93D", "#00E5FF", "#FF6B6B",
  "#76FF03", "#E040FB", "#FF8C00", "#536DFE",
];

/** Gradienti semantici condivisi. */
export const GAME = {
  correctGradient: "from-emerald-400 to-brand-green",   // "corretto" resta verde
  wrongGradient: "from-red-400 to-rose-600",            // "sbagliato" resta rosso
  brandGradient: "from-brand-blue to-brand-magenta",    // gradiente brand per header/CTA
} as const;
