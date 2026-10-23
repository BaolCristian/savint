import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { introProva } from "@/lib/esercizi/prova-verifica";
import { ProvaVerificaClient } from "./prova-verifica-client";

// La verifica per lo studente: l'introduzione arriva dal server (quando,
// durata, quanti esercizi, a che punto è), il resto lo fa il client parlando
// con le rotte della prova. Chi non è iscritto, o una verifica ritirata,
// trova un 404: la pagina non conferma che la verifica esista.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/studente");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { id } = await params;
  const intro = await introProva(id, session.user.id);
  if (!intro) notFound();
  const locale = (await getLocale()) === "en" ? "en" : "it";

  return <ProvaVerificaClient compitoId={id} studentId={session.user.id} intro={intro} locale={locale} />;
}
