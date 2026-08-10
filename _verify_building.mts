/**
 * TEMP end-to-end verification of the per-property override save path, using
 * only CSS-free pure modules + REST for the DB round-trip (the exact jsonb the
 * API's saveGuestPage writes). No deploy hook is touched (REST bypasses it).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
const { sharedManualForOverride } = await import("@/lib/page-families");
const { assertSubsetShape } = await import("@/lib/shape-validate");
const { setAtPathCreate, deleteAtPath, getAtPath } = await import("@/lib/json-path");

const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: key, authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const row = async (page: string, lang: string) =>
  (await (await fetch(`${process.env.SUPABASE_URL}/rest/v1/cms_guest_page?select=fields&page=eq.${page}&lang=eq.${lang}`, { headers: H })).json())[0];
const writeFields = async (page: string, lang: string, fields: unknown) =>
  fetch(`${process.env.SUPABASE_URL}/rest/v1/cms_guest_page?page=eq.${page}&lang=eq.${lang}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ fields }),
  });

let pass = 0, fail = 0;
const check = (c: boolean, label: string) => { if (c) pass++; else { fail++; console.log("  ✗", label); } };

// 1. override → shared mapping
check(sharedManualForOverride("hta-manual") === "manuals-ht", "hta-manual maps to manuals-ht");
check(sharedManualForOverride("gka-manual") === "manuals", "gka-manual maps to manuals");
check(sharedManualForOverride("gka-config") === null, "config page is not an override page");

// 2. build a sparse override with the building-sheet helpers + validate vs shared
const shared = (await row("manuals-ht", "en")).fields;
let ov: any = {};
ov = setAtPathCreate(ov, ["arrival", "checkInValue"], "2:00 PM TEST");
ov = setAtPathCreate(ov, ["concierge", "vanPromoTitle"], "TEST PROMO");
check(getAtPath(ov, ["arrival", "checkInValue"]) === "2:00 PM TEST", "nested override built");
try { assertSubsetShape(shared, ov, ""); pass++; } catch (e: any) { fail++; console.log("  ✗ subset-valid:", e.message); }
const reverted = deleteAtPath(ov, ["concierge", "vanPromoTitle"]);
check(!("concierge" in (reverted as any)), "revert prunes empty concierge branch");

// 3. invalid overrides are rejected by the same gate the save uses
const rejects = (bad: unknown) => { try { assertSubsetShape(shared, bad, ""); return false; } catch { return true; } };
check(rejects({ arrival: { bogusKey: "x" } }), "unknown nested key rejected");
check(rejects({ nope: { a: "b" } }), "unknown top-level section rejected");
check(rejects({ arrival: { checkInValue: 5 } }), "type change rejected");

// 4. DB round-trip: the sparse override persists exactly, sibling stays empty, revert cleans up
await writeFields("hta-manual", "en", ov);
const saved = await row("hta-manual", "en");
check(JSON.stringify(saved.fields) === JSON.stringify(ov), "DB stores exactly the sparse override");
check(JSON.stringify((await row("htb-manual", "en")).fields) === "{}", "sibling htb-manual.en untouched");
await writeFields("hta-manual", "en", {});
check(JSON.stringify((await row("hta-manual", "en")).fields) === "{}", "reverted to {} (prod clean)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
