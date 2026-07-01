import { sendEmail } from "@/lib/email/send";

export async function sendAffiliationVerifyEmail({ to, link }: { to: string; link: string }) {
  await sendEmail({ to, subject: "Conferma la richiesta di affiliazione a savint.it",
    text: `Conferma la tua richiesta di affiliazione: ${link}\n\nSe non hai richiesto tu, ignora questa email.` });
}
export async function sendAffiliationCodeEmail({ to, schoolName, setupCode }: { to: string; schoolName: string; setupCode: string }) {
  await sendEmail({ to, subject: "Affiliazione approvata — il tuo codice di setup",
    text: `La richiesta di ${schoolName} è stata approvata.\n\nCodice di setup (valido 72h, monouso):\n\n${setupCode}\n\nIncollalo nella tua installazione, pagina "Collega a savint.it".` });
}
export async function sendAffiliationRejectEmail({ to, schoolName, reason }: { to: string; schoolName: string; reason?: string }) {
  await sendEmail({ to, subject: "Richiesta di affiliazione non approvata",
    text: `La richiesta di ${schoolName} non è stata approvata.${reason ? `\n\nMotivo: ${reason}` : ""}` });
}
