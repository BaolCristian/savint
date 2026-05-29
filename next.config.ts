import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// basePath build-time: "" = radice (hub), "/demo" = istanza prova.
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
};

export default withNextIntl(nextConfig);
