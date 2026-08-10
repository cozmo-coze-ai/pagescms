/**
 * Live-site preview links. coze_client puts the language code in the path
 * for everything but English (/celebration vs /ko/celebration) — see
 * coze_client/src/pages/[lang]/*.
 */

export const siteBaseUrl = (
  process.env.NEXT_PUBLIC_COZE_CLIENT_SITE_URL || "https://www.coze.care"
).replace(/\/+$/, "");

export const buildPreviewUrl = (path: string, lang: string) =>
  `${siteBaseUrl}${lang === "en" ? "" : `/${lang}`}${path}`;
