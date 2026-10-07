import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isUiTextPath, normalizePreviewPath, uiPreviewCoverageError, uiTextErrors, uiTranslationErrors } from "../src/ui-guard.ts";

test("the public UI allowlist includes design sources but excludes backend and operational code", () => {
  for (const path of ["src/components/pages/AboutPage.astro", "src/components/pages/LifePage.astro", "src/pages/itineraries/[slug].astro", "src/pages/itineraries/experiences.astro", "src/layouts/BaseLayout.astro", "src/styles/global.css", "platform/components/shell/siteHeader.css", "platform/components/shell/SiteHeader.tsx", "src/i18n/pages/about/en.ts", "src/i18n/pages/life/ko.ts"]) assert.ok(isUiTextPath(path), path);
  for (const path of ["src/pages/api/payments/checkout.ts", "src/pages/checkout.ts", "src/lib/stay/bridge.ts", "platform/app/api/bookings/route.ts", "src/components/pages/HomePageV3.astro", "src/components/pages/BookingPage.astro", "src/components/pages/CommunityPage.astro", "src/styles/stay.css", "src/styles/community.css", "platform/components/stay/StayHomeDetails.tsx", "platform/components/community/CommunityClient.tsx", "src/i18n/pages/contact/en.ts", "src/i18n/pages/community/zh.ts", "src/i18n/pages/booking/en.ts", "src/i18n/pages/home/en.json", "src/i18n/translations/ko.ts", "../../secret.ts", "src/pages/itineraries/new.ts", "src/pages/gk.astro", "src/pages/[lang]/jt.astro", "src/pages/[manual]/[section].astro", "src/components/manual/ArrivalSection.astro"]) assert.ok(!isUiTextPath(path), path);
  assert.equal(normalizePreviewPath("/itineraries/experiences/"), "/itineraries/experiences/");
  assert.throws(() => normalizePreviewPath("/api/payments/"));
  assert.throws(() => normalizePreviewPath("/gk/"));
  assert.throws(() => normalizePreviewPath("/ko/jt/"));
  assert.throws(() => normalizePreviewPath("/stay/gk/"));
  assert.throws(() => normalizePreviewPath("/booking/"));
  assert.throws(() => normalizePreviewPath("/community/"));
  assert.match(uiPreviewCoverageError("src/pages/itineraries/experiences.astro", "/about/", "---\n---")!, /experiences/);
  assert.equal(uiPreviewCoverageError("src/pages/itineraries/experiences.astro", "/itineraries/experiences/", "---\n---"), null);
  assert.match(uiPreviewCoverageError("src/pages/stay.astro", "/stay/", "---\nexport const prerender = false\n---")!, /server-rendered/);
  assert.match(uiPreviewCoverageError("platform/components/stay/StayHomeDetails.tsx", "/stay/gk/", "")!, /safe server-rendered preview/);
});

test("React presentation edits allow static JSX changes but lock booking and payment behavior", () => {
  const path = "platform/components/home/HomeHero.tsx";
  const original = 'import { useState } from "react";\nexport function Details({ price }: { price: number }) { const [open, setOpen] = useState(false); return <main><button onClick={() => setOpen(true)} className="old">Show</button><span>{price}</span></main>; }';
  const redesign = original.replace('<main>', '<main className="editorial"><section>').replace('</main>', '</section></main>').replace('className="old"', 'className="new"').replace('Show', 'See price');
  assert.deepEqual(uiTextErrors(path, original, redesign), []);
  assert.match(uiTextErrors(path, original, redesign.replace('setOpen(true)', 'setOpen(false)')).join("\n"), /event logic|expression attributes/);
  assert.match(uiTextErrors(path, original, redesign.replace('onClick', 'onMouseEnter')).join("\n"), /event handlers|expression attributes/);
  assert.match(uiTextErrors(path, original, redesign.replace('<section>', '<section><iframe src="/evil" />')).join("\n"), /Unsafe JSX tag/);
  assert.match(uiTextErrors(path, original, redesign.replace('<section>', '<section><a href="javascript:alert(1)">Bad</a>')).join("\n"), /executable URLs/);
  assert.match(uiTextErrors(path, original, redesign.replace('className="new"', 'dangerouslySetInnerHTML="bad"')).join("\n"), /component props|event handlers/);
});

