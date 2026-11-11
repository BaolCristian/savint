/**
 * Timer ad anello delle partite live: sul proiettore è l'elemento che la
 * classe guarda di più, sul telefono sta nell'angolo. Il colore segue il
 * tempo rimasto (verde → arancio → magenta negli ultimi 5 secondi) e il
 * numero resta sempre leggibile, anche per chi non distingue i colori.
 */
const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerRing({
  timeLeft,
  total,
  label,
  className = "",
}: {
  timeLeft: number;
  total: number;
  /** Testo per gli screen reader, es. "Tempo rimasto" */
  label: string;
  className?: string;
}) {
  const running = timeLeft > 0;
  // L'anello scorre in modo continuo verso il secondo successivo, così
  // arriva a zero insieme al numero invece che un secondo dopo.
  const target = timeLeft < total ? Math.max(0, timeLeft - 1) : timeLeft;
  const fraction = total > 0 ? Math.min(1, target / total) : 0;
  const color = !running
    ? "transparent"
    : timeLeft <= 5
      ? "var(--brand-magenta)"
      : timeLeft <= 10
        ? "var(--brand-orange)"
        : "var(--brand-green)";

  return (
    <div
      role="timer"
      aria-label={`${label}: ${timeLeft}`}
      className={`relative shrink-0 ${running && timeLeft <= 5 ? "animate-countdown-pulse" : ""} ${className}`}
    >
      <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
        <circle cx="50" cy="50" r={RADIUS} fill="rgb(0 0 0 / 0.25)" stroke="rgb(255 255 255 / 0.14)" strokeWidth="8" />
        <circle
          className="timer-ring-arc"
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform="rotate(-90 50 50)"
        />
        <text
          x="50"
          y="51"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="38"
          fontWeight="800"
          fill="white"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {timeLeft}
        </text>
      </svg>
    </div>
  );
}
