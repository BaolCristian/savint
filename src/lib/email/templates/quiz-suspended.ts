import itMessages from "@/messages/it.json";
import enMessages from "@/messages/en.json";

type Params = { quizTitle: string; reason: string; appealEmail: string };

type Block = {
  subject: string;
  intro: string;
  body: string;
  appeal: string;
  signature: string;
};

function pick(locale: string): Block {
  const m = locale === "en" ? enMessages : itMessages;
  return (m as unknown as { hub: { email: { suspended: Block } } }).hub.email
    .suspended;
}

function format(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export const quizSuspendedTemplate = {
  subject(locale: string): string {
    return pick(locale).subject;
  },
  body(params: Params, locale: string): string {
    const t = pick(locale);
    return [
      t.intro,
      "",
      format(t.body, { title: params.quizTitle, reason: params.reason }),
      "",
      format(t.appeal, { email: params.appealEmail }),
      "",
      t.signature,
    ].join("\n");
  },
};
