"use client";

import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface QuestionErrorPoint {
  label: string;
  pctWrong: number;
  pctCorrect: number;
}

interface SessionStatsChartsProps {
  scoreDistribution: ScoreBucket[];
  questionsByError: QuestionErrorPoint[];
}

function barColor(pctCorrect: number): string {
  if (pctCorrect < 30) return "#ef4444";
  if (pctCorrect < 60) return "#f59e0b";
  return "#22c55e";
}

export function SessionStatsCharts({
  scoreDistribution,
  questionsByError,
}: SessionStatsChartsProps) {
  const t = useTranslations("sessions");

  return (
    <>
      {/* Score distribution histogram */}
      {scoreDistribution.length > 0 && (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={scoreDistribution} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={30} />
            <Tooltip
              formatter={(value) => [value, t("studentCount")]}
              contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
            />
            <Bar dataKey="count" name={t("studentCount")} fill="#6366f1" radius={[4, 4, 0, 0]}>
              {scoreDistribution.map((_entry, index) => (
                <Cell key={index} fill="#6366f1" fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Questions ranked by error rate */}
      {questionsByError.length > 0 && (
        <ResponsiveContainer width="100%" height={Math.max(260, questionsByError.length * 36)}>
          <BarChart
            data={questionsByError}
            layout="vertical"
            margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              type="category"
              dataKey="label"
              width={50}
              tick={{ fontSize: 12 }}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(1)}%`, t("pctCorrect")]}
              contentStyle={{ borderRadius: "8px", fontSize: "13px" }}
            />
            <Bar dataKey="pctCorrect" name={t("pctCorrect")} radius={[0, 4, 4, 0]}>
              {questionsByError.map((entry, index) => (
                <Cell key={index} fill={barColor(entry.pctCorrect)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {scoreDistribution.length === 0 && questionsByError.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">{t("noParticipants")}</p>
      )}
    </>
  );
}
