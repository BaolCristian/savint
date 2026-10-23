import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { extname, join } from "path";
import crypto from "crypto";

// Il formulario di una verifica: un PDF o un'immagine che il docente carica
// e che durante la prova vede solo chi ne ha diritto. Per questo NON sta fra
// i caricamenti pubblici: vive in public/uploads/privati/formulari (dentro
// il volume Docker `savint-uploads`, quindi sopravvive ai rilasci), ma
// /api/uploads non serve mai la cartella `privati`.

/** Il nome di un formulario: SOLO quelli generati da `salvaFormulario` (un
 * UUID più l'estensione di un tipo ammesso). Niente percorsi. */
export const NOME_FILE_FORMULARIO = /^[0-9a-f-]{36}\.(?:png|jpg|webp|pdf)$/;

const MAX_BYTE = 10 * 1024 * 1024;

function inizia(b: Uint8Array, firma: number[]): boolean {
  return b.length >= firma.length && firma.every((x, i) => b[i] === x);
}

/** I tipi ammessi con la loro estensione e i primi byte che un file di quel
 * tipo deve avere: il tipo dichiarato dal browser non basta (un HTML
 * rinominato «.pdf» passerebbe), come per le immagini degli esercizi. */
const TIPI: Record<string, { estensione: string; firma: (b: Uint8Array) => boolean }> = {
  "image/png": { estensione: "png", firma: (b) => inizia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  "image/jpeg": { estensione: "jpg", firma: (b) => inizia(b, [0xff, 0xd8, 0xff]) },
  "image/webp": {
    estensione: "webp",
    firma: (b) => inizia(b, [0x52, 0x49, 0x46, 0x46]) && inizia(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
  // "%PDF-"
  "application/pdf": { estensione: "pdf", firma: (b) => inizia(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
};

const TIPO_DA_ESTENSIONE: Record<string, string> = Object.fromEntries(
  Object.entries(TIPI).map(([tipo, { estensione }]) => [`.${estensione}`, tipo]),
);

/** La cartella dei formulari, letta a ogni chiamata (APP_ROOT per pm2 e
 * Docker, come la rotta /api/uploads). */
export function cartellaFormulari(): string {
  return join(process.env.APP_ROOT || process.cwd(), "public", "uploads", "privati", "formulari");
}

/** Salva un formulario caricato e ne restituisce il SOLO nome. */
export async function salvaFormulario(
  file: File,
): Promise<{ ok: true; file: string } | { ok: false; motivo: "tipo_non_ammesso" | "troppo_grande" }> {
  const tipo = TIPI[file.type];
  if (!tipo) return { ok: false, motivo: "tipo_non_ammesso" };
  if (file.size > MAX_BYTE) return { ok: false, motivo: "troppo_grande" };

  const byte = new Uint8Array(await file.arrayBuffer());
  if (!tipo.firma(byte)) return { ok: false, motivo: "tipo_non_ammesso" };

  const nome = `${crypto.randomUUID()}.${tipo.estensione}`;
  const cartella = cartellaFormulari();
  await mkdir(cartella, { recursive: true });
  await writeFile(join(cartella, nome), byte);
  return { ok: true, file: nome };
}

/** I byte e il tipo di un formulario; `null` se il nome non è di quelli
 * generati qui o se il file non c'è. */
export async function leggiFormulario(nome: string): Promise<{ byte: Uint8Array; tipo: string } | null> {
  if (!NOME_FILE_FORMULARIO.test(nome)) return null;
  const tipo = TIPO_DA_ESTENSIONE[extname(nome)];
  if (!tipo) return null;
  try {
    return { byte: new Uint8Array(await readFile(join(cartellaFormulari(), nome))), tipo };
  } catch {
    return null;
  }
}

/** Esiste un formulario con quel nome? Solo i nomi generati qui, e senza
 * leggere il file (fino a 10 MB): basta che ci sia e che sia un file. */
export async function esisteFormulario(nome: string): Promise<boolean> {
  if (!NOME_FILE_FORMULARIO.test(nome)) return false;
  try {
    return (await stat(join(cartellaFormulari(), nome))).isFile();
  } catch {
    return false;
  }
}
