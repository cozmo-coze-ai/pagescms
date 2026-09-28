// node --test --experimental-strip-types lib/homepage-guard.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyEdits, homepageErrors, HOME_COPY_FILES, HOME_LANGS, HOME_PAGE_FILE, imageInfo, isEditablePath, summarizeChange, type HomeLang,
} from "./homepage-guard.ts";

const copy = (heading: string, price = "₩500,000") => ({
  hero: { heading, body: "Hello <strong>{name}</strong>" },
  journey: { steps: ["a", "b"], peopleBody: "people", reasons: [{ title: "x" }, { title: "y" }] },
  legal: { company: "COZE Co." },
  nav: { home: "Home" },
  van: { staria: { price, overtime: "+₩50,000/h" }, county: { price: "₩800,000", overtime: "+₩100,000/h" }, fine: { surcharge: { amount: "+₩100,000" } } },
});
const page = `---
import BaseLayout from '../../layouts/BaseLayout.astro'
import { getHomeDict } from '../../i18n/pages/home'
---
<BaseLayout><main><img src="/kelly/living-room.jpg" /></main></BaseLayout>
<style>.a{color:red}</style>
`;

function files(mutate?: (dicts: Record<HomeLang, ReturnType<typeof copy>>) => void, source = page) {
  const dicts = Object.fromEntries(HOME_LANGS.map((lang) => [lang, copy(`Welcome ${lang}`)])) as Record<HomeLang, ReturnType<typeof copy>>;
  mutate?.(dicts);
  const map = new Map<string, string>([[HOME_PAGE_FILE, source]]);
  for (const lang of HOME_LANGS) map.set(HOME_COPY_FILES[lang], JSON.stringify(dicts[lang], null, 2));
  return map;
}
const base = files();
const check = (next: Map<string, string>, images: string[] = []) => homepageErrors(base, next, (path) => images.includes(path));

test("a clean change passes", () => {
  assert.deepEqual(check(files((d) => { for (const lang of HOME_LANGS) d[lang].hero.heading = `New ${lang}`; })), []);
});

test("rejects drift between languages", () => {
  assert.match(check(files((d) => { delete (d.ko.hero as Partial<typeof d.ko.hero>).body; })).join(), /ko\.json hero\.body: missing/);
  assert.match(check(files((d) => { (d.en.hero as Record<string, string>).extra = "x"; })).join(), /hero\.extra/);
  assert.match(check(files((d) => { d.ja.journey.reasons.pop(); })).join(), /list has 1 items/);
  assert.match(check(files((d) => { d.zh.hero.body = "你好 {name}"; })).join(), /HTML tags differ/);
  assert.match(check(files((d) => { d.ko.hero.body = "<strong>안녕</strong>"; })).join(), /placeholders\} differ/);
});

test("English never moves alone", () => {
  assert.match(check(files((d) => { d.en.hero.heading = "Changed"; })).join(), /ko\.json hero\.heading: English changed/);
  // A string that was identical in every language (a brand name) may change with English only.
  const brand = files((d) => { for (const lang of HOME_LANGS) d[lang].journey.reasons[0].title = "COZE"; });
  const next = new Map(brand);
  const en = JSON.parse(next.get(HOME_COPY_FILES.en) ?? "{}");
  en.journey.reasons[0].title = "COZE Hospitality";
  next.set(HOME_COPY_FILES.en, JSON.stringify(en));
  assert.deepEqual(homepageErrors(brand, next, () => true), []);
});

test("rejects price mismatches and shared-copy edits", () => {
  assert.match(check(files((d) => { d.ja.van.staria.price = "₩550,000"; })).join(), /van\.staria\.price/);
  assert.match(check(files((d) => { for (const lang of HOME_LANGS) d[lang].legal.company = "Other"; })).join(), /legal is shared/);
  assert.match(check(files((d) => { for (const lang of HOME_LANGS) d[lang].nav.home = "Start"; })).join(), /nav is shared/);
  assert.match(check(files((d) => { for (const lang of HOME_LANGS) d[lang].journey.peopleBody = "new"; })).join(), /journey\.peopleBody is shared/);
});

