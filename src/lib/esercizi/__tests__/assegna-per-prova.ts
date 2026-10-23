import { randomUUID } from "crypto";
import { prisma } from "@/lib/db/client";
import { assegnaCompito } from "../compiti";
import { bloccoDaRegola } from "../estrazione";

/** Per le prove che hanno bisogno di un compito GIÀ DATO (consegne, home
 * dello studente, tentativi, versioni): assegna i blocchi di una batteria
 * di prova a una classe, modo CLASSE, con un seme nuovo.
 *
 * Fino al Task 7 del Nuovo compito queste prove usavano `assegna`
 * (compiti.ts), la vecchia assegnazione di un "compito preparato": tolta
 * con le altre vecchie strade, l'unica assegnazione rimasta è
 * `assegnaCompito`. Qui la batteria è solo il modo comodo, già usato dalle
 * prove, di scrivere una ricetta di blocchi; il compito ha poi la sua
 * batteria automatica, il cui nome viene dalle etichette dei blocchi (il
 * nome della raccolta: le pulizie delle prove che cercano le batterie per
 * prefisso la trovano se la raccolta ha lo stesso prefisso). */
export async function assegnaPerProva(
  batteriaId: string,
  classeId: string,
  teacherId: string,
  date?: { opensAt?: Date; dueAt?: Date },
) {
  const regole = await prisma.batteriaRegola.findMany({ where: { batteriaId }, orderBy: { order: "asc" } });
  return assegnaCompito({
    classeId,
    teacherId,
    blocchi: regole.map(bloccoDaRegola),
    modo: "CLASSE",
    seme: randomUUID(),
    ...date,
  });
}