test("Astro redesign may change markup and CSS but not frontmatter, expressions or scripts", () => {
  const path = "src/components/pages/AboutPage.astro";
  const original = "---\nconst title = 'About';\n---\n<main><h1>{title}</h1></main><style>.hero{gap:24px}</style><script>const x=1</script>";
  const redesign = original.replace("<main>", "<main class=\"editorial\"><section>").replace("</main>", "</section></main>").replace("gap:24px", "gap:16px");
  assert.deepEqual(uiTextErrors(path, original, redesign), []);
  assert.match(uiTextErrors(path, original, redesign.replace("const title", "fetch('https://x'); const title")).join("\n"), /frontmatter/);
  assert.match(uiTextErrors(path, original, redesign.replace("{title}", "{Astro.request.url}")).join("\n"), /expressions/);
  assert.match(uiTextErrors(path, original, redesign.replace("const x=1", "const x=2")).join("\n"), /Scripts are locked/);
  assert.match(uiTextErrors(path, original, redesign.replace("<section>", "<section onclick=\"alert(1)\">")).join("\n"), /event handlers/);
  assert.match(uiTextErrors(path, original, redesign.replace("<section>", "<section><script src=\"/evil.js\" /></section>")).join("\n"), /executable markup/);
  assert.match(uiTextErrors(path, original, redesign.replace("<section>", "<section><a href=\"&#x6a;avascript:alert(1)\">Click</a>")).join("\n"), /encoded or executable URLs/);
  assert.match(uiTextErrors(path, original, redesign.replace("gap:16px", "background:url(https://evil.example/a.png)")).join("\n"), /external or executable URLs/);
});

test("Git-owned page copy cannot change English alone or alter dictionary code", () => {
  const before = new Map(["en", "ko", "ja", "zh"].map(lang => [`src/i18n/pages/about/${lang}.ts`, `const ${lang} = { title: "${lang} title" };\nexport default ${lang};`]));
  const after = new Map(before);
  after.set("src/i18n/pages/about/en.ts", before.get("src/i18n/pages/about/en.ts")!.replace("en title", "New title"));
  assert.match(uiTranslationErrors(before, after).join("\n"), /translation did not/);
  after.set("src/i18n/pages/about/en.ts", before.get("src/i18n/pages/about/en.ts")!.replace("title:", "headline:"));
  assert.match(uiTranslationErrors(before, after).join("\n"), /code, keys and comments are locked/);
});

test("computed single-language page dictionaries permit display copy but lock helpers and prices", () => {
  const path = "src/i18n/pages/celebration/en.ts";
  const original = 'const proxy = (value: string) => value; const en = { title: "Celebrate", image: { src: proxy("/photo.jpg"), alt: "Party room" }, price: "KRW 800,000" }; export default en;';
  assert.deepEqual(uiTextErrors(path, original, original.replace("Celebrate", "A joyful celebration")), []);
  assert.match(uiTextErrors(path, original, original.replace("KRW 800,000", "KRW 100" )).join("\n"), /prices are locked/);
  assert.match(uiTextErrors(path, original, original.replace("/photo.jpg", "/other.jpg")).join("\n"), /image sources.*locked/);
  assert.match(uiTextErrors(path, original, original.replace("=> value", "=> fetch(value)")).join("\n"), /dictionary code/);
});

const client = new URL("../../../coze_client/src/components/pages/AboutPage.astro", import.meta.url);
test("representative current public UI files pass the unchanged safety gate", { skip: !existsSync(client) }, async () => {
  const paths = ["src/components/pages/AboutPage.astro", "src/components/pages/LifePage.astro", "src/components/SiteHeader.astro", "src/layouts/BaseLayout.astro", "src/pages/itineraries/[slug].astro", "src/pages/itineraries/experiences.astro", "src/styles/global.css", "platform/components/shell/SiteHeader.tsx", "src/i18n/pages/about/en.ts", "src/i18n/pages/life/en.ts"];
  for (const path of paths) {
    const value = await readFile(new URL(`../../../coze_client/${path}`, import.meta.url), "utf8");
    assert.deepEqual(uiTextErrors(path, value, value), [], path);
  }
});

test("all tracked existing public UI files pass the unchanged safety gate", { skip: !existsSync(client) }, async () => {
  const root = fileURLToPath(new URL("../../../coze_client/", import.meta.url));
  const paths = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(isUiTextPath);
  assert.ok(paths.length > 50);
  for (const path of paths) {
    const value = await readFile(new URL(`../../../coze_client/${path}`, import.meta.url), "utf8");
    assert.deepEqual(uiTextErrors(path, value, value), [], path);
  }
});