test("rejects unsafe or broken layout", () => {
  const cases: [string, RegExp][] = [
    [page.replace("<main>", "<main set:html={x}>"), /set:html/],
    [page.replace("<main>", '<script src="https://x.example/a.js"></script><main>'), /scripts are not allowed/],
    [page.replace("---\n", "---\nimport fs from 'node:fs'\n"), /not allowed/],
    [page.replace("---\n", "---\nconst fs = await import('node:fs')\n"), /dynamic imports|frontmatter/],
    [page.replace("---\n", "---\nimport q from '../../../platform/lib/stay/quote'\n"), /outside the allowed folders/],
    [page.replace("<main>", "<main data-x={process.env.X}>"), /environment variables/],
    [page.replace("<main>", "<main data-x={process['env'].X}>"), /environment variables/],
    [page.replace("<main>", "<main>{globalThis['fetch']('https:\/\/example.com')}</main>"), /data expressions|external URLs/],
    [page.replace("<main>", "<main>Untranslated visible text"), /Visible homepage text/],
    [page.replace("<main>", "<main onmouseover=\"alert(1)\">"), /event-handler/],
    [page.replace("color:red", "background:url(https://example.com/pixel)"), /external URLs/],
    [page.replaceAll("BaseLayout", "Layout"), /BaseLayout/],
    [page.slice(4), /frontmatter/],
    [page.replace("/kelly/living-room.jpg", "/home/new.jpg"), /does not exist/],
  ];
  for (const [source, error] of cases) assert.match(check(files(undefined, source)).join(), error);
  assert.deepEqual(check(files(undefined, page.replace("/kelly/living-room.jpg", "/home/new.jpg")), ["/home/new.jpg"]), []);
});

test("reports invalid JSON", () => {
  const next = files();
  next.set(HOME_COPY_FILES.ko, "{ nope");
  assert.match(check(next).join(), /ko\.json is not valid JSON/);
});

test("find/replace must match exactly once and stay in the allowlist", () => {
  const next = new Map(base);
  assert.deepEqual(applyEdits(next, [{ path: HOME_PAGE_FILE, find: "color:red", replace: "color:blue" }]), []);
  assert.match(next.get(HOME_PAGE_FILE) ?? "", /color:blue/);
  assert.match(applyEdits(next, [{ path: HOME_PAGE_FILE, find: "missing", replace: "x" }]).join(), /occurs 0 times/);
  assert.match(applyEdits(next, [{ path: HOME_PAGE_FILE, find: "BaseLayout", replace: "x" }]).join(), /occurs 4 times/);
  assert.match(applyEdits(next, [{ path: "src/pages/api/stay/quote.ts", content: "x" }]).join(), /not an editable/);
  assert.equal(applyEdits(next, [{ path: HOME_PAGE_FILE, find: "color:blue", replace: "$&$&" }]).length, 0);
  assert.match(next.get(HOME_PAGE_FILE) ?? "", /\$&\$&/);
});

test("path allowlist", () => {
  assert.ok(isEditablePath("public/home/hero-2.webp"));
  assert.ok(!isEditablePath("public/home/../og/x.jpg"));
  assert.ok(!isEditablePath("public/home/Hero.JPG"));
  assert.ok(!isEditablePath("src/layouts/BaseLayout.astro"));
});

test("image headers", () => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 1200);
  new DataView(png.buffer).setUint32(20, 800);
  assert.deepEqual(imageInfo(png), { type: "png", width: 1200, height: 800 });
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x02, 0x58, 0x03]);
  assert.deepEqual(imageInfo(jpeg), { type: "jpeg", width: 600, height: 400 });
  assert.equal(imageInfo(new TextEncoder().encode("<svg onload=alert(1)>")), null);
});

test("summary lists text, layout and image changes for the designer", () => {
  const next = files((d) => { for (const lang of HOME_LANGS) d[lang].hero.heading = `New ${lang}`; }, page.replace("color:red", "color:blue"));
  const summary = summarizeChange(base, next, ["/home/new.webp"]);
  assert.deepEqual(summary.textChanges, [{ key: "hero.heading", before: "Welcome en", after: "New en" }]);
  assert.deepEqual(summary.languagesUpdated, ["en", "ko", "ja", "zh"]);
  assert.deepEqual(summary.layout, { linesAdded: 1, linesRemoved: 1 });
  assert.deepEqual(summary.newImages, ["/home/new.webp"]);
});
