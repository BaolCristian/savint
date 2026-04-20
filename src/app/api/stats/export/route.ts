import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import Papa from "papaparse";

const questionTypeLabel: Record<string, string> = {
  MULTIPLE_CHOICE: "Scelta multipla",
  TRUE_FALSE: "Vero/Falso",
  OPEN_ANSWER: "Risposta aperta",
  ORDERING: "Ordinamento",
  MATCHING: "Abbinamento",
};

export async function GET(req: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("sessionId");
  const format = searchParams.get("format") ?? "csv";

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId obbligatorio" },
      { status: 400 },
    );
  }

  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json(
      { error: "Formato non supportato. Usa csv o pdf." },
      { status: 400 },
    );
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId, hostId: authSession.user.id, isTest: false },
    include: {
      quiz: {
        include: {
          questions: { orderBy: { order: "asc" } },
        },
      },
      answers: {
        include: { question: true },
      },
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Sessione non trovata" },
      { status: 404 },
    );
  }

  // Build a map of questionId -> question for quick lookup
  const questionMap = new Map(
    session.quiz.questions.map((q) => [q.id, q]),
  );

  if (format === "csv") {
    const rows = session.answers.map((a) => {
      const q = questionMap.get(a.questionId);
      return {
        Studente: a.playerName,
        Email: a.playerEmail ?? "",
        Domanda: q?.text ?? "",
        Tipo: questionTypeLabel[q?.type ?? ""] ?? q?.type ?? "",
        Risposta: JSON.stringify(a.value),
        Corretto: a.isCorrect ? "Si" : "No",
        "Tempo (s)": (a.responseTimeMs / 1000).toFixed(1),
        Punteggio: a.score,
      };
    });

    const csv = Papa.unparse(rows);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=sessione-${session.pin}.csv`,
      },
    });
  }

  // PDF format — generate an HTML summary page
  const playerMap = new Map<
    string,
    { score: number; correct: number; total: number }
  >();
  for (const a of session.answers) {
    const entry = playerMap.get(a.playerName) ?? {
      score: 0,
      correct: 0,
      total: 0,
    };
    entry.score += a.score;
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    playerMap.set(a.playerName, entry);
  }
  const leaderboard = [...playerMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.score - a.score);

  const questionStats = session.quiz.questions.map((q, idx) => {
    const qAnswers = session.answers.filter((a) => a.questionId === q.id);
    const correctCount = qAnswers.filter((a) => a.isCorrect).length;
    const totalAnswers = qAnswers.length;
    const pctCorrect =
      totalAnswers > 0 ? ((correctCount / totalAnswers) * 100).toFixed(0) : "N/A";
    const avgTime =
      totalAnswers > 0
        ? (
            qAnswers.reduce((sum, a) => sum + a.responseTimeMs, 0) /
            totalAnswers /
            1000
          ).toFixed(1)
        : "N/A";
    return {
      number: idx + 1,
      text: q.text,
      type: questionTypeLabel[q.type] ?? q.type,
      pctCorrect,
      avgTime,
      totalAnswers,
    };
  });

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <title>Report sessione ${session.pin}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 2rem auto; color: #222; }
    h1 { font-size: 1.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.9rem; }
    th { background: #f5f5f5; }
    .meta { color: #666; margin-bottom: 1rem; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>${session.quiz.title}</h1>
  <p class="meta">PIN: ${session.pin} &middot; Data: ${session.createdAt.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })} &middot; Partecipanti: ${playerMap.size}</p>

  <h2>Classifica</h2>
  <table>
    <thead><tr><th>#</th><th>Giocatore</th><th>Punteggio</th><th>Corrette</th></tr></thead>
    <tbody>
      ${leaderboard.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.score}</td><td>${p.correct}/${p.total}</td></tr>`).join("\n      ")}
    </tbody>
  </table>

  <h2>Dettaglio domande</h2>
  <table>
    <thead><tr><th>#</th><th>Domanda</th><th>Tipo</th><th>% Corrette</th><th>Tempo medio</th></tr></thead>
    <tbody>
      ${questionStats.map((q) => `<tr><td>${q.number}</td><td>${q.text}</td><td>${q.type}</td><td>${q.pctCorrect}${q.pctCorrect !== "N/A" ? "%" : ""}</td><td>${q.avgTime}${q.avgTime !== "N/A" ? "s" : ""}</td></tr>`).join("\n      ")}
    </tbody>
  </table>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename=sessione-${session.pin}.html`,
    },
  });
}
