// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, middleware, percorsoPrivato } from "@/middleware";

// I formulari delle verifiche stanno sotto public/uploads/privati: la
// cartella public li servirebbe come file statici senza login, quindi il
// middleware li ferma (anche sotto un basePath come /savint o /demo).
const modo = process.env.SAVINT_MODE;
afterEach(() => {
  if (modo === undefined) delete process.env.SAVINT_MODE;
  else process.env.SAVINT_MODE = modo;
});

const esegui = (url: string, basePath?: string) =>
  middleware(new NextRequest(url, basePath ? { nextConfig: { basePath } } : undefined));

const PRIVATI = [
  "/uploads/privati/formulari/x.pdf",
  "/uploads/Privati/formulari/x.pdf",
  "/UPLOADS/privati/formulari/x.pdf",
  "/uploads/./privati/formulari/x.pdf",
  "/uploads//privati/formulari/x.pdf",
  "/uploads/esercizi/../privati/formulari/x.pdf",
  "/uploads/%70rivati/formulari/x.pdf",
];

describe("middleware — caricamenti privati", () => {
  it("percorsoPrivato riconosce le varianti e lascia passare il resto", () => {
    for (const p of PRIVATI) expect(percorsoPrivato(p), p).toBe(true);
    for (const p of ["/uploads/esercizi/x.png", "/api/uploads/esercizi/x.png", "/uploads", "/privati/x", "/hub-login"]) {
      expect(percorsoPrivato(p), p).toBe(false);
    }
  });

  it("il matcher fa girare il middleware su quei percorsi, con e senza basePath", () => {
    for (const basePath of [undefined, "/savint", "/demo"]) {
      for (const p of PRIVATI.slice(0, 3)) {
        const url = `http://x${basePath ?? ""}${p}`;
        expect(unstable_doesMiddlewareMatch({ config, url, nextConfig: basePath ? { basePath } : {} }), url).toBe(true);
      }
    }
  });

  it("percorsi con lettere codificate (%75ploads): il matcher li prende e il middleware dà 404", () => {
    process.env.SAVINT_MODE = "installation";
    for (const basePath of [undefined, "/savint"]) {
      for (const p of ["/%75ploads/privati/formulari/x.pdf", "/%55PLOADS/privati/formulari/x.pdf", "/upl%6Fads/privati/x.pdf"]) {
        const url = `http://x${basePath ?? ""}${p}`;
        expect(unstable_doesMiddlewareMatch({ config, url, nextConfig: basePath ? { basePath } : {} }), url).toBe(true);
        expect(esegui(url, basePath).status, url).toBe(404);
      }
    }
  });

  it("404 per un formulario, in installazione e in hub, anche sotto basePath", async () => {
    for (const m of ["installation", "hub"]) {
      process.env.SAVINT_MODE = m;
      expect(esegui("http://x/uploads/privati/formulari/x.pdf").status).toBe(404);
      expect(esegui("http://x/uploads/Privati/formulari/x.pdf").status).toBe(404);
      expect(esegui("http://x/savint/uploads/privati/formulari/x.pdf", "/savint").status).toBe(404);
      expect(esegui("http://x/demo/uploads/PRIVATI/formulari/x.pdf", "/demo").status).toBe(404);
    }
  });

  it("un'immagine pubblica passa", () => {
    process.env.SAVINT_MODE = "installation";
    const r = esegui("http://x/uploads/esercizi/x.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(esegui("http://x/savint/uploads/esercizi/x.png", "/savint").headers.get("x-middleware-next")).toBe("1");
  });
});

describe("middleware — rotte dell'hub (comportamento invariato)", () => {
  it("in installazione: 404 per le pagine hub, passano le API dell'installazione", () => {
    process.env.SAVINT_MODE = "installation";
    expect(esegui("http://x/hub-login").status).toBe(404);
    expect(esegui("http://x/api/hub/quizzes").status).toBe(404);
    expect(esegui("http://x/api/hub/oauth/start").headers.get("x-middleware-next")).toBe("1");
    expect(esegui("http://x/api/hub/quiz/abc/publish").headers.get("x-middleware-next")).toBe("1");
  });

  it("in hub passa tutto", () => {
    process.env.SAVINT_MODE = "hub";
    expect(esegui("http://x/hub-login").headers.get("x-middleware-next")).toBe("1");
    expect(esegui("http://x/api/hub/quizzes").headers.get("x-middleware-next")).toBe("1");
  });

  it("il matcher copre ancora le rotte hub e non le altre pagine", () => {
    for (const p of ["/hub-login", "/hub-account/x", "/api/hub/quizzes"]) {
      expect(unstable_doesMiddlewareMatch({ config, url: `http://x${p}` }), p).toBe(true);
    }
    expect(unstable_doesMiddlewareMatch({ config, url: "http://x/dashboard" })).toBe(false);
  });
});
