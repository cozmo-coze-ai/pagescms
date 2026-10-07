import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { applySitePageEdits, sitePageErrors, sitePageFiles, SITE_PAGE_CONFIG, type SitePage } from "../src/site-page-guard.ts";

function fixture(page: SitePage = "about") {
  const config = SITE_PAGE_CONFIG[page];
  const files = new Map<string, string>([
    [config.layout, "---\nconst fixed = true\n---\n<BaseLayout><main>{t.head.title}</main></BaseLayout><style>.hero{gap:24px}</style>"],
    ...(["en", "ko", "ja", "zh"] as const).map(lang => [config.copy[lang],
      `${lang === "en" ? "" : `import type { AboutDict } from './en';\n`}const ${lang}${lang === "en" ? "" : ": AboutDict"} = { head: { title: "${lang} title", lede: "${lang} lede" }, points: [{ label: "${lang} one" }] };\nexport default ${lang};` ] as const),
  ]);
  return { config, files };
}

test("Explore and About us only accept CSS and existing four-language copy values", () => {
  for (const page of ["explore", "about"] as const) {
    const { config, files } = fixture(page);
    const proposed = new Map(files);
    assert.deepEqual(applySitePageEdits(page, proposed, [{ path: config.layout, find: "gap:24px", replace: "gap:16px" }]), []);
    assert.deepEqual(sitePageErrors(page, files, proposed, () => false), []);
    const executable = new Map(files);
    executable.set(config.layout, executable.get(config.layout)!.replace("<main>", "<main onclick=\"alert(1)\">"));
    assert.match(sitePageErrors(page, files, executable, () => false).join("\n"), /markup.*locked/);
    const code = new Map(files);
    code.set(config.copy.en, code.get(config.copy.en)!.replace("head: {", "head: { extra: fetch('https://bad.example'),"));
    assert.ok(sitePageErrors(page, files, code, () => false).length > 0);
    assert.ok(applySitePageEdits(page, new Map(files), [{ path: "src/pages/checkout.ts", content: "unsafe" }]).length > 0);
  }
});

test("English copy changes require matching translations, and keys cannot change", () => {
  const { config, files } = fixture();
  const englishOnly = new Map(files);
  englishOnly.set(config.copy.en, englishOnly.get(config.copy.en)!.replace('"en title"', '"New title"'));
  assert.match(sitePageErrors("about", files, englishOnly, () => false).join("\n"), /translation did not/);
  const renamed = new Map(files);
  renamed.set(config.copy.en, renamed.get(config.copy.en)!.replace("title:", "headline:"));
  assert.match(sitePageErrors("about", files, renamed, () => false).join("\n"), /code, keys and comments must stay unchanged/);
});

test("only existing or attached page-specific CSS images are accepted", () => {
  const { config, files } = fixture("explore");
  const proposed = new Map(files);
  proposed.set(config.layout, proposed.get(config.layout)!.replace("gap:24px", "background:url('/editor-pages/explore/seoul.webp')"));
  assert.match(sitePageErrors("explore", files, proposed, () => false).join("\n"), /does not exist/);
  assert.deepEqual(sitePageErrors("explore", files, proposed, path => path === "/editor-pages/explore/seoul.webp"), []);
  proposed.set(config.layout, proposed.get(config.layout)!.replace("/editor-pages/explore/seoul.webp", "https://outside.example/image.webp"));
  assert.match(sitePageErrors("explore", files, proposed, () => false).join("\n"), /external or executable URLs/);
  proposed.set(config.layout, proposed.get(config.layout)!.replace("https://outside.example/image.webp", "\\75rl('/editor-pages/explore/seoul.webp')"));
  assert.match(sitePageErrors("explore", files, proposed, () => true).join("\n"), /CSS imports, escapes/);
  assert.ok(applySitePageEdits("explore", new Map(files), [{ path: config.layout, find: "", replace: "x" }]).length > 0);
});

const client = new URL("../../../coze_client/src/components/pages/AboutPage.astro", import.meta.url);
test("current COZE page sources pass the same guard", { skip: !existsSync(client) }, async () => {
  for (const page of ["explore", "about"] as const) {
    const files = new Map(await Promise.all(sitePageFiles(page).map(async path => [path, await readFile(new URL(`../../../coze_client/${path}`, import.meta.url), "utf8")] as const)));
    assert.deepEqual(sitePageErrors(page, files, files, () => true), [], page);
  }
});
