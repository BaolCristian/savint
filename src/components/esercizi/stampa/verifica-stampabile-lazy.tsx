"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { VerificaStampabileProps } from "./verifica-stampabile";

/** Come il player: il motore e i contenuti si caricano solo nel browser
 * (`ContenutoHtml` usa `DOMParser`), e la pagina server resta leggera. */
const VerificaStampabile = dynamic(
  () => import("./verifica-stampabile").then((m) => m.VerificaStampabile),
  { ssr: false, loading: () => <Caricamento /> },
);

function Caricamento() {
  const t = useTranslations("esercizi");
  return <p>{t("caricamento")}</p>;
}

export function VerificaStampabileLazy(props: VerificaStampabileProps) {
  return <VerificaStampabile {...props} />;
}
