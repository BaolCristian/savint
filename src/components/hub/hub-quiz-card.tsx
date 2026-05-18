import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export type HubQuizCardItem = {
  id: string;
  title: string;
  description: string | null;
  author: string;
  schoolLevel: string | null;
  subject: string | null;
  language: string | null;
  downloadsCount: number;
  playsCount: number;
};

export function HubQuizCard({ item }: { item: HubQuizCardItem }) {
  const t = useTranslations("hub");

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/q/${item.id}`}
          className="text-base font-semibold text-slate-900 hover:underline line-clamp-2"
        >
          {item.title}
        </Link>
        {item.language && (
          <Badge variant="outline" className="shrink-0 text-xs uppercase">
            {item.language}
          </Badge>
        )}
      </div>

      {item.description && (
        <p className="text-sm text-slate-600 line-clamp-2">{item.description}</p>
      )}

      <div className="flex flex-wrap gap-1 text-xs text-slate-500">
        <span>{t("by", { author: item.author })}</span>
        {item.schoolLevel && <span>· {item.schoolLevel}</span>}
        {item.subject && <span>· {item.subject}</span>}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
        <span>{t("downloads", { count: item.downloadsCount })}</span>
        <span>{t("plays", { count: item.playsCount })}</span>
      </div>

      <div className="flex gap-2 mt-2">
        <Link
          href={`/q/${item.id}`}
          className={buttonVariants({ size: "sm" })}
        >
          {t("tryNow")}
        </Link>
      </div>
    </div>
  );
}
