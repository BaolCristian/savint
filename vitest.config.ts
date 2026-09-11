import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@savint/engine": path.resolve(__dirname, "./packages/engine/src/index.ts"),
      // MathLive pubblica due build. Qui la condizione di risoluzione è
      // "node", che porta alla build SSR: quella senza `MathfieldElement`,
      // cioè senza l'elemento personalizzato che la finestra delle formule
      // è tutta. Nel browser Next sceglie invece la condizione "browser".
      // L'alias punta alla build che vede il docente, così le prove girano
      // sullo stesso codice che sarà servito.
      mathlive: path.resolve(__dirname, "./node_modules/mathlive/mathlive.mjs"),
    },
  },
});
