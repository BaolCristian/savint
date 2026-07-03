import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { join } from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// basePath build-time: "" = radice (hub), "/demo" = istanza prova.
const basePath = process.env.BASE_PATH || "";

// Versione (da package.json) e data di build, inlined nel bundle: mostrate
// nel footer (SiteFooter). La data corrisponde al momento del build/deploy.
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
const buildDate = new Date().toISOString().slice(0, 10);

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_BUILD_DATE: buildDate,
  },
};

export default withNextIntl(nextConfig);
