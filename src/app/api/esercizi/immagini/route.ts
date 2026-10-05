import { NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import crypto from "crypto";
import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { CARTELLA_IMMAGINI } from "@/lib/esercizi/immagini";

const MAX_BYTE = 5 * 1024 * 1024;

/** I tipi ammessi, con la loro estensione e i primi byte che un file di quel
 * tipo deve avere. Il tipo dichiarato dal browser non basta: un file HTML
 * rinominato «.png» passerebbe. Niente SVG: può contenere script. */
const TIPI: Record<string, { estensione: string; firma: (b: Uint8Array) => boolean }> = {
  "image/png": { estensione: "png", firma: (b) => inizia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  "image/jpeg": { estensione: "jpg", firma: (b) => inizia(b, [0xff, 0xd8, 0xff]) },
  "image/gif": { estensione: "gif", firma: (b) => inizia(b, [0x47, 0x49, 0x46, 0x38]) },
  "image/webp": {
    estensione: "webp",
    firma: (b) => inizia(b, [0x52, 0x49, 0x46, 0x46]) && inizia(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  },
};

function inizia(b: Uint8Array, firma: number[]): boolean {
  return b.length >= firma.length && firma.every((x, i) => b[i] === x);
}

/** Carica un'immagine per il testo di un esercizio e ne restituisce il SOLO
 * nome (`{ file }`): l'editor lo scrive nel segnaposto `![descrizione](file)`
 * e il player costruisce l'indirizzo con il basePath dell'installazione (vedi
 * src/lib/esercizi/immagini.ts). I file finiscono in public/uploads/esercizi,
 * serviti da /api/uploads come le immagini dei quiz; in Docker la cartella è
 * nel volume persistente `savint-uploads`. */
export async function POST(request: Request) {
  const gate = await requireTeacher();
  if (!gate.ok) return gate.response;

  const teacherId = gate.session.user.id;
  const limite = await checkRateLimit({ key: `esercizi:immagini:${teacherId}`, windowSeconds: 60, max: 30 });
  if (!limite.allowed) {
    return NextResponse.json({ error: "rate_limited" }, {
      status: 429,
      headers: limite.retryAfterSeconds ? { "Retry-After": String(limite.retryAfterSeconds) } : undefined,
    });
  }

  const dati = await request.formData().catch(() => null);
  const file = dati?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file_mancante" }, { status: 400 });

  const tipo = TIPI[file.type];
  if (!tipo) return NextResponse.json({ error: "tipo_non_ammesso" }, { status: 400 });
  if (file.size > MAX_BYTE) return NextResponse.json({ error: "troppo_grande" }, { status: 400 });

  const byte = new Uint8Array(await file.arrayBuffer());
  if (!tipo.firma(byte)) return NextResponse.json({ error: "tipo_non_ammesso" }, { status: 400 });

  const nome = `${crypto.randomUUID()}.${tipo.estensione}`;
  const cartella = join(process.env.APP_ROOT || process.cwd(), "public", "uploads", CARTELLA_IMMAGINI);
  await mkdir(cartella, { recursive: true });
  await writeFile(join(cartella, nome), byte);

  return NextResponse.json({ file: nome }, { status: 201 });
}
