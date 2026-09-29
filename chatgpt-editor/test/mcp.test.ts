import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpResponse, result } from "../src/mcp.ts";

async function rpc(method: string, params = {}, canWrite = true) {
  const calls: string[] = [];
  const request = new Request("https://example.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const response = await mcpResponse(request, async name => { calls.push(name); return { ok: true }; }, canWrite, "<p>Preview</p>", ["https://preview.example.test"]);
  return { body: await response.json() as any, calls, status: response.status };
}
test("MCP exposes working tools and requires literal confirmation", async () => {
  const listed = await rpc("tools/list"); assert.equal(listed.status, 200);
  assert.ok(listed.body.result.tools.some((t: any) => t.name === "prepareHomepagePreview"));
  const preview = listed.body.result.tools.find((t: any) => t.name === "prepareHomepagePreview");
  assert.deepEqual(preview._meta["openai/fileParams"], ["imageFiles"]);
  assert.deepEqual(preview.inputSchema.properties.imageFiles.items.required, ["download_url", "file_id"]);
  const invalid = await rpc("tools/call", { name: "publishHomepage", arguments: { changeId: crypto.randomUUID(), confirmedByUser: false } });
  assert.deepEqual(invalid.calls, []); assert.ok(invalid.body.result?.isError || invalid.body.error);
});
test("read-only scope cannot access mutation tools even by name", async () => {
  const listed = await rpc("tools/list", {}, false);
  assert.ok(!listed.body.result.tools.some((t: any) => t.name === "publishHomepage"));
  const publish = await rpc("tools/call", { name: "publishHomepage", arguments: { changeId: crypto.randomUUID(), confirmedByUser: true } }, false);
  assert.deepEqual(publish.calls, []); assert.ok(publish.body.error || publish.body.result?.isError);
});
test("preview token never appears in model-visible tool fields", () => {
  const output = result({ state: "ready", _viewToken: "private-token" }, true);
  assert.equal(output._meta?.viewToken, "private-token");
  assert.ok(!JSON.stringify(output.content).includes("private-token"));
  assert.ok(!JSON.stringify(output.structuredContent).includes("private-token"));
  assert.equal(result({ _viewToken: "private-token" })._meta, undefined);
});
test("component acknowledgement is app-only and uses an actual HTML resource", async () => {
  const listed = await rpc("tools/list");
  const tool = listed.body.result.tools.find((t: any) => t.name === "markPreviewViewed");
  assert.deepEqual(tool._meta.ui.visibility, ["app"]);
  const show = listed.body.result.tools.find((t: any) => t.name === "showHomepagePreview");
  const resource = await rpc("resources/read", { uri: show._meta.ui.resourceUri });
  assert.equal(resource.body.result.contents[0].mimeType, "text/html;profile=mcp-app");
});
