import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Una suite alla volta sul database di sviluppo: vedi il commento in
    // testa a `tests/global-setup.ts` per la misura che lo motiva.
    globalSetup: ["./tests/global-setup.ts"],
    // I test differenziali contro il runtime Numbas sono lenti (bundle da
    // 1,6 MB in jsdom): girano a parte, con `npm run test:engine:diff`.
    exclude: [
      "tests/e2e/**",
      "**/node_modules/**",
      ".worktrees/**",
      ".claire/**",
      ".numbas-upstream/**",
      "packages/engine/test/differential/**",
    ],
    alias: {
      // MathLive pubblica due build. Qui la condizione di risoluzione è
      // "node", che porta alla build SSR: quella senza `MathfieldElement`,
      // cioè senza l'elemento personalizzato che la finestra delle formule
      // è tutta (la build SSR esporta solo le funzioni di conversione).
      // Nel browser Next sceglie la condizione "browser", e in produzione
      // la sua diramazione "production": `mathlive.min.mjs`, che è la
      // stessa build a cui punta questo alias — le prove girano sul codice
      // che sarà servito al docente.
      //
      // Sta fra le opzioni di prova e non in `resolve.alias` perché è una
      // faccenda della sola suite: il pacchetto servito risolve `mathlive`
      // dalla mappa `exports`, da solo e bene.
      mathlive: path.resolve(__dirname, "./node_modules/mathlive/mathlive.min.mjs"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@savint/engine": path.resolve(__dirname, "./packages/engine/src/index.ts"),
    },
  },
});
