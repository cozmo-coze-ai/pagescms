import assert from "node:assert/strict";
import test from "node:test";
import { buildState, selectProductionBuild } from "./cloudflare-deploy-status.ts";
test("status ignores preview builds and builds before the content save", () => {
  const selected = selectProductionBuild([
    { build_uuid: "preview", trigger_uuid: "preview-trigger", created_on: "2026-09-29T02:02:00Z", build_outcome: "success" },
    { build_uuid: "old", trigger_uuid: "production", created_on: "2026-09-29T01:00:00Z", build_outcome: "success" },
    { build_uuid: "just-before-save", trigger_uuid: "production", created_on: "2026-09-29T01:59:59Z", build_outcome: "success" },
    { build_uuid: "current", trigger: { trigger_uuid: "production" }, created_on: "2026-09-29T02:00:01Z", build_outcome: null },
  ], new Date("2026-09-29T02:00:00Z"), "production");
  assert.equal(selected?.build_uuid, "current");
  assert.equal(buildState(selected!), "BUILDING");
  assert.equal(selectProductionBuild([
    { build_uuid: "just-before-save", trigger_uuid: "production", created_on: "2026-09-29T01:59:59Z", build_outcome: "success" },
  ], new Date("2026-09-29T02:00:00Z"), "production"), undefined);
});
test("reports actual build outcomes without a success timer", () => {
  const base = { build_uuid: "build", created_on: "2026-09-29T02:00:01Z" };
  assert.equal(buildState({ ...base, build_outcome: "success" }), "READY");
  assert.equal(buildState({ ...base, build_outcome: "failure" }), "ERROR");
  assert.equal(buildState({ ...base, build_outcome: "cancelled" }), "CANCELED");
});
