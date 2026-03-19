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
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Score distribution histogram */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("scoreDistribution")}</h3>
        {scoreDistribution.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noParticipants")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={scoreDistribution} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip
                formatter={(value) => [value, t("studentCount")]}
              />
              <Bar dataKey="count" name={t("studentCount")} fill="#6366f1" radius={[4, 4, 0, 0]}>
                {scoreDistribution.map((_entry, index) => (
                  <Cell key={index} fill="#6366f1" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Questions ranked by error rate */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t("questionsByError")}</h3>
        {questionsByError.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noParticipants")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, questionsByError.length * 40)}>
            <BarChart
              data={questionsByError}
              layout="vertical"
              margin={{ left: 20, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} unit="%" />
              <YAxis
                type="category"
                dataKey="label"
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(1)}%`, t("pctCorrect")]}
              />
              <Bar dataKey="pctCorrect" name={t("pctCorrect")} radius={[0, 4, 4, 0]}>
                {questionsByError.map((entry, index) => (
                  <Cell key={index} fill={barColor(entry.pctCorrect)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
