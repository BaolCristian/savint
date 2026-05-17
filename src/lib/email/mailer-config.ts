import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function getMailerTransport(): Transporter {
  if (cached) return cached;
  const host = process.env.HUB_SMTP_HOST;
  if (!host) {
    throw new Error("HUB_SMTP_HOST is not set; cannot send email in hub mode");
  }
  const port = Number(process.env.HUB_SMTP_PORT ?? 587);
  const secure = (process.env.HUB_SMTP_SECURE ?? "false").toLowerCase() === "true";
  const user = process.env.HUB_SMTP_USER;
  const pass = process.env.HUB_SMTP_PASS;
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });
  return cached;
}

export function resetMailerCacheForTests() {
  cached = null;
}
