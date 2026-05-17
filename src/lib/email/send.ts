import { getMailerTransport } from "./mailer-config";

type Locale = "it" | "en";

interface VerifyResetArgs {
  to: string;
  link: string;
  locale: Locale;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const VERIFY_SUBJECTS: Record<Locale, string> = {
  it: "Conferma il tuo indirizzo email su savint.it",
  en: "Confirm your email address on savint.it",
};

const VERIFY_BODY_INTRO: Record<Locale, string> = {
  it: "Benvenuto su savint.it. Conferma il tuo indirizzo email cliccando sul link qui sotto (scade entro 24 ore):",
  en: "Welcome to savint.it. Confirm your email address by clicking the link below (expires in 24 hours):",
};

const RESET_SUBJECTS: Record<Locale, string> = {
  it: "Reimposta la tua password su savint.it",
  en: "Reset your password on savint.it",
};

const RESET_BODY_INTRO: Record<Locale, string> = {
  it: "Hai richiesto di reimpostare la password. Clicca sul link qui sotto entro 24 ore:",
  en: "You requested a password reset. Click the link below within 24 hours:",
};

function getFrom(): string {
  const from = process.env.HUB_EMAIL_FROM;
  if (!from) throw new Error("HUB_EMAIL_FROM is not set");
  return from;
}

function htmlTemplate(intro: string, link: string, locale: Locale): string {
  const linkLabel = locale === "it" ? "Apri il link" : "Open link";
  return `<!doctype html><html><body style="font-family:sans-serif;line-height:1.5">
<p>${intro}</p>
<p><a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${linkLabel}</a></p>
<p style="color:#666;font-size:12px">${link}</p>
</body></html>`;
}

/**
 * Generic email send (used by Plan 5 moderation templates).
 * Per integration contract §6.
 */
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const transport = getMailerTransport();
  await transport.sendMail({
    from: getFrom(),
    to: args.to,
    subject: args.subject,
    text: args.text,
    html: args.html,
  });
}

export async function sendVerificationEmail({ to, link, locale }: VerifyResetArgs): Promise<void> {
  await sendEmail({
    to,
    subject: VERIFY_SUBJECTS[locale],
    text: `${VERIFY_BODY_INTRO[locale]}\n\n${link}\n`,
    html: htmlTemplate(VERIFY_BODY_INTRO[locale], link, locale),
  });
}

export async function sendPasswordResetEmail({ to, link, locale }: VerifyResetArgs): Promise<void> {
  await sendEmail({
    to,
    subject: RESET_SUBJECTS[locale],
    text: `${RESET_BODY_INTRO[locale]}\n\n${link}\n`,
    html: htmlTemplate(RESET_BODY_INTRO[locale], link, locale),
  });
}
