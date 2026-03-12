import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";

const SUPPORTED_LOCALES = ["it", "en"];

function detectLocaleFromHeader(acceptLanguage: string | null): string {
  if (!acceptLanguage) return "it";
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return { lang: lang.split("-")[0].toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of preferred) {
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return "it";
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  let locale: string;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headerStore = await headers();
    locale = detectLocaleFromHeader(headerStore.get("accept-language"));
  }

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
